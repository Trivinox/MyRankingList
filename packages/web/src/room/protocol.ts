import { isAllowedImageUrl } from '../core/images.ts';
import type { Item } from '../core/types.ts';
import type { Participant } from './hostRoom.ts';
import { NICKNAME_LIMIT } from './nicknames.ts';

// The same bounds the form puts on a list.
const MIN_ITEMS = 3;
const TEXT_LIMIT = 80;

// `seat` is only sent by someone coming back, to get their place again.
// `placed` counts the opening item, so it is never below 1.
export type GuestMessage =
  { type: 'join'; nickname: string; seat?: string } | { type: 'progress'; placed: number };

// `you` tells the guest which of the participants is them, and `seat` is the
// secret that gets that place back later. It goes to its owner alone. `resume`
// answers a seat that returns mid-sort. `started` is the answer to a join once
// registration has closed. `removed` is the last thing a guest hears from a
// creator who took them out, and `replaced` what an older tab hears when the
// same seat connects again from another.
export type HostMessage =
  | { type: 'welcome'; you: string; seat: string; criterion: string; participants: Participant[] }
  | {
      type: 'resume';
      you: string;
      seat: string;
      criterion: string;
      participants: Participant[];
      items: Item[];
    }
  | { type: 'participants'; participants: Participant[] }
  | { type: 'full' }
  | { type: 'start'; items: Item[]; criterion: string }
  | { type: 'started' }
  | { type: 'removed' }
  | { type: 'replaced' };

// Everything below arrives from another person's browser, which may run
// anything at all. A message that is not exactly one of ours is dropped, and
// the parsed copy carries only the fields named here.

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown, min: number): value is number =>
  Number.isInteger(value) && (value as number) >= min;

function toParticipants(value: unknown): Participant[] | null {
  if (!Array.isArray(value)) return null;
  const participants: Participant[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.nickname !== 'string' ||
      typeof entry.isCreator !== 'boolean' ||
      !isCount(entry.progress, 0) ||
      typeof entry.connected !== 'boolean'
    ) {
      return null;
    }
    participants.push({
      id: entry.id,
      nickname: entry.nickname,
      isCreator: entry.isCreator,
      progress: entry.progress,
      connected: entry.connected,
    });
  }
  return participants;
}

// A list the form would not have let through is refused whole: sorting part of
// someone else's list would leave everyone comparing different things. An
// image link is the one exception, since the item still stands without it and
// the form itself only flags a bad one.
function toItems(value: unknown): Item[] | null {
  if (!Array.isArray(value) || value.length < MIN_ITEMS) return null;
  const items: Item[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || ids.has(entry.id)) return null;
    const { text, imageUrl } = entry;
    if (typeof text !== 'string' || text.trim() === '' || text.length > TEXT_LIMIT) return null;
    if (imageUrl !== undefined && typeof imageUrl !== 'string') return null;

    ids.add(entry.id);
    items.push(
      imageUrl && isAllowedImageUrl(imageUrl)
        ? { id: entry.id, text, imageUrl }
        : { id: entry.id, text },
    );
  }
  return items;
}

// The form sends neither a blank nickname nor one over the limit. Dropping
// both here leaves a full room as the only refusal the host has to answer.
// Progress is only checked for shape: the host alone knows how long the list is.
export function parseGuestMessage(data: unknown): GuestMessage | null {
  if (!isRecord(data)) return null;

  switch (data.type) {
    case 'join': {
      const { nickname, seat } = data;
      if (typeof nickname !== 'string') return null;
      const length = nickname.trim().length;
      if (length === 0 || length > NICKNAME_LIMIT) return null;
      if (seat === undefined) return { type: 'join', nickname };
      return typeof seat === 'string' ? { type: 'join', nickname, seat } : null;
    }
    case 'progress':
      return isCount(data.placed, 1) ? { type: 'progress', placed: data.placed } : null;
    default:
      return null;
  }
}

export function parseHostMessage(data: unknown): HostMessage | null {
  if (!isRecord(data)) return null;

  switch (data.type) {
    case 'welcome':
    case 'resume': {
      const { you, seat, criterion } = data;
      const participants = toParticipants(data.participants);
      if (typeof you !== 'string' || typeof seat !== 'string' || typeof criterion !== 'string') {
        return null;
      }
      if (!participants) return null;
      if (data.type === 'welcome') return { type: 'welcome', you, seat, criterion, participants };
      const items = toItems(data.items);
      return items && { type: 'resume', you, seat, criterion, participants, items };
    }
    case 'participants': {
      const participants = toParticipants(data.participants);
      return participants && { type: 'participants', participants };
    }
    case 'start': {
      const items = toItems(data.items);
      if (!items || typeof data.criterion !== 'string') return null;
      return { type: 'start', items, criterion: data.criterion };
    }
    case 'full':
    case 'started':
    case 'removed':
    case 'replaced':
      return { type: data.type };
    default:
      return null;
  }
}
