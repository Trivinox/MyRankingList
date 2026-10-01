import type { Item, RankedSlot } from '../core/types.ts';
import { uniqueNickname } from './nicknames.ts';

// Creator included. It is the most connections one browser is asked to hold.
export const ROOM_LIMIT = 20;

// Creator included. A room of one would be sorting alone.
export const START_MINIMUM = 2;

// How long someone can be away mid-sort before the creator is offered to
// finish without them. A starting value, meant to be tuned.
export const INACTIVITY_TIMEOUT_MS = 20 * 60_000;

// The id is the host's own, never the peer ID behind it. A guest who knew
// another's peer ID could open a channel straight to them, and the star would
// stop being one.
//
// `progress` is how many items they have placed. The total is the length of
// the list, the same for everyone, so it is not kept per person.
//
// `connected` goes false for someone whose channel dropped mid-sort. Their
// place and their count stay, waiting for them to come back.
//
// `finished` is someone whose list has reached the host. It is final: the
// list is never replaced, and it counts whether they come back or not.
export interface Participant {
  id: string;
  nickname: string;
  isCreator: boolean;
  progress: number;
  connected: boolean;
  finished: boolean;
}

export type Admission =
  | { ok: true; participant: Participant; participants: Participant[] }
  | { ok: false; reason: 'full' | 'nickname' };

export function admit(participants: Participant[], wanted: string, isCreator = false): Admission {
  if (participants.length >= ROOM_LIMIT) return { ok: false, reason: 'full' };

  const taken = participants.map((p) => p.nickname);
  const nickname = uniqueNickname(taken, wanted);
  if (nickname === null) return { ok: false, reason: 'nickname' };

  const participant = {
    id: crypto.randomUUID(),
    nickname,
    isCreator,
    progress: 0,
    connected: true,
    finished: false,
  };
  return { ok: true, participant, participants: [...participants, participant] };
}

export function leave(participants: Participant[], id: string): Participant[] {
  return participants.filter((p) => p.id !== id);
}

// Taking someone out on purpose, as opposed to them going. Every removal goes
// through here, whoever decides it. The creator cannot be taken out of their
// own room: without them there is no room left.
export function exclude(participants: Participant[], id: string): Participant[] {
  return participants.filter((p) => p.id !== id || p.isCreator);
}

// Everyone's list opens with one item already down, so the count starts at 1.
export function startAll(participants: Participant[]): Participant[] {
  return participants.map((p) => ({ ...p, progress: 1, finished: false }));
}

// Another round goes ahead with whoever is connected when it starts. Someone
// away is let go rather than waited for: their tab still holds the round
// before, and coming back into this one would put them on the wrong list.
export function newRound(participants: Participant[]): Participant[] {
  return startAll(participants.filter((p) => p.connected));
}

export function setProgress(participants: Participant[], id: string, placed: number) {
  return participants.map((p) => (p.id === id ? { ...p, progress: placed } : p));
}

export function setConnected(participants: Participant[], id: string, connected: boolean) {
  return participants.map((p) => (p.id === id ? { ...p, connected } : p));
}

export function markFinished(participants: Participant[], id: string) {
  return participants.map((p) => (p.id === id ? { ...p, finished: true } : p));
}

// A finished list has to hold the room's items, each once and nothing else.
// The parser only vouched for its shape, and the averages taken over the lists
// at the end would break on a repeat or a stranger.
export function coversItems(slots: RankedSlot[], items: Item[]) {
  return holdsEachItem(
    slots.flatMap((slot) => slot.itemIds),
    items,
  );
}

export function holdsEachItem(ids: string[], items: Item[]) {
  const wanted = new Set(items.map((item) => item.id));
  return (
    ids.length === wanted.size &&
    new Set(ids).size === ids.length &&
    ids.every((id) => wanted.has(id))
  );
}
