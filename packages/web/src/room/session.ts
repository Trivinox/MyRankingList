import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Item } from '../core/types.ts';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import type { Role } from '../state/roomStore.ts';
import { SIGNALING_URL } from './config.ts';
import {
  INACTIVITY_TIMEOUT_MS,
  START_MINIMUM,
  admit,
  exclude,
  leave,
  setConnected,
  setProgress,
  startAll,
} from './hostRoom.ts';
import type { Participant } from './hostRoom.ts';
import { parseGuestMessage, parseHostMessage } from './protocol.ts';
import type { GuestMessage, HostMessage } from './protocol.ts';
import { createSignaling } from './signaling.ts';
import { clearTabRecord, writeTabRecord } from './tabRecord.ts';
import type { TabRecord } from './tabRecord.ts';

// The only module that touches peerjs. It turns what happens on the network
// into store updates, and the screens never see a Peer or a channel.

// A guest who found the code but hears nothing from the host in this long
// gives up. The lookup before it has no limit: a sleeping server on Render
// takes close to a minute to wake, and that wait says nothing about the host.
const WELCOME_TIMEOUT_MS = 20_000;

// How long a guest who lost the host waits before each new try. The last one
// repeats for as long as the code still resolves: the signaling server keeps
// it a while for a host who may be coming back.
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000];

const signaling = createSignaling(SIGNALING_URL);

const server = new URL(SIGNALING_URL);
const secure = server.protocol === 'https:';

// Passing `config` replaces peerjs's default whole, and that default brings
// PeerJS's own public TURN servers with it. The list comes from the signaling
// server instead, asked again for every Peer so its credentials stay current.
const peerOptions = (iceServers: RTCIceServer[]) => ({
  host: server.hostname,
  port: Number(server.port) || (secure ? 443 : 80),
  path: server.pathname,
  secure,
  config: { iceServers },
});

// One room at a time. Every create, join or leave bumps the attempt, and the
// callbacks of an older one check it and stop writing to the store.
let peer: Peer | null = null;
let attempt = 0;
// Set by createRoom once the lobby is open, for the host's buttons to call.
let startHere: (() => void) | null = null;
let removeHere: ((id: string) => void) | null = null;
let unfollow: (() => void) | null = null;
// A guest's next try at getting back to the host.
let retry: ReturnType<typeof setTimeout> | undefined;
// On the host, one timer for each guest away mid-sort, by participant id.
const awayTimers = new Map<string, ReturnType<typeof setTimeout>>();

function stopFollowing() {
  unfollow?.();
  unfollow = null;
}

function letGo() {
  clearTimeout(retry);
  for (const timer of awayTimers.values()) clearTimeout(timer);
  awayTimers.clear();
  peer?.destroy();
  peer = null;
  startHere = null;
  removeHere = null;
  stopFollowing();
}

function begin(role: Role) {
  letGo();
  useRoom.getState().connect(role);
  return ++attempt;
}

function placedCount() {
  const { items, placement } = usePlacement.getState();
  return placement ? items.length - placement.pendingPool.length : 0;
}

// Only the count leaves this browser, never the list, and only when it
// changes: moving an item that is already placed leaves it as it was. `keep`
// runs on every change, moves included.
function follow(report: (placed: number) => void, keep?: () => void) {
  let last = placedCount();
  unfollow = usePlacement.subscribe(() => {
    keep?.();
    const placed = placedCount();
    if (placed === last) return;
    last = placed;
    report(placed);
  });
}

// Resolves once the server has given the Peer its ID. Any error before that
// means no Peer at all. After it, an error is no reason to tear down a room
// whose channels may still be fine, so the listener goes.
function opened(created: Peer) {
  return new Promise<boolean>((resolve) => {
    const failed = () => {
      created.destroy();
      resolve(false);
    };
    created.once('error', failed);
    created.once('open', () => {
      created.off('error', failed);
      resolve(true);
    });
  });
}

