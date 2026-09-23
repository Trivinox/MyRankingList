import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOM_CODE_ALPHABET } from './roomCode.ts';
import { MISS_WINDOW_MS, createSignalingServer } from './server.ts';
import type { SignalingOptions } from './server.ts';

const ORIGIN = 'https://myrankinglist.example';

type Message = { type: string; src?: string; dst?: string; payload?: unknown };

const running: ReturnType<typeof createSignalingServer>[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

async function start(options: Partial<SignalingOptions> = {}) {
  const server = createSignalingServer({ allowedOrigin: ORIGIN, proxies: 0, ...options });
  running.push(server);
  const port = await server.listen(0);
  return { port, base: `http://127.0.0.1:${port}` };
}

// Speaks peer's protocol the way the PeerJS client does, minus the WebRTC.
async function connect(port: number) {
  const id = randomUUID();
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/peerjs?key=peerjs&id=${id}&token=${randomUUID()}`,
  );
  const inbox: Message[] = [];
  socket.addEventListener('message', (event) => inbox.push(JSON.parse(String(event.data))));

  const peer = {
    id,
    socket,
    send(message: Omit<Message, 'src'>) {
      socket.send(JSON.stringify(message));
    },
    // Messages arrive in order but not on cue, so wait for the one wanted.
    receive(type: string) {
      return vi.waitFor(() => {
        const index = inbox.findIndex((message) => message.type === type);
        if (index === -1) throw new Error(`no ${type} yet`);
        return inbox.splice(index, 1)[0];
      });
    },
  };
  await peer.receive('OPEN');
  return peer;
}

function openRoom(base: string, peerId: string) {
  return fetch(`${base}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peerId }),
  });
}

async function hostRoom(port: number, base: string) {
  const host = await connect(port);
  const { code } = await (await openRoom(base, host.id)).json();
  return { host, code: code as string };
}

function lookup(base: string, code: string, forwardedFor?: string) {
  const headers: Record<string, string> = forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {};
  return fetch(`${base}/rooms/${code}`, { headers });
}

function spelling(...codes: string[]) {
  const indexes = codes.flatMap((code) =>
    [...code].map((char) => ROOM_CODE_ALPHABET.indexOf(char)),
  );
  return () => indexes.shift() ?? 0;
}

describe('relay', () => {
  it('passes offers, answers and candidates between two peers unchanged', async () => {
    const { port } = await start();
    const a = await connect(port);
    const b = await connect(port);

    const steps = [
      [a, b, 'OFFER', { sdp: { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\n' } }],
      [b, a, 'ANSWER', { sdp: { type: 'answer', sdp: 'v=0\r\no=- 3 4 IN IP4 0.0.0.0\r\n' } }],
      [a, b, 'CANDIDATE', { candidate: 'candidate:1 1 udp 1 10.0.0.1 5000 typ host' }],
      [b, a, 'CANDIDATE', { candidate: 'candidate:2 1 udp 1 10.0.0.2 6000 typ host' }],
    ] as const;

    for (const [from, to, type, payload] of steps) {
      from.send({ type, dst: to.id, payload });
      expect(await to.receive(type)).toEqual({ type, src: from.id, dst: to.id, payload });
    }
  });

  it('keeps going after a message that is not JSON', async () => {
    const { port } = await start();
    const a = await connect(port);
    const b = await connect(port);

    a.socket.send('not json');
    a.send({ type: 'OFFER', dst: b.id, payload: 'still here' });
    expect(await b.receive('OFFER')).toMatchObject({ src: a.id, payload: 'still here' });
  });
});

describe('POST /rooms', () => {
  it('gives a connected host a code that resolves to it, typed in any case', async () => {
    const { port, base } = await start();
    const host = await connect(port);

    const response = await openRoom(base, host.id);
    expect(response.status).toBe(201);
    const { code } = await response.json();
    expect(code).toHaveLength(4);
    for (const char of code) expect(ROOM_CODE_ALPHABET).toContain(char);

    for (const typed of [code, code.toLowerCase()]) {
      const found = await lookup(base, typed);
      expect(found.status).toBe(200);
      expect(await found.json()).toEqual({ peerId: host.id });
    }
  });

  it('gives two hosts two codes', async () => {
    const { port, base } = await start();
    const first = await hostRoom(port, base);
    const second = await hostRoom(port, base);
    expect(first.code).not.toBe(second.code);
  });

  it('draws again when the code is already taken', async () => {
    const { port, base } = await start({ pick: spelling('AB3K', 'AB3K', 'MN72') });
    const first = await hostRoom(port, base);
    const second = await hostRoom(port, base);
    expect([first.code, second.code]).toEqual(['AB3K', 'MN72']);
    expect(await (await lookup(base, 'MN72')).json()).toEqual({ peerId: second.host.id });
  });

  it('refuses a peer ID that is not connected', async () => {
    const { base } = await start();
    expect((await openRoom(base, randomUUID())).status).toBe(409);
  });
});

describe('release', () => {
  it('frees the code once the host disconnects', async () => {
    const { port, base } = await start();
    const { host, code } = await hostRoom(port, base);

    host.socket.close();
    await vi.waitFor(async () => {
      expect((await lookup(base, code)).status).toBe(404);
    });
  });
});

describe('rate limit', () => {
  it('turns every lookup away after ten wrong codes, until the window ends', async () => {
    let time = Date.now();
    const { port, base } = await start({ now: () => time });
    const { code } = await hostRoom(port, base);

    // A code of the wrong shape is a miss like any other.
    for (const wrong of ['ZZZZ', '0000', 'toolong', ...Array(7).fill('XXXX')]) {
      expect((await lookup(base, wrong)).status).toBe(404);
    }

    const blocked = await lookup(base, code);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe(String(MISS_WINDOW_MS / 1000));

    time += MISS_WINDOW_MS;
    expect((await lookup(base, code)).status).toBe(200);
  });

  it('tells clients apart by the address the proxy forwards', async () => {
    const { port, base } = await start({ proxies: 1 });
    const { code } = await hostRoom(port, base);

    for (let i = 0; i < 10; i++) await lookup(base, 'ZZZZ', '203.0.113.1');
    expect((await lookup(base, code, '203.0.113.1')).status).toBe(429);
    expect((await lookup(base, code, '203.0.113.2')).status).toBe(200);
    // The client can write anything in front of the entry the proxy appends.
    expect((await lookup(base, code, '198.51.100.7, 203.0.113.1')).status).toBe(429);
  });
});

describe('CORS', () => {
  it('lets the app read /rooms and passes the preflight for the JSON POST', async () => {
    const { base } = await start();

    const preflight = await fetch(`${base}/rooms`, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(preflight.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'content-type',
    );

    const miss = await fetch(`${base}/rooms/ZZZZ`, { headers: { Origin: ORIGIN } });
    expect(miss.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it("lets the app fetch a peer ID from peer's own route, and the ID is a UUID", async () => {
    const { base } = await start();
    const response = await fetch(`${base}/peerjs/id`, { headers: { Origin: ORIGIN } });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await response.text()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
