import { uniqueNickname } from './nicknames.ts';

// Creator included. It is the most connections one browser is asked to hold.
export const ROOM_LIMIT = 20;

// Creator included. A room of one would be sorting alone.
export const START_MINIMUM = 2;

// The id is the host's own, never the peer ID behind it. A guest who knew
// another's peer ID could open a channel straight to them, and the star would
// stop being one.
//
// `progress` is how many items they have placed. The total is the length of
// the list, the same for everyone, so it is not kept per person.
export interface Participant {
  id: string;
  nickname: string;
  isCreator: boolean;
  progress: number;
}

export type Admission =
  | { ok: true; participant: Participant; participants: Participant[] }
  | { ok: false; reason: 'full' | 'nickname' };

export function admit(participants: Participant[], wanted: string, isCreator = false): Admission {
  if (participants.length >= ROOM_LIMIT) return { ok: false, reason: 'full' };

  const taken = participants.map((p) => p.nickname);
  const nickname = uniqueNickname(taken, wanted);
  if (nickname === null) return { ok: false, reason: 'nickname' };

  const participant = { id: crypto.randomUUID(), nickname, isCreator, progress: 0 };
  return { ok: true, participant, participants: [...participants, participant] };
}

export function leave(participants: Participant[], id: string): Participant[] {
  return participants.filter((p) => p.id !== id);
}

// Everyone's list opens with one item already down, so the count starts at 1.
export function startAll(participants: Participant[]): Participant[] {
  return participants.map((p) => ({ ...p, progress: 1 }));
}

export function setProgress(participants: Participant[], id: string, placed: number) {
  return participants.map((p) => (p.id === id ? { ...p, progress: placed } : p));
}
