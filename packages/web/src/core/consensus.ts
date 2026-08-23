import type { RankedSlot } from './types.ts';

export interface ConsensusEntry {
  itemId: string;
  averagePosition: number;
  rank: number;
}

export interface DiscrepancyEntry {
  itemId: string;
  dispersion: number;
}

// Two items tied for second both sit at 2.5, not at 2. The screen shows the
// competition numbering instead (rankItems), but averaging and correlating
// need the midpoint: without it a pair of identical lists that happen to
// contain a tie stops scoring a perfect 1.
export function averagePositions(slots: RankedSlot[]): Map<string, number> {
  const positions = new Map<string, number>();
  let position = 1;

  for (const slot of slots) {
    const shared = position + (slot.itemIds.length - 1) / 2;
    for (const itemId of slot.itemIds) {
      // At reveal these lists come off other people's devices, where the
      // placement guards no longer apply. A repeat would overwrite the first
      // position and skew the average without anyone noticing.
      if (positions.has(itemId)) {
        throw new Error(`Item ${itemId} is placed more than once in the same list`);
      }
      positions.set(itemId, shared);
    }
    position += slot.itemIds.length;
  }

  return positions;
}

// Everyone in a room sorts the same items, so a list that disagrees about
// which items exist is a bug upstream and not something to average around.
function positionsPerList(lists: RankedSlot[][]): Map<string, number>[] {
  if (lists.length === 0) {
    throw new Error('A comparison needs at least one participant');
  }

  const perList = lists.map(averagePositions);
  const [first, ...rest] = perList;

  for (const other of rest) {
    const sameItems = other.size === first.size && [...first.keys()].every((id) => other.has(id));
    if (!sameItems) {
      throw new Error('Every participant has to have ranked the same items');
    }
  }

  return perList;
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function consensusRanking(lists: RankedSlot[][]): ConsensusEntry[] {
  const perList = positionsPerList(lists);

  const averaged = [...perList[0].keys()]
    .map((itemId) => ({
      itemId,
      averagePosition: mean(perList.map((positions) => positions.get(itemId)!)),
    }))
    // Stable, so items the group averaged out level keep the order the first
    // participant put them in rather than an arbitrary one.
    .sort((a, b) => a.averagePosition - b.averagePosition);

  // Competition numbering again, this time over the averages. Comparing those
  // exactly holds up because every position is a whole number or a half, so
  // equal sums stay equal to the bit.
  let rank = 1;
  return averaged.map((entry, index) => {
    if (index > 0 && entry.averagePosition !== averaged[index - 1].averagePosition) {
      rank = index + 1;
    }
    return { ...entry, rank };
  });
}

// Pearson over the averaged positions, which is what Spearman reduces to. The
// 6*sum(d^2) shortcut is not used on purpose: it only holds when nobody tied
// anything, and here ties are a feature.
export function spearman(a: RankedSlot[], b: RankedSlot[]): number | null {
  const [first, second] = positionsPerList([a, b]);

  const itemIds = [...first.keys()];
  const meanA = mean(itemIds.map((id) => first.get(id)!));
  const meanB = mean(itemIds.map((id) => second.get(id)!));

  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;

  for (const itemId of itemIds) {
    const deviationA = first.get(itemId)! - meanA;
    const deviationB = second.get(itemId)! - meanB;
    covariance += deviationA * deviationB;
    varianceA += deviationA ** 2;
    varianceB += deviationB ** 2;
  }

  // A list with no spread has nothing to correlate against and no coefficient
  // to give. The pairwise ties cannot produce that on their own, so this only
  // shows up in a list that arrived malformed.
  const spread = Math.sqrt(varianceA * varianceB);
  if (spread === 0) {
    return null;
  }

  // Rounding can push an exact agreement a hair past 1, which reads as a bug.
  return Math.max(-1, Math.min(1, covariance / spread));
}

// How far apart the participants put an item, as the population standard
// deviation of its positions. The divisive ones come first, since that is the
// half of the list anyone actually reads.
export function itemDiscrepancies(lists: RankedSlot[][]): DiscrepancyEntry[] {
  const perList = positionsPerList(lists);

  return [...perList[0].keys()]
    .map((itemId) => {
      const positions = perList.map((list) => list.get(itemId)!);
      const average = mean(positions);
      return {
        itemId,
        dispersion: Math.sqrt(mean(positions.map((position) => (position - average) ** 2))),
      };
    })
    .sort((a, b) => b.dispersion - a.dispersion);
}
