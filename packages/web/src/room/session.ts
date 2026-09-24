import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Item } from '../core/types.ts';
import { useRoom } from '../state/roomStore.ts';
import type { Role } from '../state/roomStore.ts';
import { SIGNALING_URL } from './config.ts';
import { admit, leave } from './hostRoom.ts';
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
// PeerJS's own public TURN servers with it. Google's STUN is the only one chosen.
const peerOptions = {
  host: server.hostname,
  port: Number(server.port) || (secure ? 443 : 80),
  path: server.pathname,
  secure,
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
};

// One room at a time. Every create, join or leave bumps the attempt, and the
// callbacks of an older one check it and stop writing to the store.
let peer: Peer | null = null;
let attempt = 0;

function begin(role: Role) {
  peer?.destroy();
  peer = null;
  useRoom.getState().connect(role);
  return ++attempt;
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
  const host = new Peer(peerOptions);
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

  host.on('connection', (channel) => {
    let id: string | null = null;

    channel.on('data', (data) => {
      const message = parseGuestMessage(data);
      if (!message || id !== null || mine !== attempt) return;

      // The parser already dropped any nickname admit would refuse, which
      // leaves a full room as the only answer to send.
      const admission = admit(useRoom.getState().participants, message.nickname);
      if (!admission.ok) {
        send(channel, { type: 'full' });
        return;
      }
      id = admission.participant.id;
      useRoom.getState().setParticipants(admission.participants);
      tellEveryone();
      send(channel, { type: 'welcome', you: id, criterion, participants: admission.participants });
      channels.set(id, channel);
    });

    channel.on('close', () => {
      if (id === null || mine !== attempt) return;
      channels.delete(id);
      useRoom.getState().setParticipants(leave(useRoom.getState().participants, id));
      tellEveryone();
    });
  });

  useRoom.getState().enterLobby({
    code: result.code,
    you: creator.participant.id,
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

  const guest = new Peer(peerOptions);
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

  // Destroying the Peer closes the channel on the spot, and its close handler
  // lands back here before this call is done. The first reason is the one kept.
  const giveUp = (kind: 'full' | 'unreachable') => {
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
    } else if (message.type === 'full' && !admitted) {
      giveUp('full');
    }
  });

  channel.on('close', () => {
    if (mine !== attempt) return;
    if (admitted) {
      guest.destroy();
      peer = null;
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
  peer?.destroy();
  peer = null;
  useRoom.getState().leave();
}

// A closed tab does not close its channels on its own. The other end only
// notices once ICE gives up on it, around half a minute later, and until then
// a guest who left is still listed.
window.addEventListener('pagehide', () => peer?.destroy());
