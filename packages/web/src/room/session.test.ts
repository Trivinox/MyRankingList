// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '../core/types.ts';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import type { Participant } from './hostRoom.ts';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  removeParticipant,
  resumeRoom,
  startRoom,
} from './session.ts';
import type { FoundRoom, OpenedRoom } from './signaling.ts';
import { readTabRecord } from './tabRecord.ts';
import type { TabRecord } from './tabRecord.ts';

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
  // that was open. `sentBeforeClose` is what had gone out when it closed.
  class FakeChannel extends Emitter {
    sent: unknown[] = [];
    sentBeforeClose: unknown[] | null = null;
    closeOptions: unknown;
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
    close(options?: unknown) {
      if (!this.isOpen) return;
      this.sentBeforeClose = [...this.sent];
      this.closeOptions = options;
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

// Puts the head of the pool at the top of the list, and returns what the list
// holds afterwards.
const placeOne = () => {
  usePlacement.getState().drop({ from: 'pool' }, { kind: 'gap', index: 0 });
  return usePlacement.getState().placement!.rankedSlots;
};

// Takes the item at the top and puts it at the bottom, which places nothing.
const reorder = () => {
  const [top] = usePlacement.getState().placement!.rankedSlots;
  const slots = usePlacement.getState().placement!.rankedSlots.length;
  usePlacement
    .getState()
    .drop({ from: 'placed', itemId: top.itemIds[0] }, { kind: 'gap', index: slots });
};

beforeEach(() => {
  peers.length = 0;
  signaling.openRoom.mockReset();
  signaling.findRoom.mockReset();
  signaling.iceServers.mockReset().mockResolvedValue(ICE_SERVERS);
  usePlacement.setState({ items: [], criterion: '', placement: null });
  sessionStorage.clear();
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
    expect(room.participants).toEqual([
      { id: room.you, nickname: 'Ana', isCreator: true, progress: 0, connected: true },
    ]);
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
      {
        type: 'welcome',
        you: participants[2].id,
        seat: expect.any(String),
        criterion: 'Best noodle',
        participants,
      },
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
  describe('starting', () => {
    const progressOf = (nickname: string) =>
      useRoom.getState().participants.find((p) => p.nickname === nickname)?.progress;

    async function startWithJuan() {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      const lucia = guestJoins(host, 'Lucía');
      startRoom();
      return { host, juan, lucia };
    }

    it('is refused while the creator is alone', async () => {
      await openRoom();

      startRoom();

      expect(useRoom.getState().status).toBe('lobby');
      expect(usePlacement.getState().placement).toBeNull();
    });

    it('sends everyone a copy of the list and starts the host sorting it too', async () => {
      const { juan, lucia } = await startWithJuan();

      for (const channel of [juan, lucia]) {
        expect(channel.sent).toContainEqual({ type: 'start', items, criterion: 'Best noodle' });
      }
      const room = useRoom.getState();
      expect(room.status).toBe('sorting');
      expect(usePlacement.getState()).toMatchObject({ items, criterion: 'Best noodle' });
      expect(usePlacement.getState().placement?.pendingPool).toHaveLength(2);
      usePlacement.getState().items.forEach((item, index) => expect(item).not.toBe(items[index]));
    });

    it('puts everyone at 1 of the list and says so', async () => {
      const { lucia } = await startWithJuan();

      const { participants } = useRoom.getState();
      expect(participants.map((p) => p.progress)).toEqual([1, 1, 1]);
      expect(lucia.sent.at(-1)).toEqual({ type: 'participants', participants });
    });

    it('tells someone who arrives after the start that it has started, and keeps them out', async () => {
      const { host } = await startWithJuan();
      const before = useRoom.getState().participants;

      const late = guestJoins(host, 'Late');

      expect(late.sent).toEqual([{ type: 'started' }]);
      expect(useRoom.getState().participants).toBe(before);
    });

    it('passes on the progress a guest reports to everyone', async () => {
      const { juan, lucia } = await startWithJuan();

      juan.emit('data', { type: 'progress', placed: 2 });

      expect(progressOf('Juan')).toBe(2);
      expect(progressOf('Lucía')).toBe(1);
      const { participants } = useRoom.getState();
      expect(lucia.sent.at(-1)).toEqual({ type: 'participants', participants });
      expect(juan.sent.at(-1)).toEqual({ type: 'participants', participants });
    });

    it('ignores progress past the end of the list, and from a channel that never joined', async () => {
      const { host, juan } = await startWithJuan();
      const before = useRoom.getState().participants;

      juan.emit('data', { type: 'progress', placed: 4 });
      host.receive().emit('data', { type: 'progress', placed: 2 });

      expect(useRoom.getState().participants).toBe(before);
    });

    it('ignores progress sent from the lobby', async () => {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      const before = useRoom.getState().participants;

      juan.emit('data', { type: 'progress', placed: 2 });

      expect(useRoom.getState().participants).toBe(before);
    });

    it('counts what the host places, and not what they move around', async () => {
      const { juan } = await startWithJuan();
      const sent = juan.sent.length;

      placeOne();
      expect(progressOf('Ana')).toBe(2);
      expect(juan.sent).toHaveLength(sent + 1);

      const before = usePlacement.getState().placement!.rankedSlots;
      reorder();
      expect(usePlacement.getState().placement!.rankedSlots).not.toEqual(before);
      expect(progressOf('Ana')).toBe(2);
      expect(juan.sent).toHaveLength(sent + 1);
    });

    it('ignores progress from a guest who was removed', async () => {
      const { juan } = await startWithJuan();
      const id = useRoom.getState().participants[1].id;
      removeParticipant(id);
      const before = useRoom.getState().participants;

      juan.emit('data', { type: 'progress', placed: 2 });

      expect(useRoom.getState().participants).toBe(before);
    });

    it('stops counting once the room is left', async () => {
      const { juan } = await startWithJuan();
      leaveRoom();
      const sent = juan.sent.length;

      placeOne();

      expect(juan.sent).toHaveLength(sent);
    });
  });

  describe('removing', () => {
    it('tells the guest before closing their channel, and flushes it first', async () => {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      const id = useRoom.getState().participants[1].id;

      removeParticipant(id);

      expect(juan.sentBeforeClose?.at(-1)).toEqual({ type: 'removed' });
      expect(juan.closeOptions).toEqual({ flush: true });
    });

    it('drops them from the room and tells the rest', async () => {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      const lucia = guestJoins(host, 'Lucía');
      const id = useRoom.getState().participants[1].id;
      const sentToJuan = juan.sent.length;

      removeParticipant(id);

      const { participants } = useRoom.getState();
      expect(participants.map((p) => p.nickname)).toEqual(['Ana', 'Lucía']);
      expect(lucia.sent.at(-1)).toEqual({ type: 'participants', participants });
      expect(juan.sent).toHaveLength(sentToJuan + 1);
    });

    // Their end closing afterwards is not a second departure to announce.
    it('sends nothing more when the removed channel then closes', async () => {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      const lucia = guestJoins(host, 'Lucía');
      removeParticipant(useRoom.getState().participants[1].id);
      const sentToLucia = lucia.sent.length;

      juan.isOpen = true;
      juan.close();

      expect(lucia.sent).toHaveLength(sentToLucia);
    });

    it('never removes the creator', async () => {
      const host = await openRoom();
      guestJoins(host, 'Juan');
      const before = useRoom.getState().participants;

      removeParticipant(useRoom.getState().you!);

      expect(useRoom.getState().participants).toBe(before);
    });

    it('leaves space in a full lobby for one more', async () => {
      const host = await openRoom();
      for (let i = 1; i < 20; i++) guestJoins(host, `Guest ${i}`);

      removeParticipant(useRoom.getState().participants[3].id);
      const late = guestJoins(host, 'Late');

      expect(late.sent[0]).toMatchObject({ type: 'welcome' });
      expect(useRoom.getState().participants).toHaveLength(20);
    });

    it('works mid-sort too', async () => {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      guestJoins(host, 'Lucía');
      startRoom();

      removeParticipant(useRoom.getState().participants[1].id);

      expect(juan.sent.at(-1)).toEqual({ type: 'removed' });
      expect(useRoom.getState().participants.map((p) => p.nickname)).toEqual(['Ana', 'Lucía']);
    });
  });

  describe('someone coming back', () => {
    const seatOf = (channel: { sent: unknown[] }) => (channel.sent[0] as { seat: string }).seat;
    const juanOf = () => useRoom.getState().participants.find((p) => p.nickname === 'Juan')!;

    // The same tab again, on a new channel, showing the seat it was given.
    function returns(host: InstanceType<typeof fakes.FakePeer>, seat: string) {
      const channel = host.receive();
      channel.emit('data', { type: 'join', nickname: 'Juan', seat });
      return channel;
    }

    async function sortingWithJuan() {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      const lucia = guestJoins(host, 'Lucía');
      startRoom();
      juan.emit('data', { type: 'progress', placed: 2 });
      return { host, juan, lucia, seat: seatOf(juan) };
    }

    it('gives every guest a seat of their own, sent to nobody else', async () => {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      const lucia = guestJoins(host, 'Lucía');

      expect(seatOf(juan)).not.toBe(seatOf(lucia));
      expect(JSON.stringify(juan.sent.slice(1))).not.toContain(seatOf(lucia));
      expect(JSON.stringify(lucia.sent)).not.toContain(seatOf(juan));
      expect(JSON.stringify(useRoom.getState().participants)).not.toContain(seatOf(juan));
    });

    it('keeps the place of a guest who drops mid-sort, marked away with their count', async () => {
      const { juan, lucia } = await sortingWithJuan();

      juan.close();

      expect(juanOf()).toMatchObject({ connected: false, progress: 2 });
      const { participants } = useRoom.getState();
      expect(participants).toHaveLength(3);
      expect(lucia.sent.at(-1)).toEqual({ type: 'participants', participants });
    });

    it('gives a returning seat its place back, with the list and the same id', async () => {
      const { host, juan, lucia, seat } = await sortingWithJuan();
      const id = juanOf().id;
      juan.close();

      const back = returns(host, seat);

      expect(juanOf()).toMatchObject({ id, connected: true, progress: 2 });
      const { participants } = useRoom.getState();
      expect(back.sent).toEqual([
        { type: 'resume', you: id, seat, criterion: 'Best noodle', participants, items },
      ]);
      expect(lucia.sent.at(-1)).toEqual({ type: 'participants', participants });

      back.emit('data', { type: 'progress', placed: 3 });
      expect(juanOf().progress).toBe(3);
    });

    it('tells the older tab it was replaced when the same seat connects again', async () => {
      const { host, juan, seat } = await sortingWithJuan();

      const copy = returns(host, seat);

      expect(juan.sentBeforeClose?.at(-1)).toEqual({ type: 'replaced' });
      expect(juan.closeOptions).toEqual({ flush: true });
      expect(juanOf().connected).toBe(true);
      expect(copy.sent[0]).toMatchObject({ type: 'resume' });

      // What the older channel sends on its way out counts for nothing.
      juan.emit('data', { type: 'progress', placed: 3 });
      expect(juanOf().progress).toBe(2);
    });

    it('tells a seat that was removed while away that it was removed', async () => {
      const { host, juan, seat } = await sortingWithJuan();
      juan.close();
      removeParticipant(juanOf().id);
      const before = useRoom.getState().participants;

      const back = returns(host, seat);

      expect(back.sentBeforeClose).toEqual([{ type: 'removed' }]);
      expect(useRoom.getState().participants).toBe(before);
    });

    it('tells a seat it does not know, after the start, that the room has started', async () => {
      const { host } = await sortingWithJuan();
      const before = useRoom.getState().participants;

      const stranger = returns(host, 'made-up');

      expect(stranger.sent).toEqual([{ type: 'started' }]);
      expect(useRoom.getState().participants).toBe(before);
    });

    // The app only sends a seat mid-sort, but the host does not rely on that.
    it('gives a seat still in the lobby its entry back with a welcome, not a resume', async () => {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      const seat = seatOf(juan);
      const id = juanOf().id;

      const copy = returns(host, seat);

      expect(juan.sentBeforeClose?.at(-1)).toEqual({ type: 'replaced' });
      const { participants } = useRoom.getState();
      expect(participants).toHaveLength(2);
      expect(copy.sent).toEqual([
        { type: 'welcome', you: id, seat, criterion: 'Best noodle', participants },
      ]);
    });

    it('lets a guest who left the lobby only join again as someone new', async () => {
      const host = await openRoom();
      const juan = guestJoins(host, 'Juan');
      const seat = seatOf(juan);
      juan.close();

      const back = returns(host, seat);

      const welcome = back.sent[0] as { seat: string };
      expect(welcome).toMatchObject({ type: 'welcome' });
      expect(welcome.seat).not.toBe(seat);
      expect(useRoom.getState().participants).toHaveLength(2);
    });

    it('removes someone who is away, with no channel to tell', async () => {
      const { juan } = await sortingWithJuan();
      juan.close();

      removeParticipant(juanOf().id);

      expect(useRoom.getState().participants.map((p) => p.nickname)).toEqual(['Ana', 'Lucía']);
    });

    describe('someone away for too long', () => {
      const overdue = () => useRoom.getState().overdue;

      beforeEach(() => vi.useFakeTimers());

      it('is not overdue before 20 minutes, and is at 20', async () => {
        const { juan } = await sortingWithJuan();
        juan.close();

        vi.advanceTimersByTime(20 * 60_000 - 1);
        expect(overdue()).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(overdue()).toEqual([juanOf().id]);
        // Only the creator is offered anything. Juan's place is still there.
        expect(juanOf()).toMatchObject({ connected: false, progress: 2 });
      });

      it('starts the count over after coming back in time', async () => {
        const { host, juan, seat } = await sortingWithJuan();
        juan.close();
        vi.advanceTimersByTime(19 * 60_000);

        const back = returns(host, seat);
        vi.advanceTimersByTime(60_000);
        expect(overdue()).toEqual([]);

        back.close();
        vi.advanceTimersByTime(20 * 60_000 - 1);
        expect(overdue()).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(overdue()).toEqual([juanOf().id]);
      });

      it('is no longer overdue once back after it', async () => {
        const { host, juan, seat } = await sortingWithJuan();
        juan.close();
        vi.advanceTimersByTime(20 * 60_000);

        returns(host, seat);

        expect(overdue()).toEqual([]);
        expect(juanOf().connected).toBe(true);
      });

      it('is taken out, with the rest told and the seat refused, when finished without', async () => {
        const { host, juan, lucia, seat } = await sortingWithJuan();
        juan.close();
        vi.advanceTimersByTime(20 * 60_000);

        removeParticipant(juanOf().id);

        const { participants } = useRoom.getState();
        expect(participants.map((p) => p.nickname)).toEqual(['Ana', 'Lucía']);
        expect(lucia.sent.at(-1)).toEqual({ type: 'participants', participants });
        expect(overdue()).toEqual([]);

        const back = returns(host, seat);
        expect(back.sentBeforeClose).toEqual([{ type: 'removed' }]);
      });

      it('is never the creator, who has no channel to lose', async () => {
        await sortingWithJuan();

        vi.advanceTimersByTime(60 * 60_000);

        expect(overdue()).toEqual([]);
      });

      it('leaves no timer behind once the room is left', async () => {
        const { juan } = await sortingWithJuan();
        juan.close();

        leaveRoom();
        vi.advanceTimersByTime(20 * 60_000);

        expect(overdue()).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
      });

      it('is never counted in the lobby, where dropping is leaving', async () => {
        const host = await openRoom();
        guestJoins(host, 'Juan').close();

        vi.advanceTimersByTime(20 * 60_000);

        expect(overdue()).toEqual([]);
      });
    });
  });
});

describe('joinRoom', () => {
  const ana: Participant = {
    id: 'a',
    nickname: 'Ana',
    isCreator: true,
    progress: 0,
    connected: true,
  };
  const juan: Participant = {
    id: 'j',
    nickname: 'Juan',
    isCreator: false,
    progress: 0,
    connected: true,
  };

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
      seat: 's1',
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

  describe('once the host starts', () => {
    const start = { type: 'start', items, criterion: 'Best noodle' };

    it('starts sorting its own shuffle of the list', async () => {
      const { channel } = await reachLobby();

      channel.emit('data', start);

      expect(useRoom.getState()).toMatchObject({ status: 'sorting', items });
      expect(usePlacement.getState()).toMatchObject({ items, criterion: 'Best noodle' });
      expect(usePlacement.getState().placement?.pendingPool).toHaveLength(2);
    });

    it('reports each item it places, and nothing when one only moves', async () => {
      const { channel } = await reachLobby();
      channel.emit('data', start);

      placeOne();
      expect(channel.sent.at(-1)).toEqual({ type: 'progress', placed: 2 });

      const sent = channel.sent.length;
      reorder();
      expect(channel.sent).toHaveLength(sent);
    });

    it('ignores a start that comes before the welcome', async () => {
      const { channel } = await reachHost();

      channel.emit('data', start);

      expect(useRoom.getState().status).toBe('connecting');
      expect(usePlacement.getState().placement).toBeNull();
    });

    it('goes on sorting when the host drops mid-sort, and stops reporting to the old channel', async () => {
      const { guest, channel } = await reachLobby();
      channel.emit('data', start);

      channel.close();
      const sent = channel.sent.length;
      placeOne();

      expect(useRoom.getState().status).toBe('reconnecting');
      expect(guest.destroyed).toBe(true);
      expect(channel.sent).toHaveLength(sent);
      expect(usePlacement.getState().placement?.pendingPool).toHaveLength(1);
    });
  });

  it('ends up removed, not closed, when the creator takes it out', async () => {
    const { guest, channel } = await reachLobby();
    const written: string[] = [];
    const stop = useRoom.subscribe((room) => written.push(room.status));

    channel.emit('data', { type: 'removed' });
    stop();

    expect(guest.destroyed).toBe(true);
    expect(written).toEqual(['removed']);
    expect(useRoom.getState().status).toBe('removed');
  });

  it('stops reporting progress once removed mid-sort', async () => {
    const { channel } = await reachLobby();
    channel.emit('data', { type: 'start', items, criterion: 'Best noodle' });
    channel.emit('data', { type: 'removed' });
    const sent = channel.sent.length;

    placeOne();

    expect(useRoom.getState().status).toBe('removed');
    expect(channel.sent).toHaveLength(sent);
  });

  it('ignores a removal before the welcome', async () => {
    const { guest, channel } = await reachHost();

    channel.emit('data', { type: 'removed' });

    expect(guest.destroyed).toBe(false);
    expect(useRoom.getState().status).toBe('connecting');
  });

  it('is told the room has already started, and lets go of the Peer', async () => {
    const { guest, channel } = await reachHost();

    channel.emit('data', { type: 'started' });

    expect(guest.destroyed).toBe(true);
    expect(useRoom.getState()).toMatchObject({ status: 'idle', error: { kind: 'started' } });
  });

  it('closes its channel when the tab is closed', async () => {
    const { guest, channel } = await reachLobby();

    window.dispatchEvent(new Event('pagehide'));

    expect(guest.destroyed).toBe(true);
    expect(channel.isOpen).toBe(false);
  });

  describe('losing the host mid-sort', () => {
    const start = { type: 'start', items, criterion: 'Best noodle' };

    async function sorting() {
      const reached = await reachLobby();
      reached.channel.emit('data', start);
      return reached;
    }

    // Lets the wait before the next try run out, and follows that try as far
    // as an open channel with its join sent.
    async function nextTry(wait: number) {
      const before = peers.length;
      await vi.advanceTimersByTimeAsync(wait);
      expect(peers).toHaveLength(before + 1);
      const guest = lastPeer();
      guest.open('guest-peer');
      await vi.advanceTimersByTimeAsync(0);
      const channel = guest.channels[0];
      channel.open();
      return { guest, channel };
    }

    const resume = {
      type: 'resume',
      you: 'j',
      seat: 's1',
      criterion: 'Best noodle',
      participants: [ana, juan],
      items,
    };

    beforeEach(() => vi.useFakeTimers());

    it('tries again after 2 seconds, showing its seat', async () => {
      const { channel } = await sorting();
      channel.close();

      await vi.advanceTimersByTimeAsync(1_999);
      expect(peers).toHaveLength(1);
      const next = await nextTry(1);

      expect(signaling.findRoom).toHaveBeenLastCalledWith('AB3K');
      expect(next.channel.sent).toEqual([{ type: 'join', nickname: 'Juan', seat: 's1' }]);
      expect(useRoom.getState().status).toBe('reconnecting');
    });

    it('is back to sorting on the resume, and tells the host what it placed meanwhile', async () => {
      const { channel } = await sorting();
      channel.close();
      placeOne();
      const kept = usePlacement.getState().placement;

      const next = await nextTry(2_000);
      next.channel.emit('data', resume);

      expect(useRoom.getState()).toMatchObject({ status: 'sorting', you: 'j' });
      expect(usePlacement.getState().placement).toBe(kept);
      expect(next.channel.sent.at(-1)).toEqual({ type: 'progress', placed: 2 });

      placeOne();
      expect(next.channel.sent.at(-1)).toEqual({ type: 'progress', placed: 3 });
    });

    it('waits longer after each failed try, up to 15 seconds', async () => {
      const { channel } = await sorting();
      signaling.findRoom.mockResolvedValue({ kind: 'unreachable' });
      channel.close();

      for (const wait of [2_000, 4_000, 8_000, 15_000, 15_000]) {
        const calls = signaling.findRoom.mock.calls.length;
        await vi.advanceTimersByTimeAsync(wait - 1);
        expect(signaling.findRoom.mock.calls).toHaveLength(calls);
        await vi.advanceTimersByTimeAsync(1);
        expect(signaling.findRoom.mock.calls).toHaveLength(calls + 1);
      }
      expect(useRoom.getState().status).toBe('reconnecting');
    });

    // The code still resolving means the server is holding it for a host who
    // may be back, so the host not answering is no reason to stop.
    it('keeps going while the host cannot be reached', async () => {
      const { channel } = await sorting();
      channel.close();

      const first = await nextTry(2_000);
      first.guest.emit('error', new Error('peer-unavailable'));
      expect(first.guest.destroyed).toBe(true);

      const second = await nextTry(4_000);
      expect(second.channel.sent).toEqual([{ type: 'join', nickname: 'Juan', seat: 's1' }]);
      expect(useRoom.getState().status).toBe('reconnecting');
    });

    it('waits as long as the server asks after too many wrong codes', async () => {
      const { channel } = await sorting();
      signaling.findRoom.mockResolvedValueOnce({ kind: 'rate-limited', retryAfter: 30 });
      channel.close();
      await vi.advanceTimersByTimeAsync(2_000);
      const calls = signaling.findRoom.mock.calls.length;

      await vi.advanceTimersByTimeAsync(29_999);
      expect(signaling.findRoom.mock.calls).toHaveLength(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(signaling.findRoom.mock.calls).toHaveLength(calls + 1);
    });

    it('stops, with the room closed and the record gone, once the code is released', async () => {
      const { channel } = await sorting();
      signaling.findRoom.mockResolvedValue({ kind: 'not-found' });
      channel.close();

      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(useRoom.getState().status).toBe('closed');
      expect(readTabRecord()).toBeNull();
      expect(signaling.findRoom).toHaveBeenCalledTimes(2);
    });

    it('ends up removed when it was taken out while away', async () => {
      const { channel } = await sorting();
      channel.close();

      const next = await nextTry(2_000);
      next.channel.emit('data', { type: 'removed' });

      expect(useRoom.getState().status).toBe('removed');
      expect(next.guest.destroyed).toBe(true);
      expect(readTabRecord()).toBeNull();
    });

    it('stops for good when another tab takes its place', async () => {
      const { guest, channel } = await sorting();

      channel.emit('data', { type: 'replaced' });
      await vi.advanceTimersByTimeAsync(60_000);

      expect(useRoom.getState().status).toBe('replaced');
      expect(guest.destroyed).toBe(true);
      expect(peers).toHaveLength(1);
      expect(readTabRecord()).toBeNull();
    });

    it('stops trying once the room is left', async () => {
      const { channel } = await sorting();
      channel.close();

      leaveRoom();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(peers).toHaveLength(1);
      expect(readTabRecord()).toBeNull();
    });
  });

  describe('the tab record', () => {
    it('is written once sorting starts, and follows every move', async () => {
      const { channel } = await reachLobby();
      expect(readTabRecord()).toBeNull();

      channel.emit('data', { type: 'start', items, criterion: 'Best noodle' });
      expect(readTabRecord()).toMatchObject({ code: 'AB3K', seat: 's1', you: 'j', items });

      placeOne();
      reorder();
      expect(readTabRecord()?.placement).toEqual(usePlacement.getState().placement);
    });

    it('is cleared on leaving', async () => {
      const { channel } = await reachLobby();
      channel.emit('data', { type: 'start', items, criterion: 'Best noodle' });

      leaveRoom();

      expect(readTabRecord()).toBeNull();
    });

    it('is cleared on removal', async () => {
      const { channel } = await reachLobby();
      channel.emit('data', { type: 'start', items, criterion: 'Best noodle' });

      channel.emit('data', { type: 'removed' });

      expect(readTabRecord()).toBeNull();
    });

    it('leaves the room working when the browser blocks storage', async () => {
      const refuse = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      };
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse);
      const { channel } = await reachLobby();

      channel.emit('data', { type: 'start', items, criterion: 'Best noodle' });
      placeOne();
      vi.restoreAllMocks();

      expect(useRoom.getState().status).toBe('sorting');
      expect(channel.sent.at(-1)).toEqual({ type: 'progress', placed: 2 });
      expect(readTabRecord()).toBeNull();
    });
  });
});

describe('resumeRoom', () => {
  const ana: Participant = {
    id: 'a',
    nickname: 'Ana',
    isCreator: true,
    progress: 2,
    connected: true,
  };
  const juan: Participant = {
    id: 'j',
    nickname: 'Juan',
    isCreator: false,
    progress: 2,
    connected: true,
  };

  // What a tab that had placed one item before the reload kept.
  function reloadedTab(): TabRecord {
    usePlacement.getState().start(items, 'Best noodle');
    placeOne();
    const record = {
      code: 'AB3K',
      seat: 's1',
      you: 'j',
      nickname: 'Juan',
      items,
      criterion: 'Best noodle',
      placement: usePlacement.getState().placement!,
    };
    usePlacement.setState({ items: [], criterion: '', placement: null });
    return record;
  }

  async function reconnect() {
    signaling.findRoom.mockResolvedValue({ kind: 'found', peerId: 'host-peer' });
    const record = reloadedTab();
    resumeRoom(record);
    await vi.waitFor(() => expect(peers).toHaveLength(1));
    const guest = lastPeer();
    guest.open('guest-peer');
    await vi.waitFor(() => expect(guest.channels).toHaveLength(1));
    const channel = guest.channels[0];
    channel.open();
    return { record, guest, channel };
  }

  it('puts the list back and asks for the same place, without asking anything', async () => {
    const { record, channel } = await reconnect();

    expect(usePlacement.getState()).toMatchObject({
      items,
      criterion: 'Best noodle',
      placement: record.placement,
    });
    expect(useRoom.getState()).toMatchObject({
      status: 'reconnecting',
      code: 'AB3K',
      role: 'guest',
    });
    expect(channel.sent).toEqual([{ type: 'join', nickname: 'Juan', seat: 's1' }]);
  });

  it('is sorting again on the resume, with the count it had', async () => {
    const { channel } = await reconnect();

    channel.emit('data', {
      type: 'resume',
      you: 'j',
      seat: 's1',
      criterion: 'Best noodle',
      participants: [ana, juan],
      items,
    });

    expect(useRoom.getState()).toMatchObject({
      status: 'sorting',
      participants: [ana, juan],
      items,
    });
    expect(channel.sent.at(-1)).toEqual({ type: 'progress', placed: 2 });
  });

  it('ends with the room closed when the code no longer exists', async () => {
    signaling.findRoom.mockResolvedValue({ kind: 'not-found' });
    resumeRoom(reloadedTab());

    await vi.waitFor(() => expect(useRoom.getState().status).toBe('closed'));
    expect(peers).toHaveLength(0);
  });
});
