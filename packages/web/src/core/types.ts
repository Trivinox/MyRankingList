// Shared domain types for the sorting core logic (spec section 6.3).
// Room, Participant and Result types join here once the phases that need them
// (9 onward) land; splitting this file by sub-domain is a refactor for later
// if it ever gets unwieldy.

export interface Item {
  id: string;
  text: string;
  imageUrl?: string;
}

// A slot in the ordered list holds one item, or two when they are tied with
// each other (spec 2.3: a tie can never involve a third item).
export interface RankedSlot {
  itemIds: [string] | [string, string];
}

export interface PlacementState {
  shuffledOrder: string[];
  rankedSlots: RankedSlot[];
  pendingPool: string[];
}