export async function createRoom(nickname: string, items: Item[], criterion: string) {
  const mine = begin('host');
  const iceServers = await signaling.iceServers();
  if (mine !== attempt) return;
  const host = new Peer(peerOptions(iceServers));
  peer = host;

  const ok = await opened(host);
  if (mine !== attempt) return;
  const result = ok ? await signaling.openRoom(host.id) : null;
  if (mine !== attempt) return;
  if (result?.kind !== 'opened') {
    host.destroy();
    peer = null;
    useRoom.getState().fail({ kind: 'unreachable' });
    return;
  }

  // The creator's nickname went through the same form as everyone's, so an
  // empty room cannot turn it away.
  const creator = admit([], nickname, true);
  if (!creator.ok) return;

  const channels = new Map<string, DataConnection>();
  const send = (channel: DataConnection, message: HostMessage) => void channel.send(message);
  const tellEveryone = () => {
    const { participants } = useRoom.getState();
    for (const channel of channels.values()) send(channel, { type: 'participants', participants });
  };

  const setParticipants = (participants: Participant[]) => {
    useRoom.getState().setParticipants(participants);
    tellEveryone();
  };

  // Seat to participant id. The seat is the secret a guest shows to get their
  // place back, and only they and this closure ever hold it: the id goes to
  // everyone, so it proves nothing.
  const seats = new Map<string, string>();
  const removedSeats = new Set<string>();

  // Past the timeout the creator is offered to finish without them. Nothing
  // happens on its own: they may still come back, and it is the creator's call.
  const awaitReturn = (id: string) => {
    awayTimers.set(
      id,
      setTimeout(() => {
        awayTimers.delete(id);
        if (mine !== attempt) return;
        useRoom.getState().setOverdue([...useRoom.getState().overdue, id]);
      }, INACTIVITY_TIMEOUT_MS),
    );
  };
  const stopWaiting = (id: string) => {
    clearTimeout(awayTimers.get(id));
    awayTimers.delete(id);
    const { overdue, setOverdue } = useRoom.getState();
    if (overdue.includes(id)) setOverdue(overdue.filter((late) => late !== id));
  };

  host.on('connection', (channel) => {
    let id: string | null = null;
    let seat: string | null = null;

    channel.on('data', (data) => {
      const message = parseGuestMessage(data);
      if (!message || mine !== attempt) return;
      const room = useRoom.getState();

      if (message.type === 'progress') {
        // A removed guest's channel stays open until their end closes it, and
        // what it sends meanwhile is from nobody in the room.
        if (id === null || channels.get(id) !== channel) return;
        if (room.status !== 'sorting' || message.placed > room.items.length) return;
        setParticipants(setProgress(room.participants, id, message.placed));
        return;
      }

      if (id !== null) return;

      if (message.seat !== undefined && removedSeats.has(message.seat)) {
        send(channel, { type: 'removed' });
        channel.close({ flush: true });
        return;
      }

      // Someone coming back, from a reload or a dropped connection. A tab that
      // still holds the place is a copy of this one, and is told to stop
      // rather than left to take the place back on its next try.
      const known = message.seat === undefined ? undefined : seats.get(message.seat);
      if (known !== undefined && room.participants.some((p) => p.id === known)) {
        const older = channels.get(known);
        channels.delete(known);
        if (older) {
          send(older, { type: 'replaced' });
          older.close({ flush: true });
        }
        id = known;
        seat = message.seat!;
        stopWaiting(id);
        setParticipants(setConnected(room.participants, id, true));
        channels.set(id, channel);
        const { participants, items } = useRoom.getState();
        send(
          channel,
          room.status === 'sorting'
            ? { type: 'resume', you: id, seat, criterion, participants, items }
            : { type: 'welcome', you: id, seat, criterion, participants },
        );
        return;
      }

      // Registration closes with the start. The code still resolves: the
      // signaling server knows nothing about rooms.
      if (room.status === 'sorting') {
        send(channel, { type: 'started' });
        return;
      }

      // The parser already dropped any nickname admit would refuse, which
      // leaves a full room as the only answer to send.
      const admission = admit(room.participants, message.nickname);
      if (!admission.ok) {
        send(channel, { type: 'full' });
        return;
      }
      id = admission.participant.id;
      seat = crypto.randomUUID();
      seats.set(seat, id);
      setParticipants(admission.participants);
      send(channel, {
        type: 'welcome',
        you: id,
        seat,
        criterion,
        participants: admission.participants,
      });
      channels.set(id, channel);
    });

    // In the lobby a guest who drops has left, and coming back is joining
    // again. Mid-sort nobody else can join, so the place waits for them.
    channel.on('close', () => {
      if (id === null || channels.get(id) !== channel || mine !== attempt) return;
      channels.delete(id);
      const { participants, status } = useRoom.getState();
      if (status === 'sorting') {
        setParticipants(setConnected(participants, id, false));
        awaitReturn(id);
      } else {
        if (seat !== null) seats.delete(seat);
        setParticipants(leave(participants, id));
      }
    });
  });

  const you = creator.participant.id;
  startHere = () => {
    // A copy, as when the room opened, so the placement never holds the
    // room's own rows.
    const list = useRoom.getState().items.map((item) => ({ ...item }));
    for (const channel of channels.values()) {
      send(channel, { type: 'start', items: list, criterion });
    }
    setParticipants(startAll(useRoom.getState().participants));
    usePlacement.getState().start(list, criterion);
    useRoom.getState().startSorting(list);
    follow((placed) => setParticipants(setProgress(useRoom.getState().participants, you, placed)));
  };

  // The creator has no seat, so they are never found here. Someone who is
  // away has no channel either, and hears it when they try to come back.
  removeHere = (id) => {
    const seat = [...seats].find(([, owner]) => owner === id)?.[0];
    if (seat === undefined) return;
    seats.delete(seat);
    removedSeats.add(seat);
    stopWaiting(id);
    const channel = channels.get(id);
    channels.delete(id);
    if (channel) {
      send(channel, { type: 'removed' });
      // Flushing sends a close of its own after the message, so the guest
      // reads why before their channel goes. A plain close could drop it on
      // the way.
      channel.close({ flush: true });
    }
    setParticipants(exclude(useRoom.getState().participants, id));
  };

  useRoom.getState().enterLobby({
    code: result.code,
    you,
    criterion,
    participants: creator.participants,
    items: items.map((item) => ({ ...item })),
  });
}

