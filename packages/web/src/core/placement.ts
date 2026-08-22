import type { Item, PlacementState, RankedSlot } from './types.ts';

// The random source is a parameter so tests can script a shuffle instead of
// fighting Math.random.
export function createShuffledOrder(items: Item[], random: () => number = Math.random): string[] {
  const ids = items.map((item) => item.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

// The first item of the shuffle starts out placed, so the list is never empty
// and the pool always has somewhere to drop. That opener has to come from
// somewhere, hence the guard: the item count itself is the form's business.
export function startPlacement(items: Item[], random: () => number = Math.random): PlacementState {
  if (items.length === 0) {
    throw new Error('A placement needs at least one item to open the list with');
  }

  const shuffledOrder = createShuffledOrder(items, random);
  const [opener, ...rest] = shuffledOrder;

  return {
    shuffledOrder,
    rankedSlots: [{ itemIds: [opener] }],
    pendingPool: rest,
  };
}

export function insertAt(slots: RankedSlot[], itemId: string, index: number): RankedSlot[] {
  if (index < 0 || index > slots.length) {
    throw new RangeError(`Position ${index} is outside a list of ${slots.length} slots`);
  }

  const next = slots.slice();
  next.splice(index, 0, { itemIds: [itemId] });
  return next;
}

// Only the head of the pool is placeable: the shuffle fixes the order items
// come out in, and the next one is not visible until this one lands.
export function placeFromPool(state: PlacementState, index: number): PlacementState {
  if (state.pendingPool.length === 0) {
    throw new Error('The pool is empty, every item is already placed');
  }

  const [current, ...rest] = state.pendingPool;

  return {
    ...state,
    rankedSlots: insertAt(state.rankedSlots, current, index),
    pendingPool: rest,
  };
}
