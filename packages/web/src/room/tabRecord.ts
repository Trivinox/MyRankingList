import type { Item, PlacementState } from '../core/types.ts';

// What a guest's tab keeps while sorting in a room, so a reload can take them
// back in with the same place and the same list. A new tab or another device
// starts with nothing. A duplicated tab gets a copy, and the host tells the
// older of the two it has been replaced.
//
// The nickname is kept for the join message, which always carries one. The
// host only reads it when the seat means nothing to it any more.
export interface TabRecord {
  code: string;
  seat: string;
  you: string;
  nickname: string;
  items: Item[];
  criterion: string;
  placement: PlacementState;
}

const KEY = 'myrankinglist-room';

// A browser that blocks site data throws on the first touch of sessionStorage,
// and a full one throws on writing. Either way the room goes on, and a reload
// just cannot resume.
export function readTabRecord(): TabRecord | null {
  let saved: string | null;
  try {
    saved = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (saved === null) return null;

  // Only this app writes here. Still, a tab left open across a deploy holds a
  // record from the build before, which may not have every field this one reads.
  try {
    const record = JSON.parse(saved) as Partial<TabRecord> | null;
    const complete =
      typeof record?.code === 'string' &&
      typeof record.seat === 'string' &&
      typeof record.you === 'string' &&
      typeof record.nickname === 'string' &&
      typeof record.criterion === 'string' &&
      Array.isArray(record.items) &&
      Array.isArray(record.placement?.pendingPool);
    return complete ? (record as TabRecord) : null;
  } catch {
    return null;
  }
}

export function writeTabRecord(record: TabRecord) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // See readTabRecord.
  }
}

export function clearTabRecord() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // See readTabRecord.
  }
}

// Only the room the address points at. A record for another one is from a
// room this tab has since moved on from.
export function recordFor(code: string | null) {
  const record = readTabRecord();
  return record !== null && record.code === code ? record : null;
}
