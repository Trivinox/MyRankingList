import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Item, RankedSlot } from '../core/types.ts';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import type { Role } from '../state/roomStore.ts';
import { SIGNALING_URL } from './config.ts';
import {
  INACTIVITY_TIMEOUT_MS,
  START_MINIMUM,
  admit,
  coversItems,
  exclude,
  leave,
  markFinished,
  newRound,
  setConnected,
  setProgress,
  startAll,
} from './hostRoom.ts';
import type { Participant } from './hostRoom.ts';
import { rememberRoomLink } from './link.ts';
import { parseGuestMessage, parseHostMessage } from './protocol.ts';
import type { GuestMessage, HostMessage } from './protocol.ts';
import { buildResult, fitsItems } from './result.ts';
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
// it a while for a host who may be coming back. The host waits the same
// between its own tries at getting back to the server.
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000];

const delayAfter = (tries: number) => RETRY_DELAYS_MS[Math.min(tries, RETRY_DELAYS_MS.length - 1)];

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
let againHere: ((items: Item[], criterion: string) => void) | null = null;
let prepareHere: ((preparing: boolean) => void) | null = null;
let removeHere: ((id: string) => void) | null = null;
let closeHere: (() => void) | null = null;
// A guest's is set once sorting starts, with the channel it sends on.
let finishHere: (() => void) | null = null;
let unfollow: (() => void) | null = null;
// The next try at getting back: a guest's to the host, or the host's to the
// signaling server.
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
  // Guests hear it from the host before their channels go, instead of taking
  // the silence for a drop and trying to get back in.
  closeHere?.();
  // Cleared first: destroying a Peer fires its `disconnected`, and the host's
  // handler must see that this Peer is no longer the room's.
  const leaving = peer;
  peer = null;
  leaving?.destroy();
  startHere = null;
  againHere = null;
  prepareHere = null;
  removeHere = null;
  closeHere = null;
  finishHere = null;
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

  // Taken now: peerjs forgets the ID while the Peer is away from the server.
  const peerId = host.id;
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
  // Finished lists by participant id. Kept here and not in the store, like
  // the seats: nobody sees anyone else's list before the reveal.
  const lists = new Map<string, RankedSlot[]>();
  // The creator is off writing the list for another round, and the guests are
  // waiting for it.
  let preparing = false;

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

  // Everything that can leave the room with nobody still owing a list comes
  // through here: the last list arriving, or the last one missing taken out.
  // Someone away who never finished keeps it waiting until they come back
  // and do, or the creator finishes without them. The status changing is
  // what makes it happen once.
  const revealIfDone = () => {
    const room = useRoom.getState();
    if (room.status !== 'sorting' || !room.participants.every((p) => p.finished)) return;
    const result = buildResult(room.participants, lists);
    for (const channel of channels.values()) send(channel, { type: 'result', result });
    room.reveal(result);
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

      // Taken once and never replaced, so a second one changes nothing.
      if (message.type === 'finish') {
        if (id === null || channels.get(id) !== channel) return;
        if (room.status !== 'sorting' || lists.has(id)) return;
        if (!coversItems(message.slots, room.items)) return;
        lists.set(id, message.slots);
        setParticipants(markFinished(room.participants, id));
        revealIfDone();
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
        const { participants, items, criterion, result } = useRoom.getState();
        send(
          channel,
          room.status === 'lobby'
            ? { type: 'welcome', you: id, seat, criterion, participants }
            : { type: 'resume', you: id, seat, criterion, participants, items },
        );
        // Whoever comes back after the reveal missed it, and it is still the
        // same for everyone. Unless the creator has moved on to the next
        // list, and then the lobby is where everyone else is.
        if (preparing) send(channel, { type: 'lobby' });
        else if (result) send(channel, { type: 'result', result });
        return;
      }

      // Registration closes with the start. The code still resolves: the
      // signaling server knows nothing about rooms.
      if (room.status !== 'lobby') {
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
        criterion: room.criterion,
        participants: admission.participants,
      });
      channels.set(id, channel);
    });

    // In the lobby a guest who drops has left, and coming back is joining
    // again. From the start on nobody else can join, so the place waits for
    // them, through the reveal too.
    channel.on('close', () => {
      if (id === null || channels.get(id) !== channel || mine !== attempt) return;
      channels.delete(id);
      const { participants, status } = useRoom.getState();
      if (status === 'lobby') {
        if (seat !== null) seats.delete(seat);
        setParticipants(leave(participants, id));
      } else {
        setParticipants(setConnected(participants, id, false));
        // Someone whose list is in is not waited for: it counts whether they
        // come back or not.
        if (!lists.has(id)) awaitReturn(id);
      }
    });
  });

  const you = creator.participant.id;

  // The first round and every one after it. Each placement draws its own
  // shuffle, this one here and each guest's on their side, so every round's
  // order is drawn again for each person.
  const startRound = (participants: Participant[], items: Item[], criterion: string) => {
    // A copy, as when the room opened, so the placement never holds the
    // room's own rows.
    const list = items.map((item) => ({ ...item }));
    for (const channel of channels.values()) {
      send(channel, { type: 'start', items: list, criterion });
    }
    setParticipants(participants);
    // Before the new placement goes in, or the last round's count would be
    // taken for progress in this one.
    stopFollowing();
    usePlacement.getState().start(list, criterion);
    useRoom.getState().startSorting(list, criterion);
    follow((placed) => setParticipants(setProgress(useRoom.getState().participants, you, placed)));
  };

  startHere = () => {
    const { participants, items, criterion } = useRoom.getState();
    startRound(startAll(participants), items, criterion);
  };

  againHere = (items, criterion) => {
    const staying = newRound(useRoom.getState().participants);
    // Whoever is let go loses their seat with them. Coming back, they get
    // what anyone new gets once a room has started.
    for (const [seat, owner] of seats) {
      if (!staying.some((p) => p.id === owner)) seats.delete(seat);
    }
    lists.clear();
    preparing = false;
    startRound(staying, items, criterion);
  };

  // Going back to the result without starting anything takes everyone back
  // to it too.
  prepareHere = (now) => {
    preparing = now;
    // Only a revealed room gets here, and it has its result.
    const result = useRoom.getState().result!;
    for (const channel of channels.values()) {
      send(channel, now ? { type: 'lobby' } : { type: 'result', result });
    }
  };

  // The creator has no seat, so they are never found here. Someone who is
  // away has no channel either, and hears it when they try to come back.
  removeHere = (id) => {
    const seat = [...seats].find(([, owner]) => owner === id)?.[0];
    if (seat === undefined) return;
    seats.delete(seat);
    removedSeats.add(seat);
    // A list they already handed in goes with them.
    lists.delete(id);
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
    revealIfDone();
  };

  closeHere = () => {
    for (const channel of channels.values()) send(channel, { type: 'closed' });
  };

  finishHere = () => {
    const { placement } = usePlacement.getState();
    if (!placement || lists.has(you)) return;
    lists.set(you, placement.rankedSlots);
    setParticipants(markFinished(useRoom.getState().participants, you));
    revealIfDone();
  };

  // The socket to the signaling server dropped, and the channels are still
  // up: the room goes on, but nobody new can find it. When peerjs takes the
  // new socket in place of an old one the server has not closed yet, it never
  // fires `open`, so being back is the server giving the code again. A 409 is
  // the server not having the new socket yet.
  let away = false;
  const getBack = (tries: number) => {
    if (host.disconnected) host.reconnect();
    retry = setTimeout(async () => {
      const answer = await signaling.openRoom(peerId);
      if (peer !== host) return;
      if (answer.kind !== 'opened') {
        getBack(tries + 1);
        return;
      }
      away = false;
      // Past the grace window the old code was freed, and may already be
      // someone else's. Everyone inside needs the new one to find the room
      // again after a reload.
      if (answer.code !== useRoom.getState().code) {
        useRoom.getState().setCode(answer.code);
        for (const channel of channels.values()) send(channel, { type: 'code', code: answer.code });
      }
    }, delayAfter(tries));
  };
  // A reconnection that fails drops the socket again and lands back here,
  // while the tries already under way carry on.
  host.on('disconnected', () => {
    if (peer !== host || away) return;
    away = true;
    getBack(0);
  });

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
  const { items, criterion, placement, finished } = usePlacement.getState();
  const { result } = useRoom.getState();
  if (!placement || guest.seat === null || guest.you === null) return;
  const { code, seat, you, nickname } = guest;
  writeTabRecord({ code, seat, you, nickname, items, criterion, placement, finished, result });
}