// What a guest carries from one connection to the next.
interface Guest {
  code: string;
  nickname: string;
  // Handed over with the welcome. Null before it, which is what tells a first
  // join from a return.
  seat: string | null;
  you: string | null;
  // Where the progress goes. Null between connections.
  channel: DataConnection | null;
}

function save(guest: Guest) {
  const { items, criterion, placement } = usePlacement.getState();
  if (!placement || guest.seat === null || guest.you === null) return;
  const { code, seat, you, nickname } = guest;
  writeTabRecord({ code, seat, you, nickname, items, criterion, placement });
}

function followAsGuest(guest: Guest) {
  follow(
    (placed) => void guest.channel?.send({ type: 'progress', placed } satisfies GuestMessage),
    () => save(guest),
  );
  save(guest);
}

// The room is over for this tab, whatever the reason, and a reload must not
// try to get back into it.
function end(how: 'close' | 'remove' | 'replace') {
  letGo();
  clearTabRecord();
  useRoom.getState()[how]();
}

function later(mine: number, guest: Guest, tries: number, wait?: number) {
  const delay = wait ?? RETRY_DELAYS_MS[Math.min(tries, RETRY_DELAYS_MS.length - 1)];
  retry = setTimeout(() => void reach(mine, guest, tries + 1), delay);
}

