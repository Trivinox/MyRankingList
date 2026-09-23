import type { Participant } from './hostRoom.ts';
import { NICKNAME_LIMIT } from './nicknames.ts';

export type GuestMessage = { type: 'join'; nickname: string };

// `you` tells the guest which of the participants is them.
export type HostMessage =
  | { type: 'welcome'; you: string; criterion: string; participants: Participant[] }
  | { type: 'participants'; participants: Participant[] }
  | { type: 'full' };

// Everything below arrives from another person's browser, which may run
// anything at all. A message that is not exactly one of ours is dropped, and
// the parsed copy carries only the fields named here.

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function toParticipants(value: unknown): Participant[] | null {
  if (!Array.isArray(value)) return null;
  const participants: Participant[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.nickname !== 'string' ||
      typeof entry.isCreator !== 'boolean'
    ) {
      return null;
    }
    participants.push({ id: entry.id, nickname: entry.nickname, isCreator: entry.isCreator });
  }
  return participants;
}

// The form sends neither a blank nickname nor one over the limit. Dropping
// both here leaves a full room as the only refusal the host has to answer.
export function parseGuestMessage(data: unknown): GuestMessage | null {
  if (!isRecord(data) || data.type !== 'join') return null;
  const { nickname } = data;
  if (typeof nickname !== 'string') return null;
  const length = nickname.trim().length;
  if (length === 0 || length > NICKNAME_LIMIT) return null;
  return { type: 'join', nickname };
}

export function parseHostMessage(data: unknown): HostMessage | null {
  if (!isRecord(data)) return null;

  switch (data.type) {
    case 'welcome': {
      const participants = toParticipants(data.participants);
      if (typeof data.you !== 'string' || typeof data.criterion !== 'string' || !participants) {
        return null;
      }
      return { type: 'welcome', you: data.you, criterion: data.criterion, participants };
    }
    case 'participants': {
      const participants = toParticipants(data.participants);
      return participants && { type: 'participants', participants };
    }
    case 'full':
      return { type: 'full' };
    default:
      return null;
  }
}
