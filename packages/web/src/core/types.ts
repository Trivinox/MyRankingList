// Shared domain types for the sorting core logic.

export interface Item {
  id: string;
  text: string;
  imageUrl?: string;
}

// Holds one item, or two when they are tied with each other. A tie never
// involves a third item.
export interface RankedSlot {
  itemIds: [string] | [string, string];
}

export interface PlacementState {
  shuffledOrder: string[];
  rankedSlots: RankedSlot[];
  pendingPool: string[];
}
