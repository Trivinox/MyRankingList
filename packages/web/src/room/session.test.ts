// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../core/types.ts';
import { useRoom } from '../state/roomStore.ts';
import type { Participant } from './hostRoom.ts';
import { createRoom, joinRoom, leaveRoom } from './session.ts';
import type { FoundRoom, OpenedRoom } from './signaling.ts';

// Stand-ins for peerjs and the signaling client, shaped like the parts the
// session uses. A test plays the network by emitting events on them.
const fakes = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class Emitter {
    handlers = new Map<string, Handler[]>();
    on(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    once(event: string, handler: Handler) {
      const wrapped: Handler = (...args) => {
        this.off(event, wrapped);
        handler(...args);
      };
      (wrapped as Handler & { inner?: Handler }).inner = handler;
      return this.on(event, wrapped);
    }
    off(event: string, handler: Handler) {
      const kept = (this.handlers.get(event) ?? []).filter(
        (h) => h !== handler && (h as Handler & { inner?: Handler }).inner !== handler,
      );
      this.handlers.set(event, kept);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }

  // Like peerjs, closing emits `close` right away, and only for a channel
  // that was open.
  class FakeChannel extends Emitter {
    sent: unknown[] = [];
    isOpen = false;
    peer: string;
    options: unknown;
    constructor(peer: string, options?: unknown) {
      super();
      this.peer = peer;
      this.options = options;
    }
    open() {
      this.isOpen = true;
      this.emit('open');
    }
    send(message: unknown) {
      this.sent.push(message);
    }
    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.emit('close');
    }
  }

  class FakePeer extends Emitter {
    id = '';
    destroyed = false;
    channels: FakeChannel[] = [];
    options: unknown;
    constructor(options: unknown) {
      super();
      this.options = options;
      peers.push(this);
    }
    open(id: string) {
      this.id = id;
      this.emit('open', id);
    }
    connect(peerId: string, options: unknown) {
      const channel = new FakeChannel(peerId, options);
      this.channels.push(channel);
      return channel;
    }
    // A channel from a guest, already open, as the host receives it.
    receive() {
      const channel = new FakeChannel('guest-peer');
      channel.isOpen = true;
      this.channels.push(channel);
      this.emit('connection', channel);
      return channel;
    }
    destroy() {
      if (this.destroyed) return;
      for (const channel of this.channels) channel.close();
      this.destroyed = true;
    }
  }

  const peers: FakePeer[] = [];
  const signaling = { openRoom: vi.fn(), findRoom: vi.fn(), iceServers: vi.fn() };
  return { peers, signaling, FakePeer };
});

vi.mock('peerjs', () => ({ Peer: fakes.FakePeer }));
vi.mock('./signaling.ts', () => ({ createSignaling: () => fakes.signaling }));

const { peers, signaling } = fakes;
const lastPeer = () => peers[peers.length - 1];

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:relay.test:443', username: 'user', credential: 'pass' },
];

const items: Item[] = [
  { id: 'a', text: 'Udon' },
  { id: 'b', text: 'Soba' },
  { id: 'c', text: 'Ramen' },
];

// Lets the awaits inside the session run up to its next wait on the network.
const settle = () => vi.waitFor(() => undefined);

beforeEach(() => {
  peers.length = 0;
  signaling.openRoom.mockReset();
  signaling.findRoom.mockReset();
  signaling.iceServers.mockReset().mockResolvedValue(ICE_SERVERS);
});

// The host's Peer only exists once the ICE servers have come back.
async function startCreating() {
  const done = createRoom('Ana', items, 'Best noodle');
  await vi.waitFor(() => expect(peers).toHaveLength(1));
  return { done, host: lastPeer() };
}

afterEach(() => {
  leaveRoom();
  vi.useRealTimers();
});

