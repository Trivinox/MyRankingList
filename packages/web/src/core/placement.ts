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

function indexOfItem(slots: RankedSlot[], itemId: string): number {
  return slots.findIndex((slot) => slot.itemIds.includes(itemId));
}

// An item that is already down cannot be placed again: it has to be lifted
// first, the way moveItem does it. Without this an id arriving twice would
// quietly end up in the list twice.
function refusePlaced(slots: RankedSlot[], itemId: string): void {
  if (indexOfItem(slots, itemId) !== -1) {
    throw new Error(`Item ${itemId} is already placed, lift it before placing it again`);
  }
}

export function insertAt(slots: RankedSlot[], itemId: string, index: number): RankedSlot[] {
  if (index < 0 || index > slots.length) {
    throw new RangeError(`Position ${index} is outside a list of ${slots.length} slots`);
  }
  refusePlaced(slots, itemId);

  const next = slots.slice();
  next.splice(index, 0, { itemIds: [itemId] });
  return next;
}

// Dropping on top of an item ties the two together. Three is not a tie, it is
// a group, and the mechanic does not have those.
export function tieAt(slots: RankedSlot[], itemId: string, index: number): RankedSlot[] {
  const target = slots[index];
  if (!target) {
    throw new RangeError(`Position ${index} is outside a list of ${slots.length} slots`);
  }
  if (target.itemIds.length === 2) {
    throw new Error(`Position ${index} is already tied and cannot take a third item`);
  }
  refusePlaced(slots, itemId);

  const next = slots.slice();
  next[index] = { itemIds: [target.itemIds[0], itemId] };
  return next;
}

// Picking up a placed item takes it out of the list right away, before anyone
// knows where it will land: a tied partner is left holding the position alone
// and everything below moves up. Positions passed to the follow-up placement
// are indexes into this shortened list.
export function liftItem(slots: RankedSlot[], itemId: string): RankedSlot[] {
  const index = indexOfItem(slots, itemId);
  if (index === -1) {
    throw new Error(`Item ${itemId} is not placed in the list`);
  }

  const partner = slots[index].itemIds.find((id) => id !== itemId);
  const next = slots.slice();
  if (partner === undefined) {
    next.splice(index, 1);
  } else {
    next[index] = { itemIds: [partner] };
  }
  return next;
}

export function moveItem(slots: RankedSlot[], itemId: string, index: number): RankedSlot[] {
  const lifted = liftItem(slots, itemId);
  return insertAt(lifted, itemId, index);
}

export function moveIntoTie(slots: RankedSlot[], itemId: string, index: number): RankedSlot[] {
  const lifted = liftItem(slots, itemId);
  return tieAt(lifted, itemId, index);
}

// Only the head of the pool is placeable: the shuffle fixes the order items
// come out in, and the next one is not visible until this one lands.
function placeCurrent(
  state: PlacementState,
  place: (slots: RankedSlot[], itemId: string) => RankedSlot[],
): PlacementState {
  if (state.pendingPool.length === 0) {
    throw new Error('The pool is empty, every item is already placed');
  }

  const [current, ...rest] = state.pendingPool;

  return {
    ...state,
    rankedSlots: place(state.rankedSlots, current),
    pendingPool: rest,
  };
}

export function placeFromPool(state: PlacementState, index: number): PlacementState {
  return placeCurrent(state, (slots, itemId) => insertAt(slots, itemId, index));
}

export function tieFromPool(state: PlacementState, index: number): PlacementState {
  return placeCurrent(state, (slots, itemId) => tieAt(slots, itemId, index));
}
