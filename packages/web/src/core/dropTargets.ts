import { liftItem, moveIntoTie, moveItem, placeFromPool, tieFromPool } from './placement.ts';
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

// What the list looks like with a placed item picked up, whether it is being
// dragged or held for a tap. Only half a tie comes out of it: its partner keeps
// the position, so the list stays the same length and every gap index the
// resolver counts still lines up with what is on screen. An untied item would
// take its position with it and shift everything below it under the cursor, so
// it stays put and dims instead.
export function listWhileLifted(slots: RankedSlot[], lifted: DragSource | null): RankedSlot[] {
  if (lifted?.from !== 'placed') {
    return slots;
  }
  const from = slotOf(slots, lifted.itemId);
  return from !== -1 && slots[from].itemIds.length === 2 ? liftItem(slots, lifted.itemId) : slots;
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
    // Counted without the item being dragged, which is what lets half a pair
    // be dropped back on the position its partner is now holding alone. Two
    // others in there is the third-item case; none at all is an untied item on
    // its own position, a drag that went nowhere rather than a tie with itself.
    const others = slots[target.index]?.itemIds.filter((id) => id !== dragged.itemId) ?? [];
    return others.length === 1 ? 'tie' : 'rejected';
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
  const from = slotOf(slots, dragged.itemId);

  // Re-tying with the partner it was already tied to. moveIntoTie would lift
  // and re-tie, handing back the pair with the two cards swapped, so a drop
  // that changes nothing would still shuffle the rows.
  if (outcome === 'tie' && target.index === from) {
    return state;
  }

  const index = shiftForLift(slots, from, target.index);

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
