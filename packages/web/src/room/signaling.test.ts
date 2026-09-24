import { describe, expect, it, vi } from 'vitest';
import { GOOGLE_STUN, createSignaling } from './signaling.ts';

const BASE = 'http://signaling.test';

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const empty = (status: number, headers?: HeadersInit) => new Response(null, { status, headers });

function answering(response: Response | (() => Promise<Response>)) {
  const fetcher = vi.fn(
    typeof response === 'function' ? response : () => Promise.resolve(response),
  );
  return { fetcher, signaling: createSignaling(BASE, fetcher) };
}

describe('openRoom', () => {
  it('returns the code the server hands out', async () => {
    const { signaling } = answering(json({ code: 'AB3K' }, 201));

    expect(await signaling.openRoom('peer-1')).toEqual({ kind: 'opened', code: 'AB3K' });
  });

  it('posts the peer ID as JSON', async () => {
    const { fetcher, signaling } = answering(json({ code: 'AB3K' }, 201));

    await signaling.openRoom('peer-1');

    expect(fetcher).toHaveBeenCalledWith(`${BASE}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerId: 'peer-1' }),
    });
  });

  it('is refused when the peer is not connected or no code is free', async () => {
    expect(await answering(empty(409)).signaling.openRoom('peer-1')).toEqual({ kind: 'refused' });
    expect(await answering(empty(503)).signaling.openRoom('peer-1')).toEqual({ kind: 'refused' });
  });

  it('cannot reach the server when the request fails', async () => {
    const { signaling } = answering(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(await signaling.openRoom('peer-1')).toEqual({ kind: 'unreachable' });
  });

  it('cannot reach the server when the answer is not the one it gives', async () => {
    const html = new Response('<!doctype html>', { status: 201 });
    expect(await answering(html).signaling.openRoom('peer-1')).toEqual({ kind: 'unreachable' });

    const noCode = json({ room: 'AB3K' }, 201);
    expect(await answering(noCode).signaling.openRoom('peer-1')).toEqual({ kind: 'unreachable' });

    const wrongStatus = json({ code: 'AB3K' }, 500);
    expect(await answering(wrongStatus).signaling.openRoom('peer-1')).toEqual({
      kind: 'unreachable',
    });
  });
});

describe('findRoom', () => {
  it("returns the host's peer ID", async () => {
    const { fetcher, signaling } = answering(json({ peerId: 'peer-1' }));

    expect(await signaling.findRoom('AB3K')).toEqual({ kind: 'found', peerId: 'peer-1' });
    expect(fetcher).toHaveBeenCalledWith(`${BASE}/rooms/AB3K`, undefined);
  });

  it('finds no room behind a 404', async () => {
    const { signaling } = answering(empty(404));

    expect(await signaling.findRoom('AB3K')).toEqual({ kind: 'not-found' });
  });

  it('says how many seconds to wait when too many codes missed', async () => {
    const { signaling } = answering(empty(429, { 'Retry-After': '240' }));

    expect(await signaling.findRoom('AB3K')).toEqual({ kind: 'rate-limited', retryAfter: 240 });
  });

  // The server always sends the header. A 429 without one is some proxy's.
  it('cannot reach the server on a 429 with no wait it can read', async () => {
    expect(await answering(empty(429)).signaling.findRoom('AB3K')).toEqual({
      kind: 'unreachable',
    });
    expect(
      await answering(empty(429, { 'Retry-After': 'soon' })).signaling.findRoom('AB3K'),
    ).toEqual({ kind: 'unreachable' });
  });

  it('cannot reach the server when the request fails', async () => {
    const { signaling } = answering(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(await signaling.findRoom('AB3K')).toEqual({ kind: 'unreachable' });
  });

  it('cannot reach the server when the answer is not the one it gives', async () => {
    const html = new Response('<!doctype html>', { status: 200 });
    expect(await answering(html).signaling.findRoom('AB3K')).toEqual({ kind: 'unreachable' });

    const numeric = json({ peerId: 7 });
    expect(await answering(numeric).signaling.findRoom('AB3K')).toEqual({ kind: 'unreachable' });

    expect(await answering(json(null)).signaling.findRoom('AB3K')).toEqual({ kind: 'unreachable' });
  });
});

describe('iceServers', () => {
  const turn = { urls: 'turn:relay.test:443', username: 'user', credential: 'pass' };

  it('returns the list the server gives', async () => {
    const { fetcher, signaling } = answering(json({ iceServers: [GOOGLE_STUN, turn] }));

    expect(await signaling.iceServers()).toEqual([GOOGLE_STUN, turn]);
    expect(fetcher).toHaveBeenCalledWith(`${BASE}/ice-servers`, undefined);
  });

  it('falls back to Google STUN when the request fails', async () => {
    const { signaling } = answering(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(await signaling.iceServers()).toEqual([GOOGLE_STUN]);
  });

  it('falls back to Google STUN when the answer is not the one it gives', async () => {
    const answers = [
      new Response('<!doctype html>', { status: 200 }),
      json({ iceServers: [turn] }, 500),
      json({ iceServers: [] }),
      json({ iceServers: [{ urls: 7 }] }),
      json({ iceServers: [{ ...turn, credential: 1 }] }),
      json([turn]),
      json(null),
    ];
    for (const answer of answers) {
      expect(await answering(answer).signaling.iceServers()).toEqual([GOOGLE_STUN]);
    }
  });
});
