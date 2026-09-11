import { describe, expect, it } from 'vitest';
import {
  describeDrop,
  dragSourceId,
  dropTargetId,
  landingSlot,
  parseDragSource,
  parseDropTarget,
  resolveDrop,
} from './dropTargets.ts';
import type { DragSource, DropTarget } from './dropTargets.ts';
import type { PlacementState, RankedSlot } from './types.ts';

const list = (...positions: string[]): RankedSlot[] =>
  positions.map((position) => ({ itemIds: position.split('+') }) as RankedSlot);

const layout = (slots: RankedSlot[]) => slots.map((slot) => slot.itemIds.join('+'));

const state = (slots: RankedSlot[], pool: string[] = []): PlacementState => ({
  shuffledOrder: [...slots.flatMap((slot) => slot.itemIds), ...pool],
  rankedSlots: slots,
  pendingPool: pool,
});

const pool: DragSource = { from: 'pool' };
const placed = (itemId: string): DragSource => ({ from: 'placed', itemId });

const gap = (index: number): DropTarget => ({ kind: 'gap', index });
const slot = (index: number): DropTarget => ({ kind: 'slot', index });

// resolveDrop answers with a whole state; almost every case only cares about
// the list that came out of it.
const after = (current: PlacementState, dragged: DragSource, target: DropTarget) => {
  const next = resolveDrop(current, dragged, target);
  return next && layout(next.rankedSlots);
};

describe('drop target ids', () => {
  it('round-trips both kinds', () => {
    expect(dropTargetId(gap(0))).toBe('gap:0');
    expect(dropTargetId(slot(4))).toBe('slot:4');
    expect(parseDropTarget('gap:0')).toEqual(gap(0));
    expect(parseDropTarget('slot:12')).toEqual(slot(12));
  });

  it('answers null for anything that is not a target id', () => {
    for (const id of ['', 'gap', 'gap:', 'gap:-1', 'gap:one', 'gap:1:2', 'row:1', 'pool']) {
      expect(parseDropTarget(id)).toBeNull();
    }
  });
});

describe('drag source ids', () => {
  it('round-trips the pool and a placed item', () => {
    expect(dragSourceId(pool)).toBe('pool');
    expect(dragSourceId(placed('b'))).toBe('placed:b');
    expect(parseDragSource('pool')).toEqual(pool);
    expect(parseDragSource('placed:b')).toEqual(placed('b'));
  });

  // Item ids come out of crypto.randomUUID, dashes and all, and nothing stops
  // one from carrying the separator.
  it('keeps everything after the prefix as the item id', () => {
    const id = '3f1c2e8a-9b7d-4c6e-a1f0-5d2b8c7e9a41';
    expect(parseDragSource(`placed:${id}`)).toEqual(placed(id));
    expect(parseDragSource('placed:a:b')).toEqual(placed('a:b'));
  });

  it('answers null for anything that is not a source id', () => {
    for (const id of ['', 'placed', 'placed:', 'pool:a', 'gap:0', 'Pool']) {
      expect(parseDragSource(id)).toBeNull();
    }
  });
});

describe('dropping the pool item', () => {
  const current = state(list('a', 'b'), ['c', 'd']);

  it('inserts at the top, in a gap and at the bottom', () => {
    expect(after(current, pool, gap(0))).toEqual(['c', 'a', 'b']);
    expect(after(current, pool, gap(1))).toEqual(['a', 'c', 'b']);
    expect(after(current, pool, gap(2))).toEqual(['a', 'b', 'c']);
  });

  it('moves the pool on with each placement', () => {
    expect(resolveDrop(current, pool, gap(1))?.pendingPool).toEqual(['d']);
  });

  it('ties with an item that is on its own', () => {
    expect(after(current, pool, slot(1))).toEqual(['a', 'b+c']);
  });

  it('refuses a position that already holds two', () => {
    const tied = state(list('a', 'b+c'), ['d']);
    expect(describeDrop(tied, pool, slot(1))).toBe('rejected');
    expect(resolveDrop(tied, pool, slot(1))).toBeNull();
  });

  it('refuses a gap or a position past the end of the list', () => {
    expect(describeDrop(current, pool, gap(3))).toBe('rejected');
    expect(describeDrop(current, pool, slot(2))).toBe('rejected');
  });

  it('refuses the drop once the pool is empty', () => {
    expect(describeDrop(state(list('a', 'b')), pool, gap(0))).toBe('rejected');
  });
});

