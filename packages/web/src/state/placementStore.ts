import { create } from 'zustand';
import { resolveDrop } from '../core/dropTargets.ts';
import type { DragSource, DropTarget } from '../core/dropTargets.ts';
import { startPlacement } from '../core/placement.ts';
import type { Item, PlacementState } from '../core/types.ts';

interface Placement {
  items: Item[];
  criterion: string;
  placement: PlacementState | null;
  start: (items: Item[], criterion: string) => void;
  drop: (dragged: DragSource, target: DropTarget) => void;
}

export const usePlacement = create<Placement>((set) => ({
  items: [],
  criterion: '',
  placement: null,

  // The items are copied in rather than read back out of the draft. This state
  // belongs to one participant: in a room it arrives from the host, and there
  // is no local form behind it to read.
  start: (items, criterion) =>
    set({ items: [...items], criterion, placement: startPlacement(items) }),

  drop: (dragged, target) =>
    set((state) => {
      if (!state.placement) {
        return {};
      }
      // A refused drop is not an error here: the item just goes back where it
      // came from, which is what leaving the state alone already does.
      const next = resolveDrop(state.placement, dragged, target);
      return next ? { placement: next } : {};
    }),
}));