// Without a channel it goes after the resume instead, once the host's entry
// shows it never arrived.
function handIn(guest: Guest) {
  const { placement, finished } = usePlacement.getState();
  if (!placement || !finished) return;
  void guest.channel?.send({ type: 'finish', slots: placement.rankedSlots } satisfies GuestMessage);
}

function followAsGuest(guest: Guest) {
  follow(
    (placed) => void guest.channel?.send({ type: 'progress', placed } satisfies GuestMessage),
    () => save(guest),
  );
  finishHere = () => handIn(guest);
  save(guest);
}

// The room is over for this tab, whatever the reason, and a reload must not
// try to get back into it.
function endHere(how: 'close' | 'end' | 'remove' | 'replace' | 'miss') {
  letGo();
  clearTabRecord();
  useRoom.getState()[how]();
}

function later(mine: number, guest: Guest, tries: number, wait?: number) {
  retry = setTimeout(() => void reach(mine, guest, tries + 1), wait ?? delayAfter(tries));
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
      endHere('end');
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

  // PeerJS's own binary format rather than JSON: its JSON channel refuses any
  // message past about 16 KB instead of splitting it, and a result with every
  // list of a full room in it is well past that.
  const channel = created.connect(found.peerId, { serialization: 'binary', reliable: true });
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
    // The seat means nothing to the host any more. Once sorting has started
    // the host only forgets one when another round starts without its owner.
    else endHere(kind === 'started' ? 'miss' : 'end');
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
      // Back after the reveal, which is already on screen, or to the lobby
      // after it. There is nothing left to report, and whatever the host sends
      // next says where the room is now.
      if (room.status === 'revealed' || room.status === 'preparing') {
        room.setParticipants(message.participants);
        return;
      }
      // The list stays the one this tab was sorting: a return only happens
      // mid-sort or from a tab record, and both still hold it.
      room.resume({
        you: message.you,
        criterion: message.criterion,
        participants: message.participants,
        items: message.items,
      });
      // The count only goes out when it changes, and whatever was placed
      // while away changed it with nobody to tell. The same goes for a list
      // handed in with the connection already gone.
      void channel.send({ type: 'progress', placed: placedCount() } satisfies GuestMessage);
      if (!message.participants.find((p) => p.id === message.you)?.finished) handIn(guest);
    } else if (message.type === 'participants' && admitted) {
      room.setParticipants(message.participants);
    } else if (
      message.type === 'start' &&
      admitted &&
      (room.status === 'lobby' || room.status === 'revealed' || room.status === 'preparing')
    ) {
      // The first round from the lobby, any other from the result or the
      // lobby after it. The placement draws its own shuffle, so each person
      // gets an order of their own, and a new one every round. The last
      // round's following goes first, or it would report the new list's
      // opening item as progress.
      stopFollowing();
      usePlacement.getState().start(message.items, message.criterion);
      room.startSorting(message.items, message.criterion);
      followAsGuest(guest);
    } else if (message.type === 'lobby' && admitted) {
      // Straight from the result, or from sorting when this tab dropped
      // before the reveal and came back after the creator moved on.
      if (room.status === 'revealed' || room.status === 'sorting') room.prepare();
    } else if (message.type === 'removed' && (admitted || returning)) {
      // Stopped before letting go: destroying the Peer closes the channel,
      // and its close handler would take it for a drop.
      stop();
      endHere('remove');
    } else if (message.type === 'replaced' && admitted) {
      stop();
      endHere('replace');
    } else if (message.type === 'closed' && admitted) {
      stop();
      endHere('close');
    } else if (
      message.type === 'result' &&
      admitted &&
      (room.status === 'sorting' || room.status === 'preparing')
    ) {
      // The reveal, or the creator going back to it instead of writing
      // another list.
      if (!fitsItems(message.result, room.items)) return;
      room.reveal(message.result);
      save(guest);
    } else if (message.type === 'code' && admitted) {
      // The lookup after a reload or a drop has to find the room under the
      // code it goes by now.
      guest.code = message.code;
      room.setCode(message.code);
      rememberRoomLink(message.code);
      save(guest);
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
    // Mid-sort the guest keeps going while the way back is found. After the
    // reveal they keep looking at it, or waiting for the next round, and the
    // way back is found all the same, without a word. In the first lobby
    // there is nothing to keep, and the host has already let them go.
    const { status } = useRoom.getState();
    if (status === 'sorting') {
      useRoom.getState().reconnect();
      later(mine, guest, 0);
    } else if (status === 'revealed' || status === 'preparing') {
      later(mine, guest, 0);
    } else {
      endHere('end');
    }
  });
}

