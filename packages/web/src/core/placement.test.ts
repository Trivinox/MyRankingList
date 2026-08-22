import { describe, expect, it } from 'vitest';
import { createShuffledOrder, insertAt, placeFromPool, startPlacement } from './placement.ts';
import type { Item, RankedSlot } from './types.ts';

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id, text: id.toUpperCase() }));

const ids = (slots: RankedSlot[]) => slots.map((slot) => slot.itemIds[0]);

// Feeds Fisher-Yates a fixed script: one value per iteration, highest index first.
function scripted(values: number[]) {
  let call = 0;
  return () => values[call++];
}

describe('createShuffledOrder', () => {
  it('keeps every item exactly once', () => {
    const order = createShuffledOrder(items('a', 'b', 'c', 'd', 'e'));
    expect([...order].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('follows the random source', () => {
    expect(createShuffledOrder(items('a', 'b', 'c'), scripted([0, 0]))).toEqual(['b', 'c', 'a']);
  });

  it('does not favour any position over many runs', () => {
    const runs = 3000;
    const landings = [0, 0, 0, 0];

    for (let i = 0; i < runs; i++) {
      landings[createShuffledOrder(items('a', 'b', 'c', 'd')).indexOf('a')]++;
    }

    // A uniform shuffle puts 'a' in each slot a quarter of the time. The margin
    // is wide enough that a fair shuffle will not trip it, and a biased one
    // (last-position bias is the classic off-by-one) will.
    for (const count of landings) {
      expect(count / runs).toBeGreaterThan(0.15);
      expect(count / runs).toBeLessThan(0.35);
    }
  });
});

describe('insertAt', () => {
  const slots: RankedSlot[] = [{ itemIds: ['a'] }, { itemIds: ['b'] }];

  it('inserts at the top', () => {
    expect(ids(insertAt(slots, 'x', 0))).toEqual(['x', 'a', 'b']);
  });

  it('inserts in a gap', () => {
    expect(ids(insertAt(slots, 'x', 1))).toEqual(['a', 'x', 'b']);
  });

  it('inserts at the bottom', () => {
    expect(ids(insertAt(slots, 'x', 2))).toEqual(['a', 'b', 'x']);
  });

  it('leaves the original list untouched', () => {
    insertAt(slots, 'x', 1);
    expect(slots).toHaveLength(2);
  });

  it('rejects a position past the end of the list', () => {
    expect(() => insertAt(slots, 'x', 3)).toThrow(RangeError);
    expect(() => insertAt(slots, 'x', -1)).toThrow(RangeError);
  });
});

describe('startPlacement', () => {
  it('places the first shuffled item and pools the rest', () => {
    const state = startPlacement(items('a', 'b', 'c'), scripted([0, 0]));

    expect(state.shuffledOrder).toEqual(['b', 'c', 'a']);
    expect(ids(state.rankedSlots)).toEqual(['b']);
    expect(state.pendingPool).toEqual(['c', 'a']);
  });
});

describe('placing a three item list', () => {
  it('runs from the shuffle down to a full ranking', () => {
    let state = startPlacement(items('a', 'b', 'c'), scripted([0, 0]));

    state = placeFromPool(state, 0);
    expect(ids(state.rankedSlots)).toEqual(['c', 'b']);
    expect(state.pendingPool).toEqual(['a']);

    state = placeFromPool(state, 1);
    expect(ids(state.rankedSlots)).toEqual(['c', 'a', 'b']);
    expect(state.pendingPool).toEqual([]);
  });
});