describe('the Peer', () => {
  it('is left to the server for its ID, and uses the ICE servers the server lists', async () => {
    const { host } = await startCreating();

    expect(host.options).toEqual({
      host: 'localhost',
      port: 9000,
      path: '/',
      secure: false,
      config: { iceServers: ICE_SERVERS },
    });
  });

  it('is not made when the room is left while the ICE servers are on their way', async () => {
    let answer: (servers: RTCIceServer[]) => void = () => {};
    signaling.iceServers.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const done = createRoom('Ana', items, 'Best noodle');

    leaveRoom();
    answer(ICE_SERVERS);
    await done;

    expect(peers).toHaveLength(0);
    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: null });
  });
});

describe('createRoom', () => {
  async function openRoom(code = 'AB3K') {
    signaling.openRoom.mockResolvedValue({ kind: 'opened', code } satisfies OpenedRoom);
    const { done, host } = await startCreating();
    host.open('host-peer');
    await done;
    return host;
  }

  // A guest's channel, with its join already sent.
  function guestJoins(host: InstanceType<typeof fakes.FakePeer>, nickname: string) {
    const channel = host.receive();
    channel.emit('data', { type: 'join', nickname });
    return channel;
  }

  it('asks for a code once the Peer is open, and opens the lobby with the creator in it', async () => {
    await openRoom();

    expect(signaling.openRoom).toHaveBeenCalledWith('host-peer');
    const room = useRoom.getState();
    expect(room.status).toBe('lobby');
    expect(room.role).toBe('host');
    expect(room.code).toBe('AB3K');
    expect(room.criterion).toBe('Best noodle');
    expect(room.participants).toEqual([{ id: room.you, nickname: 'Ana', isCreator: true }]);
  });

  it('keeps a copy of the items, not the draft rows themselves', async () => {
    await openRoom();

    const kept = useRoom.getState().items;
    expect(kept).toEqual(items);
    kept.forEach((item, index) => expect(item).not.toBe(items[index]));
  });

  it('gives up when the Peer cannot open, without asking for a code', async () => {
    const { done, host } = await startCreating();
    host.emit('error', new Error('server-error'));
    await done;

    expect(signaling.openRoom).not.toHaveBeenCalled();
    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: { kind: 'unreachable' } });
    expect(host.destroyed).toBe(true);
  });

  it('gives up when the server will not hand out a code', async () => {
    signaling.openRoom.mockResolvedValue({ kind: 'refused' } satisfies OpenedRoom);
    const { done, host } = await startCreating();
    host.open('host-peer');
    await done;

    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: { kind: 'unreachable' } });
    expect(host.destroyed).toBe(true);
  });

  // An error after opening is about the server connection, and the channels
  // may be fine. Whether that ends the room is for reconnection to decide.
  it('keeps the room when the Peer reports an error after opening', async () => {
    const host = await openRoom();

    host.emit('error', new Error('network'));

    expect(host.destroyed).toBe(false);
    expect(useRoom.getState().status).toBe('lobby');
  });

  it('welcomes a guest and tells everyone else who is in', async () => {
    const host = await openRoom();
    const juan = guestJoins(host, 'Juan');
    const lucia = guestJoins(host, 'Lucía');

    const participants = useRoom.getState().participants;
    expect(participants.map((p) => p.nickname)).toEqual(['Ana', 'Juan', 'Lucía']);
    expect(lucia.sent).toEqual([
      { type: 'welcome', you: participants[2].id, criterion: 'Best noodle', participants },
    ]);
    expect(juan.sent.at(-1)).toEqual({ type: 'participants', participants });
  });

  it('gives a repeated nickname the next free suffix', async () => {
    const host = await openRoom();
    guestJoins(host, 'juan');
    guestJoins(host, 'Juan ');

    expect(useRoom.getState().participants.map((p) => p.nickname)).toEqual([
      'Ana',
      'juan',
      'Juan (2)',
    ]);
  });

  it('turns away the 21st person with full and leaves the room as it was', async () => {
    const host = await openRoom();
    for (let i = 1; i < 20; i++) guestJoins(host, `Guest ${i}`);
    const before = useRoom.getState().participants;
    expect(before).toHaveLength(20);

    const late = guestJoins(host, 'Late');

    expect(late.sent).toEqual([{ type: 'full' }]);
    expect(useRoom.getState().participants).toBe(before);
  });

  it('ignores anything that is not a join, and a second join on the same channel', async () => {
    const host = await openRoom();
    const channel = host.receive();

    channel.emit('data', { type: 'join' });
    channel.emit('data', 'join');
    channel.emit('data', { type: 'welcome', you: 'x', criterion: 'x', participants: [] });
    expect(channel.sent).toEqual([]);

    channel.emit('data', { type: 'join', nickname: 'Juan' });
    channel.emit('data', { type: 'join', nickname: 'Juan again' });
    expect(useRoom.getState().participants).toHaveLength(2);
    expect(channel.sent).toHaveLength(1);
  });

  it('drops a guest whose channel closes and tells those left', async () => {
    const host = await openRoom();
    const juan = guestJoins(host, 'Juan');
    const lucia = guestJoins(host, 'Lucía');

    juan.close();

    const participants = useRoom.getState().participants;
    expect(participants.map((p) => p.nickname)).toEqual(['Ana', 'Lucía']);
    expect(lucia.sent.at(-1)).toEqual({ type: 'participants', participants });
  });

  it('takes no place for a channel that closes before joining', async () => {
    const host = await openRoom();
    const before = useRoom.getState().participants;

    host.receive().close();

    expect(useRoom.getState().participants).toBe(before);
  });

  it('closes every channel on leaving, and the room forgets them', async () => {
    const host = await openRoom();
    const juan = guestJoins(host, 'Juan');

    leaveRoom();

    expect(host.destroyed).toBe(true);
    expect(juan.isOpen).toBe(false);
    expect(useRoom.getState()).toMatchObject({ status: 'idle', participants: [], code: null });
  });

  it('writes nothing when left while the code is on its way', async () => {
    let answer: (room: OpenedRoom) => void = () => {};
    signaling.openRoom.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { done, host } = await startCreating();
    host.open('host-peer');
    await settle();

    leaveRoom();
    answer({ kind: 'opened', code: 'AB3K' });
    await done;

    expect(useRoom.getState()).toMatchObject({ status: 'idle', code: null, error: null });
  });
});

