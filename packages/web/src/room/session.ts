import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Item } from '../core/types.ts';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import type { Role } from '../state/roomStore.ts';
import { SIGNALING_URL } from './config.ts';
import { START_MINIMUM, admit, exclude, leave, setProgress, startAll } from './hostRoom.ts';
import type { Participant } from './hostRoom.ts';
import { parseGuestMessage, parseHostMessage } from './protocol.ts';
import type { GuestMessage, HostMessage } from './protocol.ts';
import { createSignaling } from './signaling.ts';

// The only module that touches peerjs. It turns what happens on the network
// into store updates, and the screens never see a Peer or a channel.

// A guest who found the code but hears nothing from the host in this long
// gives up. The lookup before it has no limit: a sleeping server on Render
// takes close to a minute to wake, and that wait says nothing about the host.
const WELCOME_TIMEOUT_MS = 20_000;

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

function stopFollowing() {
  unfollow?.();
  unfollow = null;
}

function letGo() {
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

// Only the count leaves this browser, never the list, and only when it
// changes: moving an item that is already placed leaves it as it was.
function follow(report: (placed: number) => void) {
  const count = () => {
    const { items, placement } = usePlacement.getState();
    return placement ? items.length - placement.pendingPool.length : 0;
  };
  let last = count();
  unfollow = usePlacement.subscribe(() => {
    const placed = count();
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

  host.on('connection', (channel) => {
    let id: string | null = null;

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
      setParticipants(admission.participants);
      send(channel, { type: 'welcome', you: id, criterion, participants: admission.participants });
      channels.set(id, channel);
    });

    channel.on('close', () => {
      if (id === null || channels.get(id) !== channel || mine !== attempt) return;
      channels.delete(id);
      setParticipants(leave(useRoom.getState().participants, id));
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

  // The creator has no channel, so they are never found here.
  removeHere = (id) => {
    const channel = channels.get(id);
    if (!channel) return;
    channels.delete(id);
    send(channel, { type: 'removed' });
    // Flushing sends a close of its own after the message, so the guest reads
    // why before their channel goes. A plain close could drop it on the way.
    channel.close({ flush: true });
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

export async function joinRoom(code: string, nickname: string) {
  const mine = begin('guest');

  const found = await signaling.findRoom(code);
  if (mine !== attempt) return;
  if (found.kind !== 'found') {
    useRoom.getState().fail(found);
    return;
  }

  const iceServers = await signaling.iceServers();
  if (mine !== attempt) return;
  const guest = new Peer(peerOptions(iceServers));
  peer = guest;
  if (!(await opened(guest))) {
    if (mine === attempt) {
      peer = null;
      useRoom.getState().fail({ kind: 'unreachable' });
    }
    return;
  }
  if (mine !== attempt) return;

  const channel = guest.connect(found.peerId, { serialization: 'json', reliable: true });
  let admitted = false;
  let gaveUp = false;
  let removed = false;

  // Destroying the Peer closes the channel on the spot, and its close handler
  // lands back here before this call is done. The first reason is the one kept.
  const giveUp = (kind: 'full' | 'started' | 'unreachable') => {
    if (gaveUp) return;
    gaveUp = true;
    clearTimeout(timer);
    guest.destroy();
    if (mine !== attempt) return;
    peer = null;
    useRoom.getState().fail({ kind });
  };
  const timer = setTimeout(() => giveUp('unreachable'), WELCOME_TIMEOUT_MS);

  // Among others, the host's ID having gone from the server: the host left
  // between the lookup and this connection.
  guest.on('error', () => {
    if (!admitted) giveUp('unreachable');
  });

  channel.on('open', () => {
    void channel.send({ type: 'join', nickname } satisfies GuestMessage);
  });

  channel.on('data', (data) => {
    const message = parseHostMessage(data);
    if (!message || mine !== attempt) return;

    if (message.type === 'welcome' && !admitted) {
      admitted = true;
      clearTimeout(timer);
      useRoom.getState().enterLobby({
        code,
        you: message.you,
        criterion: message.criterion,
        participants: message.participants,
      });
    } else if (message.type === 'participants' && admitted) {
      useRoom.getState().setParticipants(message.participants);
    } else if (message.type === 'start' && admitted && useRoom.getState().status === 'lobby') {
      // The placement draws its own shuffle, so each person gets an order of
      // their own.
      usePlacement.getState().start(message.items, message.criterion);
      useRoom.getState().startSorting(message.items);
      follow((placed) => void channel.send({ type: 'progress', placed } satisfies GuestMessage));
    } else if (message.type === 'removed' && admitted) {
      // Set before letting go: destroying the Peer closes the channel, and its
      // close handler would call the room closed.
      removed = true;
      letGo();
      useRoom.getState().remove();
    } else if ((message.type === 'full' || message.type === 'started') && !admitted) {
      giveUp(message.type);
    }
  });

  channel.on('close', () => {
    if (mine !== attempt || removed) return;
    if (admitted) {
      letGo();
      useRoom.getState().close();
    } else {
      giveUp('unreachable');
    }
  });
}

// Every channel goes with the Peer: a host's guests see the room close, and a
// guest's host drops them from the list.
export function leaveRoom() {
  attempt++;
  letGo();
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