// The screen counts gaps in the list the user can see, but the drop lands in
// the list without the item being dragged. These are the cases that tell the
// two apart.
describe('moving an item that is already down', () => {
  const three = state(list('a', 'b', 'c'));

  it('moves it up the list, where the gaps are unshifted', () => {
    expect(after(three, placed('c'), gap(0))).toEqual(['c', 'a', 'b']);
    expect(after(three, placed('c'), gap(1))).toEqual(['a', 'c', 'b']);
  });

  it('moves it down the list, where every gap sits one lower without it', () => {
    expect(after(three, placed('a'), gap(2))).toEqual(['b', 'a', 'c']);
    expect(after(three, placed('a'), gap(3))).toEqual(['b', 'c', 'a']);
  });

  it('leaves the list as it was for both gaps touching its own position', () => {
    expect(after(three, placed('b'), gap(1))).toEqual(['a', 'b', 'c']);
    expect(after(three, placed('b'), gap(2))).toEqual(['a', 'b', 'c']);
  });

  it('ties it with another item', () => {
    expect(after(three, placed('c'), slot(0))).toEqual(['a+c', 'b']);
    expect(after(three, placed('a'), slot(2))).toEqual(['b', 'c+a']);
  });

  it('refuses its own position as a tie target', () => {
    expect(describeDrop(three, placed('b'), slot(1))).toBe('rejected');
  });

  it('refuses a gap past the end and an item that is not down at all', () => {
    expect(describeDrop(three, placed('a'), gap(4))).toBe('rejected');
    expect(describeDrop(three, placed('z'), gap(0))).toBe('rejected');
  });
});

describe('moving one half of a tie', () => {
  const tied = state(list('a+b', 'c', 'd'));

  it('leaves the partner holding the position and shifts nothing below it', () => {
    expect(after(tied, placed('b'), gap(2))).toEqual(['a', 'c', 'b', 'd']);
    expect(after(tied, placed('b'), gap(3))).toEqual(['a', 'c', 'd', 'b']);
  });

  it('can tie again somewhere else', () => {
    expect(after(tied, placed('b'), slot(2))).toEqual(['a', 'c', 'd+b']);
  });

  it('refuses a position that already holds two', () => {
    expect(describeDrop(tied, placed('d'), slot(0))).toBe('rejected');
  });
});

// What the screen reader announces once the drop is in. The cases that matter
// are the ones where the slot and the gap disagree.
describe('landingSlot', () => {
  const three = state(list('a', 'b', 'c'), ['d']);

  it('lands a pool item in the slot under the gap, or in the slot it ties with', () => {
    expect(landingSlot(three, pool, gap(0))).toBe(0);
    expect(landingSlot(three, pool, gap(3))).toBe(3);
    expect(landingSlot(three, pool, slot(1))).toBe(1);
  });

  it('lands an item moved down one above the gap it was dropped in', () => {
    expect(landingSlot(three, placed('a'), gap(2))).toBe(1);
    expect(landingSlot(three, placed('a'), gap(3))).toBe(2);
  });

  it('lands an item moved up in the slot under the gap', () => {
    expect(landingSlot(three, placed('c'), gap(0))).toBe(0);
    expect(landingSlot(three, placed('c'), gap(1))).toBe(1);
  });

  it('leaves an item dropped beside itself where it was', () => {
    expect(landingSlot(three, placed('b'), gap(1))).toBe(1);
    expect(landingSlot(three, placed('b'), gap(2))).toBe(1);
  });

  it('shifts nothing for one half of a tie, whose position stays behind', () => {
    const tied = state(list('a+b', 'c', 'd'));
    expect(landingSlot(tied, placed('b'), gap(3))).toBe(3);
  });

  it('answers null for a refused drop', () => {
    expect(landingSlot(three, placed('b'), slot(1))).toBeNull();
    expect(landingSlot(three, pool, gap(4))).toBeNull();
  });
});

// The preview colours come off describeDrop while resolveDrop is not running,
// so it is pinned on its own rather than through what the drop produced.
describe('describeDrop', () => {
  it('names the three outcomes', () => {
    const current = state(list('a', 'b+c'), ['d']);

    expect(describeDrop(current, pool, gap(2))).toBe('insert');
    expect(describeDrop(current, pool, slot(0))).toBe('tie');
    expect(describeDrop(current, pool, slot(1))).toBe('rejected');

    expect(describeDrop(current, placed('b'), gap(0))).toBe('insert');
    expect(describeDrop(current, placed('a'), slot(1))).toBe('rejected');
  });
});

describe('a refused drop', () => {
  it('leaves the state it was given untouched', () => {
    const current = state(list('a', 'b+c'), ['d']);
    expect(resolveDrop(current, pool, slot(1))).toBeNull();
    expect(layout(current.rankedSlots)).toEqual(['a', 'b+c']);
    expect(current.pendingPool).toEqual(['d']);
  });
});
