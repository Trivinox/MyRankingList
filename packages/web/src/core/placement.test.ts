import { describe, expect, it } from 'vitest';
import {
  createShuffledOrder,
  insertAt,
  liftItem,
  moveIntoTie,
  moveItem,
  placeFromPool,
  startPlacement,
  tieAt,
  tieFromPool,
} from './placement.ts';
import type { Item, RankedSlot } from './types.ts';

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id, text: id.toUpperCase() }));

const ids = (slots: RankedSlot[]) => slots.map((slot) => slot.itemIds[0]);

// Reads a list as one string per position, tied pairs joined: ['a', 'b+c'].
const layout = (slots: RankedSlot[]) => slots.map((slot) => slot.itemIds.join('+'));

const list = (...positions: string[]): RankedSlot[] =>
  positions.map((position) => ({ itemIds: position.split('+') }) as RankedSlot);

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

  it('survives a random source that reaches 1', () => {
    const order = createShuffledOrder(items('a', 'b', 'c'), scripted([1, 1]));
    expect([...order].sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not favour any position over many runs', () => {
    const runs = 3000;
    const landings = [0, 0, 0, 0];

    for (let i = 0; i < runs; i++) {
      landings[createShuffledOrder(items('a', 'b', 'c', 'd')).indexOf('a')]++;
    }

    // A uniform shuffle puts 'a' in each slot a quarter of the time. The margin
    // is wide enough not to flake, while still catching the two ways this loop
    // usually goes wrong: drawing j from the whole array (which piles the item
    // up at the front) or stopping the loop one step early (which leaves the
    // first position empty).
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

  it('rejects an item that is already down somewhere else', () => {
    expect(() => insertAt(slots, 'a', 0)).toThrow();
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

  it('refuses an empty item list instead of opening with an undefined slot', () => {
    expect(() => startPlacement([])).toThrow();
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

    expect(() => placeFromPool(state, 0)).toThrow();
  });
});

describe('tieAt', () => {
  it('puts the item alongside the one already in the position', () => {
    expect(layout(tieAt(list('a', 'b'), 'x', 1))).toEqual(['a', 'b+x']);
  });

  it('refuses a position that is already a pair', () => {
    expect(() => tieAt(list('a', 'b+c'), 'x', 1)).toThrow();
  });

  it('refuses a position that does not exist', () => {
    expect(() => tieAt(list('a'), 'x', 1)).toThrow(RangeError);
  });

  it('refuses an item that is already down, including its own position', () => {
    expect(() => tieAt(list('a', 'b'), 'b', 0)).toThrow();
    expect(() => tieAt(list('a', 'b'), 'a', 0)).toThrow();
  });
});

describe('liftItem', () => {
  it('takes the position away with the item when it was alone', () => {
    expect(layout(liftItem(list('a', 'b', 'c'), 'b'))).toEqual(['a', 'c']);
  });

  it('leaves the partner holding the position on its own', () => {
    expect(layout(liftItem(list('a', 'b+c', 'd'), 'c'))).toEqual(['a', 'b', 'd']);
  });

  it('complains about an item that is not in the list', () => {
    expect(() => liftItem(list('a'), 'z')).toThrow();
  });
});

describe('moveItem', () => {
  it('accepts moving the only item to where it already is', () => {
    expect(layout(moveItem(list('a'), 'a', 0))).toEqual(['a']);
  });

  it('moves an item down the list', () => {
    expect(layout(moveItem(list('a', 'b', 'c'), 'a', 2))).toEqual(['b', 'c', 'a']);
  });

  it('moves an item up the list', () => {
    expect(layout(moveItem(list('a', 'b', 'c'), 'c', 0))).toEqual(['c', 'a', 'b']);
  });

  it('breaks a tie when one of the pair is moved elsewhere', () => {
    expect(layout(moveItem(list('a', 'b+c', 'd'), 'b', 3))).toEqual(['a', 'c', 'd', 'b']);
  });

  it('reads the target position from the list without the lifted item', () => {
    // 'a' is gone by the time the drop lands, so position 1 is between 'b' and 'c'.
    expect(layout(moveItem(list('a', 'b', 'c'), 'a', 1))).toEqual(['b', 'a', 'c']);
  });
});

describe('moveIntoTie', () => {
  it('ties a placed item with another one', () => {
    expect(layout(moveIntoTie(list('a', 'b', 'c'), 'c', 0))).toEqual(['a+c', 'b']);
  });

  it('moves one half of a pair onto a different item', () => {
    expect(layout(moveIntoTie(list('a+b', 'c'), 'b', 1))).toEqual(['a', 'c+b']);
  });

  it('will not stack a third item onto a pair', () => {
    expect(() => moveIntoTie(list('a+b', 'c'), 'c', 0)).toThrow();
  });
});

describe('tieFromPool', () => {
  it('ties the current pool item and moves the pool on', () => {
    const state = tieFromPool(
      { shuffledOrder: ['a', 'b', 'c'], rankedSlots: list('a'), pendingPool: ['b', 'c'] },
      0,
    );

    expect(layout(state.rankedSlots)).toEqual(['a+b']);
    expect(state.pendingPool).toEqual(['c']);
  });

  it('keeps the item in the pool when the position rejects it', () => {
    const state = { shuffledOrder: ['a', 'b', 'c'], rankedSlots: list('a+b'), pendingPool: ['c'] };
    expect(() => tieFromPool(state, 0)).toThrow();
    expect(state.pendingPool).toEqual(['c']);
  });
});

// A drag lifts the item on pick-up and only places it on drop, so the list the
// user is aiming at is the one without the dragged item in it. Positions are
// counted in that shortened list, and these cases are here to keep the two ends
// of that contract from drifting apart.
describe('a drag, step by step', () => {
  it('counts the drop position without the item being dragged', () => {
    const lifted = liftItem(list('a', 'b', 'c'), 'a');
    expect(layout(lifted)).toEqual(['b', 'c']);

    // Last place is 2 here, not 3: 'a' no longer occupies a position.
    expect(layout(insertAt(lifted, 'a', 2))).toEqual(['b', 'c', 'a']);
    expect(() => insertAt(lifted, 'a', 3)).toThrow(RangeError);
    expect(() => moveItem(list('a', 'b', 'c'), 'a', 3)).toThrow(RangeError);
  });

  it('puts the item back untouched when the drop lands where it started', () => {
    const slots = list('a', 'b', 'c');
    expect(layout(insertAt(liftItem(slots, 'b'), 'b', 1))).toEqual(layout(slots));
  });

  it('leaves the original list intact so a cancelled drag has something to fall back on', () => {
    const slots = list('a', 'b+c');
    liftItem(slots, 'c');
    expect(layout(slots)).toEqual(['a', 'b+c']);
  });

  it('runs the pick-up and drop of a tied item as two separate steps', () => {
    const lifted = liftItem(list('a+b', 'c', 'd'), 'b');
    expect(layout(lifted)).toEqual(['a', 'c', 'd']);

    expect(layout(tieAt(lifted, 'b', 2))).toEqual(['a', 'c', 'd+b']);
    expect(layout(insertAt(lifted, 'b', 1))).toEqual(['a', 'b', 'c', 'd']);
  });
});