export async function joinRoom(code: string, nickname: string) {
  const mine = begin('guest');
  await reach(mine, { code, nickname, seat: null, you: null, channel: null }, 0);
}

// A reload mid-sort or after the reveal. The tab kept the list and the seat,
// and the result once there was one, and goes back in without asking anything.
export function resumeRoom(record: TabRecord) {
  const mine = begin('guest');
  const { code, seat, you, nickname, items, criterion, placement, finished, result } = record;
  usePlacement.setState({ items, criterion, placement, finished });
  // The room's copy of the list too, which every result is checked against. A
  // resume mid-sort brings it again, but one after the reveal leaves it alone.
  useRoom.getState().reconnect({ code, you, items });
  if (result) useRoom.getState().reveal(result);
  const guest: Guest = { code, nickname, seat, you, channel: null };
  followAsGuest(guest);
  void reach(mine, guest, 0);
}

// Every channel goes with the Peer: a host's guests are told the room is
// closed, and a guest's host drops them from the list.
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

// Another round, from the result: with the same items unless new ones come,
// and the criterion the creator gave it. Everyone connected starts at once,
// and anyone away is left out of it. Registration stays closed.
export function playAgain({ items, criterion }: { items?: Item[]; criterion: string }) {
  const room = useRoom.getState();
  if (room.status !== 'revealed') return;
  if (room.participants.filter((p) => p.connected).length < START_MINIMUM) return;
  againHere?.(items ?? room.items, criterion);
}