// One try at the host: lookup, Peer, channel, join. A first join that fails
// ends on the entry screen with the reason. A return keeps trying until the
// room is gone or the host turns the seat down.
async function reach(mine: number, guest: Guest, tries: number) {
  const returning = guest.seat !== null;

  const found = await signaling.findRoom(guest.code);
  if (mine !== attempt) return;
  if (found.kind !== 'found') {
    if (!returning) {
      useRoom.getState().fail(found);
    } else if (found.kind === 'not-found') {
      end('close');
    } else {
      later(
        mine,
        guest,
        tries,
        found.kind === 'rate-limited' ? found.retryAfter * 1000 : undefined,
      );
    }
    return;
  }

  const iceServers = await signaling.iceServers();
  if (mine !== attempt) return;
  const created = new Peer(peerOptions(iceServers));
  peer = created;
  if (!(await opened(created))) {
    if (mine !== attempt) return;
    peer = null;
    if (returning) later(mine, guest, tries);
    else useRoom.getState().fail({ kind: 'unreachable' });
    return;
  }
  if (mine !== attempt) return;

  const channel = created.connect(found.peerId, { serialization: 'json', reliable: true });
  // Let in on this channel, by a welcome or a resume.
  let admitted = false;
  let over = false;

  // Destroying the Peer closes the channel on the spot, and its close handler
  // lands back here before this call is done. The first reason is the one kept.
  const stop = () => {
    over = true;
    clearTimeout(timer);
    created.destroy();
    if (peer === created) peer = null;
    if (guest.channel === channel) guest.channel = null;
  };

  const giveUp = (kind: 'full' | 'started' | 'unreachable') => {
    if (over) return;
    stop();
    if (mine !== attempt) return;
    if (!returning) useRoom.getState().fail({ kind });
    else if (kind === 'unreachable') later(mine, guest, tries);
    // The seat means nothing to the host any more.
    else end('close');
  };
  const timer = setTimeout(() => giveUp('unreachable'), WELCOME_TIMEOUT_MS);

  // Among others, the host's ID having gone from the server: the host left
  // between the lookup and this connection. Once in, an error is about the
  // signaling server, and the channel may well be fine.
  created.on('error', () => {
    if (!admitted) giveUp('unreachable');
  });

  channel.on('open', () => {
    const { nickname, seat } = guest;
    const join: GuestMessage =
      seat === null ? { type: 'join', nickname } : { type: 'join', nickname, seat };
    void channel.send(join);
  });

  channel.on('data', (data) => {
    const message = parseHostMessage(data);
    if (!message || mine !== attempt || over) return;
    const room = useRoom.getState();

    if (message.type === 'welcome' && !admitted && !returning) {
      admitted = true;
      clearTimeout(timer);
      Object.assign(guest, { seat: message.seat, you: message.you, channel });
      room.enterLobby({
        code: guest.code,
        you: message.you,
        criterion: message.criterion,
        participants: message.participants,
      });
    } else if (message.type === 'resume' && !admitted && returning) {
      admitted = true;
      clearTimeout(timer);
      Object.assign(guest, { seat: message.seat, you: message.you, channel });
      // The list stays the one this tab was sorting: a return only happens
      // mid-sort or from a tab record, and both still hold it.
      room.resume({
        you: message.you,
        criterion: message.criterion,
        participants: message.participants,
        items: message.items,
      });
      // The count only goes out when it changes, and whatever was placed
      // while away changed it with nobody to tell.
      void channel.send({ type: 'progress', placed: placedCount() } satisfies GuestMessage);
    } else if (message.type === 'participants' && admitted) {
      room.setParticipants(message.participants);
    } else if (message.type === 'start' && admitted && room.status === 'lobby') {
      // The placement draws its own shuffle, so each person gets an order of
      // their own.
      usePlacement.getState().start(message.items, message.criterion);
      room.startSorting(message.items);
      followAsGuest(guest);
    } else if (message.type === 'removed' && (admitted || returning)) {
      // Stopped before letting go: destroying the Peer closes the channel,
      // and its close handler would take it for a drop.
      stop();
      end('remove');
    } else if (message.type === 'replaced' && admitted) {
      stop();
      end('replace');
    } else if ((message.type === 'full' || message.type === 'started') && !admitted) {
      giveUp(message.type);
    }
  });

  channel.on('close', () => {
    if (mine !== attempt || over) return;
    if (!admitted) {
      giveUp('unreachable');
      return;
    }
    stop();
    // Mid-sort the guest keeps going while the way back is found. In the
    // lobby there is nothing to keep, and the host has already let them go.
    if (useRoom.getState().status === 'sorting') {
      useRoom.getState().reconnect();
      later(mine, guest, 0);
    } else {
      end('close');
    }
  });
}

export async function joinRoom(code: string, nickname: string) {
  const mine = begin('guest');
  await reach(mine, { code, nickname, seat: null, you: null, channel: null }, 0);
}

// A reload mid-sort. The tab kept the list and the seat, and goes back in
// without asking anything.
export function resumeRoom(record: TabRecord) {
  const mine = begin('guest');
  const { code, seat, you, nickname, items, criterion, placement } = record;
  usePlacement.setState({ items, criterion, placement });
  useRoom.getState().reconnect({ code, you });
  const guest: Guest = { code, nickname, seat, you, channel: null };
  followAsGuest(guest);
  void reach(mine, guest, 0);
}

// Every channel goes with the Peer: a host's guests see the room close, and a
// guest's host drops them from the list.
export function leaveRoom() {
  attempt++;
  letGo();
  clearTabRecord();
  useRoom.getState().leave();
}

// Sends the list to everyone and starts the host's own sorting with it. From
// then on nobody else gets in.
export function startRoom() {
  const { status, participants } = useRoom.getState();
  if (status !== 'lobby' || participants.length < START_MINIMUM) return;
  startHere?.();
}

// Only the host holds the channels, so on a guest this does nothing.
export function removeParticipant(id: string) {
  removeHere?.(id);
}

// A closed tab does not close its channels on its own. The other end only
// notices once ICE gives up on it, around half a minute later, and until then
// a guest who left is still listed.
window.addEventListener('pagehide', () => peer?.destroy());
