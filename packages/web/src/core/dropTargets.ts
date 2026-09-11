import { moveIntoTie, moveItem, placeFromPool, tieFromPool } from './placement.ts';
import type { PlacementState, RankedSlot } from './types.ts';

export type DragSource = { from: 'pool' } | { from: 'placed'; itemId: string };

// The pool only ever offers its head, so it needs no item id of its own.
export function dragSourceId(source: DragSource): string {
  return source.from === 'pool' ? 'pool' : `placed:${source.itemId}`;
}

export function parseDragSource(id: string): DragSource | null {
  if (id === 'pool') {
    return { from: 'pool' };
  }
  const match = /^placed:(.+)$/.exec(id);
  return match ? { from: 'placed', itemId: match[1] } : null;
}

// A gap is the insertion point above the slot of the same index, so gap 0 sits
// above everything and a gap at the list's length below everything. A slot is
// the position itself, which means tying with whatever is already there.
export type DropTarget = { kind: 'gap'; index: number } | { kind: 'slot'; index: number };

export type DropOutcome = 'insert' | 'tie' | 'rejected';

export function dropTargetId(target: DropTarget): string {
  return `${target.kind}:${target.index}`;
}

// The id makes the round trip through a DOM attribute, so anything that does
// not come back as one answers null instead of throwing mid-drop.
export function parseDropTarget(id: string): DropTarget | null {
  const match = /^(gap|slot):(\d+)$/.exec(id);
  if (!match) {
    return null;
  }
  return { kind: match[1] as DropTarget['kind'], index: Number(match[2]) };
}

function slotOf(slots: RankedSlot[], itemId: string): number {
  return slots.findIndex((slot) => slot.itemIds.includes(itemId));
}

// Positions on screen are counted in the list the user is looking at, but the
// drop lands in the list without the item being dragged. An untied item takes
// its position with it, so everything below it moves up one; a tied one leaves
// its partner holding the position and nothing shifts.
function shiftForLift(slots: RankedSlot[], from: number, index: number): number {
  const wasAlone = slots[from].itemIds.length === 1;
  return wasAlone && index > from ? index - 1 : index;
}

export function describeDrop(
  state: PlacementState,
  dragged: DragSource,
  target: DropTarget,
): DropOutcome {
  const slots = state.rankedSlots;

  if (dragged.from === 'pool') {
    if (state.pendingPool.length === 0) {
      return 'rejected';
    }
    if (target.kind === 'gap') {
      return target.index >= 0 && target.index <= slots.length ? 'insert' : 'rejected';
    }
    return slots[target.index]?.itemIds.length === 1 ? 'tie' : 'rejected';
  }

  const from = slotOf(slots, dragged.itemId);
  if (from === -1) {
    return 'rejected';
  }

  if (target.kind === 'slot') {
    // Dropping an item onto the position it already occupies is not a tie with
    // itself, it is a drag that went nowhere.
    if (target.index === from || slots[target.index]?.itemIds.length !== 1) {
      return 'rejected';
    }
    return 'tie';
  }

  return target.index >= 0 && target.index <= slots.length ? 'insert' : 'rejected';
}

export function resolveDrop(
  state: PlacementState,
  dragged: DragSource,
  target: DropTarget,
): PlacementState | null {
  const outcome = describeDrop(state, dragged, target);
  if (outcome === 'rejected') {
    return null;
  }

  if (dragged.from === 'pool') {
    return outcome === 'tie'
      ? tieFromPool(state, target.index)
      : placeFromPool(state, target.index);
  }

  const slots = state.rankedSlots;
  const index = shiftForLift(slots, slotOf(slots, dragged.itemId), target.index);

  return {
    ...state,
    rankedSlots:
      outcome === 'tie'
        ? moveIntoTie(slots, dragged.itemId, index)
        : moveItem(slots, dragged.itemId, index),
  };
}

// The slot the dragged item ends up in, or null for a refused drop. Read off
// the resolved list rather than the target: an item moved down lands one above
// the gap it was dropped in.
export function landingSlot(
  state: PlacementState,
  dragged: DragSource,
  target: DropTarget,
): number | null {
  const next = resolveDrop(state, dragged, target);
  if (!next) {
    return null;
  }
  const itemId = dragged.from === 'pool' ? state.pendingPool[0] : dragged.itemId;
  return slotOf(next.rankedSlots, itemId);
}