// The creator goes to write the next list, and everyone else waits for it in
// the lobby. Nothing is reset until the round starts, so going back to the
// result leaves the room as it was.
export function changeList() {
  if (useRoom.getState().status === 'revealed') prepareHere?.(true);
}

export function backToResult() {
  if (useRoom.getState().status === 'revealed') prepareHere?.(false);
}

// Hands this person's list in: only in a room, only with nothing left in the
// pool, and only once. The list is locked from here on.
export function finishRoom() {
  const { placement, finished, finish } = usePlacement.getState();
  const { status } = useRoom.getState();
  if (!placement || finished || placement.pendingPool.length > 0) return;
  if (status !== 'sorting' && status !== 'reconnecting') return;
  finish();
  finishHere?.();
}

// Only the host holds the channels, so on a guest this does nothing.
export function removeParticipant(id: string) {
  removeHere?.(id);
}

// A closed tab does not close its channels on its own. The other end only
// notices once ICE gives up on it, around half a minute later, and until then
// a guest who left is still listed. A creator's tab also tells its guests the
// room is closed, which a crash never does: they only find out once the code
// is gone.
window.addEventListener('pagehide', letGo);

// A guest whose list is in has to stay for the reveal. The browser words the
// question itself and may not ask at all, on a phone above all, so it is a
// warning and nothing more: the list counts either way. The creator is not
// asked, since leaving is closing the room, and Close the room already asks.
window.addEventListener('beforeunload', (event) => {
  const { role, status } = useRoom.getState();
  const waiting = status === 'sorting' || status === 'reconnecting';
  if (role === 'guest' && waiting && usePlacement.getState().finished) event.preventDefault();
});
