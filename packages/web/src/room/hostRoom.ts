import { uniqueNickname } from './nicknames.ts';

// Creator included. It is the most connections one browser is asked to hold.
export const ROOM_LIMIT = 20;

// The id is the host's own, never the peer ID behind it: guests only ever
// learn this one, so they have nothing to connect to each other with.
export interface Participant {
  id: string;
  nickname: string;
  isCreator: boolean;
}

export type Admission =
  | { ok: true; participant: Participant; participants: Participant[] }
  | { ok: false; reason: 'full' | 'nickname' };

export function admit(participants: Participant[], wanted: string, isCreator = false): Admission {
  if (participants.length >= ROOM_LIMIT) return { ok: false, reason: 'full' };

  const taken = participants.map((p) => p.nickname);
  const nickname = uniqueNickname(taken, wanted);
  if (nickname === null) return { ok: false, reason: 'nickname' };

  const participant = { id: crypto.randomUUID(), nickname, isCreator };
  return { ok: true, participant, participants: [...participants, participant] };
}

export function leave(participants: Participant[], id: string): Participant[] {
  return participants.filter((p) => p.id !== id);
}
