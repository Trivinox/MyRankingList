import { consensusRanking, itemDiscrepancies, spearman } from '../core/consensus.ts';
import type { ConsensusEntry, DiscrepancyEntry } from '../core/consensus.ts';
import type { Item, RankedSlot } from '../core/types.ts';
import { coversItems, holdsEachItem } from './hostRoom.ts';
import type { Participant } from './hostRoom.ts';

// Up to this many lists the reveal shows every pair in a grid. Past it the
// grid stops fitting anywhere, and each person gets who they are most and
// least like instead.
export const AFFINITY_MATRIX_LIMIT = 8;

// `left` is someone whose list is in but who was no longer connected when the
// room was revealed. Their list counts like any other.
export interface RoomList {
  id: string;
  nickname: string;
  left: boolean;
  slots: RankedSlot[];
}

// One entry per pair of lists, whichever way round. Null is a pair with no
// coefficient to give, which spearman explains.
export interface Affinity {
  a: string;
  b: string;
  coefficient: number | null;
}

// Worked out once, on the host, and sent whole. The grid and the summary are
// two views of the same pairs, so the screen picks one and nothing else has
// to travel.
export interface RoomResult {
  consensus: ConsensusEntry[];
  discrepancies: DiscrepancyEntry[];
  lists: RoomList[];
  affinity: Affinity[];
}

// Only the lists the host still holds, in the room's order. A removal already
// took its list with it, and nobody unfinished is left by the time this runs.
export function buildResult(
  participants: Participant[],
  lists: Map<string, RankedSlot[]>,
): RoomResult {
  const counted = participants.flatMap((p) => {
    const slots = lists.get(p.id);
    return slots ? [{ id: p.id, nickname: p.nickname, left: !p.connected, slots }] : [];
  });
  const slots = counted.map((list) => list.slots);

  const affinity: Affinity[] = [];
  counted.forEach((a, index) => {
    for (const b of counted.slice(index + 1)) {
      affinity.push({ a: a.id, b: b.id, coefficient: spearman(a.slots, b.slots) });
    }
  });

  return {
    consensus: consensusRanking(slots),
    discrepancies: itemDiscrepancies(slots),
    lists: counted,
    affinity,
  };
}

// The parser only vouched for the shape. What it cannot know is whether the
// result is about the items this tab sorted, and a list about anything else
// would show up as blank rows.
export function fitsItems(result: RoomResult, items: Item[]) {
  return (
    holdsEachItem(
      result.consensus.map((entry) => entry.itemId),
      items,
    ) &&
    holdsEachItem(
      result.discrepancies.map((entry) => entry.itemId),
      items,
    ) &&
    result.lists.every((list) => coversItems(list.slots, items))
  );
}

export function affinityOf(result: RoomResult, one: string, other: string) {
  return result.affinity.find(
    ({ a, b }) => (a === one && b === other) || (a === other && b === one),
  )?.coefficient;
}
