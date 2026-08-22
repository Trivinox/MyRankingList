import type { RankedSlot } from './types.ts';

export interface RankedEntry {
  rank: number;
  itemId: string;
  tied: boolean;
}

// Competition numbering: two items sharing position 2 leave no 3 behind them,
// the next one is 4. Ranks are derived here rather than stored, so a move or a
// tie only ever has to touch the slots themselves.
export function rankItems(slots: RankedSlot[]): RankedEntry[] {
  const entries: RankedEntry[] = [];
  let rank = 1;

  for (const slot of slots) {
    const tied = slot.itemIds.length === 2;
    for (const itemId of slot.itemIds) {
      entries.push({ rank, itemId, tied });
    }
    rank += slot.itemIds.length;
  }

  return entries;
}
