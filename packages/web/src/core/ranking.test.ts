import { describe, expect, it } from 'vitest';
import { moveIntoTie, moveItem, tieAt } from './placement.ts';
import { rankItems } from './ranking.ts';
import type { RankedSlot } from './types.ts';

const list = (...positions: string[]): RankedSlot[] =>
  positions.map((position) => ({ itemIds: position.split('+') }) as RankedSlot);

const numbers = (slots: RankedSlot[]) => rankItems(slots).map((entry) => entry.rank);

describe('rankItems', () => {
  it('numbers an untied list one by one', () => {
    expect(numbers(list('a', 'b', 'c'))).toEqual([1, 2, 3]);
  });

  it('skips the number a tie consumed', () => {
    expect(numbers(list('a', 'b+c', 'd'))).toEqual([1, 2, 2, 4]);
  });

  it('gives both halves of a tie the same number and marks them', () => {
    expect(rankItems(list('a', 'b+c'))).toEqual([
      { rank: 1, itemId: 'a', tied: false },
      { rank: 2, itemId: 'b', tied: true },
      { rank: 2, itemId: 'c', tied: true },
    ]);
  });

  it('counts two ties in a row', () => {
    expect(numbers(list('a+b', 'c+d', 'e'))).toEqual([1, 1, 3, 3, 5]);
  });

  it('handles a list that is nothing but one tie', () => {
    expect(numbers(list('a+b'))).toEqual([1, 1]);
  });
});

describe('numbering after edits', () => {
  it('closes the gap the tie left once the pair is split', () => {
    const tied = tieAt(list('a', 'b', 'c'), 'd', 1);
    expect(numbers(tied)).toEqual([1, 2, 2, 4]);

    expect(numbers(moveItem(tied, 'd', 2))).toEqual([1, 2, 3, 4]);
  });

  it('follows several moves and ties in a row', () => {
    let slots = list('a', 'b', 'c', 'd');

    slots = moveItem(slots, 'd', 0);
    expect(rankItems(slots).map((entry) => entry.itemId)).toEqual(['d', 'a', 'b', 'c']);

    slots = moveIntoTie(slots, 'a', 2);
    expect(numbers(slots)).toEqual([1, 2, 3, 3]);

    slots = moveItem(slots, 'c', 0);
    expect(rankItems(slots)).toEqual([
      { rank: 1, itemId: 'c', tied: false },
      { rank: 2, itemId: 'd', tied: false },
      { rank: 3, itemId: 'b', tied: false },
      { rank: 4, itemId: 'a', tied: false },
    ]);
  });
});
