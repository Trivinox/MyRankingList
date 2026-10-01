import { isAllowedImageUrl } from '../core/images.ts';
import type { Item, RankedSlot } from '../core/types.ts';
import type { Participant } from './hostRoom.ts';
import { NICKNAME_LIMIT } from './nicknames.ts';
import type { Affinity, RoomResult } from './result.ts';
import { readRoomCode } from './roomCode.ts';

// The same bounds the form puts on a list.
const MIN_ITEMS = 3;
const TEXT_LIMIT = 80;

// `seat` is only sent by someone coming back, to get their place again.
// `placed` counts the opening item, so it is never below 1. `finish` carries
// the whole list, the one time it ever leaves the guest's browser.
export type GuestMessage =
  | { type: 'join'; nickname: string; seat?: string }
  | { type: 'progress'; placed: number }
  | { type: 'finish'; slots: RankedSlot[] };

// `you` tells the guest which of the participants is them, and `seat` is the
// secret that gets that place back later. It goes to its owner alone. `resume`
// answers a seat that returns mid-sort. `started` is the answer to a join once
// registration has closed. `removed` is the last thing a guest hears from a
// creator who took them out, and `replaced` what an older tab hears when the
// same seat connects again from another. `closed` is the creator leaving on
// purpose, and `code` the new code of a room whose creator came back to the
// signaling server too late to keep the old one. `result` is the reveal, the
// same for everyone, sent once when the last list is in and again to anyone
// who comes back after it. `lobby` sends everyone to wait while the creator
// writes the list for another round, and a `result` after it brings them back
// to the reveal if the creator changes their mind.
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
  | { type: 'replaced' }
  | { type: 'closed' }
  | { type: 'code'; code: string }
  | { type: 'result'; result: RoomResult }
  | { type: 'lobby' };

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
      typeof entry.connected !== 'boolean' ||
      typeof entry.finished !== 'boolean'
    ) {
      return null;
    }
    participants.push({
      id: entry.id,
      nickname: entry.nickname,
      isCreator: entry.isCreator,
      progress: entry.progress,
      connected: entry.connected,
      finished: entry.finished,
    });
  }
  return participants;
}

// Shape only. Which items the list has to hold is the host's to check, being
// the one that knows them.
function toSlots(value: unknown): RankedSlot[] | null {
  if (!Array.isArray(value)) return null;
  const slots: RankedSlot[] = [];
  for (const entry of value) {
    const ids = isRecord(entry) ? entry.itemIds : null;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 2) return null;
    if (!ids.every((id) => typeof id === 'string')) return null;
    slots.push({ itemIds: ids.length === 1 ? [ids[0]] : [ids[0], ids[1]] });
  }
  return slots;
}

// Again shape only: whether it is about this tab's items is the session's to
// check. What it does hold together on its own is checked here, since a pair
// naming someone with no list, or a coefficient past 1, would reach the screen.
function toResult(value: unknown): RoomResult | null {
  if (!isRecord(value)) return null;
  const { consensus, discrepancies, lists, affinity } = value;
  if (!Array.isArray(consensus) || !Array.isArray(discrepancies)) return null;
  if (!Array.isArray(lists) || !Array.isArray(affinity)) return null;

  const parsed: RoomResult = { consensus: [], discrepancies: [], lists: [], affinity: [] };

  for (const entry of consensus) {
    if (!isRecord(entry) || typeof entry.itemId !== 'string') return null;
    const { averagePosition, rank, tied } = entry;
    if (!Number.isFinite(averagePosition) || !isCount(rank, 1) || typeof tied !== 'boolean') {
      return null;
    }
    parsed.consensus.push({
      itemId: entry.itemId,
      averagePosition: averagePosition as number,
      rank,
      tied,
    });
  }

  for (const entry of discrepancies) {
    if (!isRecord(entry) || typeof entry.itemId !== 'string') return null;
    const { dispersion } = entry;
    if (!Number.isFinite(dispersion) || (dispersion as number) < 0) return null;
    parsed.discrepancies.push({ itemId: entry.itemId, dispersion: dispersion as number });
  }

  const ids = new Set<string>();
  for (const entry of lists) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || ids.has(entry.id)) return null;
    const slots = toSlots(entry.slots);
    if (typeof entry.nickname !== 'string' || typeof entry.left !== 'boolean' || !slots) {
      return null;
    }
    ids.add(entry.id);
    parsed.lists.push({ id: entry.id, nickname: entry.nickname, left: entry.left, slots });
  }

  for (const entry of affinity) {
    if (!isRecord(entry) || !isPair(entry, ids)) return null;
    parsed.affinity.push({ a: entry.a, b: entry.b, coefficient: entry.coefficient });
  }

  return parsed;
}

function isPair(entry: Fields, ids: Set<string>): entry is Fields & Affinity {
  const { a, b, coefficient } = entry;
  if (typeof a !== 'string' || typeof b !== 'string' || a === b) return false;
  if (!ids.has(a) || !ids.has(b)) return false;
  return coefficient === null || (typeof coefficient === 'number' && Math.abs(coefficient) <= 1);
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
    case 'finish': {
      const slots = toSlots(data.slots);
      return slots && { type: 'finish', slots };
    }
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
    case 'closed':
    case 'lobby':
      return { type: data.type };
    case 'code': {
      // Checked for exactly what the server hands out, not read leniently:
      // this one goes into the address and the next lookup as it is.
      const code = typeof data.code === 'string' ? readRoomCode(data.code) : null;
      return code !== null && code === data.code ? { type: 'code', code } : null;
    }
    case 'result': {
      const result = toResult(data.result);
      return result && { type: 'result', result };
    }
    default:
      return null;
  }
}