describe('joinRoom', () => {
  const ana: Participant = { id: 'a', nickname: 'Ana', isCreator: true };
  const juan: Participant = { id: 'j', nickname: 'Juan', isCreator: false };

  // Gets as far as the guest's channel to the host, open and with the join sent.
  async function reachHost() {
    signaling.findRoom.mockResolvedValue({ kind: 'found', peerId: 'host-peer' });
    const done = joinRoom('AB3K', 'Juan');
    await vi.waitFor(() => expect(peers).toHaveLength(1));
    const guest = lastPeer();
    guest.open('guest-peer');
    await done;
    const channel = guest.channels[0];
    channel.open();
    return { guest, channel };
  }

  async function reachLobby() {
    const reached = await reachHost();
    reached.channel.emit('data', {
      type: 'welcome',
      you: 'j',
      criterion: 'Best noodle',
      participants: [ana, juan],
    });
    return reached;
  }

  it.each<FoundRoom>([
    { kind: 'not-found' },
    { kind: 'rate-limited', retryAfter: 240 },
    { kind: 'unreachable' },
  ])('passes a failed lookup ($kind) on as it came, with no Peer made', async (found) => {
    signaling.findRoom.mockResolvedValue(found);

    await joinRoom('AB3K', 'Juan');

    expect(peers).toHaveLength(0);
    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: found });
  });

  it('opens a reliable JSON channel to the host and asks to join', async () => {
    const { guest, channel } = await reachHost();

    expect(signaling.findRoom).toHaveBeenCalledWith('AB3K');
    expect(guest.options).toMatchObject({ config: { iceServers: ICE_SERVERS } });
    expect(channel.peer).toBe('host-peer');
    expect(channel.options).toEqual({ serialization: 'json', reliable: true });
    expect(channel.sent).toEqual([{ type: 'join', nickname: 'Juan' }]);
    expect(useRoom.getState().status).toBe('connecting');
  });

  it('opens the lobby on the welcome', async () => {
    await reachLobby();

    expect(useRoom.getState()).toMatchObject({
      status: 'lobby',
      role: 'guest',
      code: 'AB3K',
      you: 'j',
      criterion: 'Best noodle',
      participants: [ana, juan],
    });
  });

  it('follows the participant list the host sends', async () => {
    const { channel } = await reachLobby();

    channel.emit('data', { type: 'participants', participants: [ana] });

    expect(useRoom.getState().participants).toEqual([ana]);
  });

  it('drops a message that is not exactly one the host sends', async () => {
    const { channel } = await reachLobby();

    channel.emit('data', { type: 'participants', participants: [{ id: 1 }] });
    channel.emit('data', { type: 'welcome', you: 'x', participants: [] });

    expect(useRoom.getState()).toMatchObject({ status: 'lobby', participants: [ana, juan] });
  });

  // The close handler fires while the give-up that set it off is still
  // running. Without a guard the store hears unreachable in between, which the
  // final state alone would hide.
  it('says the room is full, and only that', async () => {
    const { guest, channel } = await reachHost();
    const written: (string | undefined)[] = [];
    const stop = useRoom.subscribe((room) => written.push(room.error?.kind));

    channel.emit('data', { type: 'full' });
    stop();

    expect(guest.destroyed).toBe(true);
    expect(written).toEqual(['full']);
    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: { kind: 'full' } });
  });

  it('gives up when no welcome comes within 20 seconds', async () => {
    vi.useFakeTimers();
    const { guest } = await reachHost();

    vi.advanceTimersByTime(19_999);
    expect(useRoom.getState().status).toBe('connecting');

    vi.advanceTimersByTime(1);
    expect(guest.destroyed).toBe(true);
    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: { kind: 'unreachable' } });
  });

  it('says the room could not be reached when the Peer errs before the welcome', async () => {
    const { guest } = await reachHost();

    guest.emit('error', new Error('peer-unavailable'));

    expect(guest.destroyed).toBe(true);
    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: { kind: 'unreachable' } });
  });

  it('says the room could not be reached when the channel closes before the welcome', async () => {
    const { channel } = await reachHost();

    channel.close();

    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: { kind: 'unreachable' } });
  });

  it('marks the room closed when the host goes, and lets go of the Peer', async () => {
    const { guest, channel } = await reachLobby();

    channel.close();

    expect(useRoom.getState().status).toBe('closed');
    expect(guest.destroyed).toBe(true);
  });

  it('writes nothing when left during the lookup', async () => {
    let answer: (room: FoundRoom) => void = () => {};
    signaling.findRoom.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const done = joinRoom('AB3K', 'Juan');

    leaveRoom();
    answer({ kind: 'found', peerId: 'host-peer' });
    await done;

    expect(peers).toHaveLength(0);
    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: null });
  });

  it('makes no Peer when left while the ICE servers are on their way', async () => {
    signaling.findRoom.mockResolvedValue({ kind: 'found', peerId: 'host-peer' });
    let answer: (servers: RTCIceServer[]) => void = () => {};
    signaling.iceServers.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const done = joinRoom('AB3K', 'Juan');
    await vi.waitFor(() => expect(signaling.iceServers).toHaveBeenCalled());

    leaveRoom();
    answer(ICE_SERVERS);
    await done;

    expect(peers).toHaveLength(0);
    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: null });
  });

  it('closes its channel when the tab is closed', async () => {
    const { guest, channel } = await reachLobby();

    window.dispatchEvent(new Event('pagehide'));

    expect(guest.destroyed).toBe(true);
    expect(channel.isOpen).toBe(false);
  });
});
