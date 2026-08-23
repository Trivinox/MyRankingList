import { describe, expect, it } from 'vitest';
import { averagePositions, consensusRanking, itemDiscrepancies, spearman } from './consensus.ts';
import type { RankedSlot } from './types.ts';

const solo = (id: string): RankedSlot => ({ itemIds: [id] });
const tie = (first: string, second: string): RankedSlot => ({ itemIds: [first, second] });
const order = (...ids: string[]) => ids.map(solo);

describe('averagePositions', () => {
  it('walks a plain list up from one', () => {
    expect([...averagePositions(order('a', 'b', 'c')).entries()]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('puts a tied pair on the midpoint of the two positions it occupies', () => {
    const positions = averagePositions([solo('a'), tie('b', 'c'), solo('d')]);
    expect(positions.get('b')).toBe(2.5);
    expect(positions.get('c')).toBe(2.5);
  });

  it('carries on from after the tie, not from beside it', () => {
    const positions = averagePositions([tie('a', 'b'), solo('c')]);
    expect(positions.get('a')).toBe(1.5);
    expect(positions.get('c')).toBe(3);
  });

  it('handles several ties in a row', () => {
    const positions = averagePositions([tie('a', 'b'), tie('c', 'd')]);
    expect([...positions.values()]).toEqual([1.5, 1.5, 3.5, 3.5]);
  });

  it('refuses a list that places the same item twice', () => {
    expect(() => averagePositions(order('a', 'b', 'a'))).toThrow(/more than once/);
  });

  it('refuses an item tied with itself', () => {
    expect(() => averagePositions([tie('a', 'a')])).toThrow(/more than once/);
  });
});

describe('spearman', () => {
  it('scores two identical lists a perfect 1', () => {
    const list = order('a', 'b', 'c', 'd');
    expect(spearman(list, list)).toBe(1);
  });

  it('still scores 1 when the identical lists contain a tie', () => {
    const list = [solo('a'), tie('b', 'c'), solo('d')];
    expect(spearman(list, list)).toBe(1);
  });

  it('scores two opposite lists a flat -1', () => {
    expect(spearman(order('a', 'b', 'c', 'd'), order('d', 'c', 'b', 'a'))).toBe(-1);
  });

  it('lands between the extremes when the lists only partly agree', () => {
    // Positions 1,2,3,4 against 1.5,3,1.5,4: covariance 3 over sqrt(5 * 4.5).
    const partial = spearman(order('a', 'b', 'c', 'd'), [tie('a', 'c'), solo('b'), solo('d')]);
    expect(partial).toBeCloseTo(3 / Math.sqrt(22.5), 12);
  });

  it('agrees with the textbook value for a tied pair in the middle', () => {
    // The same two lists that scipy spearmanr scores 0.8207826816681233.
    const coefficient = spearman(order('a', 'b', 'c', 'd', 'e'), [
      solo('a'),
      solo('b'),
      tie('c', 'e'),
      solo('d'),
    ]);
    expect(coefficient).toBeCloseTo(8 / Math.sqrt(95), 12);
  });

  it('does not care which list is passed first', () => {
    const a = order('a', 'b', 'c');
    const b = [tie('b', 'c'), solo('a')];
    expect(spearman(a, b)).toBe(spearman(b, a));
  });

  it('has no answer for someone who tied everything', () => {
    expect(spearman([tie('a', 'b')], order('a', 'b'))).toBeNull();
  });

  it('refuses two lists that are not about the same items', () => {
    expect(() => spearman(order('a', 'b'), order('a', 'c'))).toThrow(/same items/);
  });
});

describe('consensusRanking', () => {
  it('hands back a single participant their own order', () => {
    expect(consensusRanking([order('b', 'a', 'c')])).toEqual([
      { itemId: 'b', averagePosition: 1, rank: 1 },
      { itemId: 'a', averagePosition: 2, rank: 2 },
      { itemId: 'c', averagePosition: 3, rank: 3 },
    ]);
  });

  it('averages the positions across participants', () => {
    const consensus = consensusRanking([order('a', 'b', 'c'), order('a', 'c', 'b')]);
    expect(consensus).toEqual([
      { itemId: 'a', averagePosition: 1, rank: 1 },
      { itemId: 'b', averagePosition: 2.5, rank: 2 },
      { itemId: 'c', averagePosition: 2.5, rank: 2 },
    ]);
  });

  it('feeds a tie in as the shared position both items hold', () => {
    const consensus = consensusRanking([[tie('a', 'b'), solo('c')], order('a', 'b', 'c')]);
    expect(consensus.map((entry) => entry.averagePosition)).toEqual([1.25, 1.75, 3]);
  });

  it('numbers a shared average competition style', () => {
    const consensus = consensusRanking([order('a', 'b', 'c', 'd'), order('b', 'a', 'c', 'd')]);
    expect(consensus.map((entry) => entry.rank)).toEqual([1, 1, 3, 4]);
  });

  it('lets more than two items share a rank, which a slot cannot express', () => {
    const consensus = consensusRanking([
      order('a', 'b', 'c'),
      order('b', 'c', 'a'),
      order('c', 'a', 'b'),
    ]);
    expect(consensus.map((entry) => entry.averagePosition)).toEqual([2, 2, 2]);
    expect(consensus.map((entry) => entry.rank)).toEqual([1, 1, 1]);
  });

  it('settles a level average on the first participant order', () => {
    const consensus = consensusRanking([order('b', 'a'), order('a', 'b')]);
    expect(consensus.map((entry) => entry.itemId)).toEqual(['b', 'a']);
  });

  it('refuses a room where the lists disagree about the items', () => {
    expect(() => consensusRanking([order('a', 'b'), order('a', 'b', 'c')])).toThrow(/same items/);
  });

  it('refuses a malformed list even when every participant sent the same one', () => {
    const repeated = order('a', 'b', 'a');
    expect(() => consensusRanking([repeated, repeated])).toThrow(/more than once/);
  });

  it('refuses a room with nobody in it', () => {
    expect(() => consensusRanking([])).toThrow(/at least one participant/);
  });
});

describe('itemDiscrepancies', () => {
  it('puts the item people disagree most about first', () => {
    const spread = itemDiscrepancies([order('a', 'b', 'c'), order('c', 'b', 'a')]);
    expect(spread.map((entry) => entry.itemId)).toEqual(['a', 'c', 'b']);
  });

  it('gives an item everyone placed alike no dispersion at all', () => {
    const spread = itemDiscrepancies([order('a', 'b', 'c'), order('a', 'c', 'b')]);
    expect(spread.at(-1)).toEqual({ itemId: 'a', dispersion: 0 });
  });

  it('has nothing to disagree about in a room that ended with one person', () => {
    const spread = itemDiscrepancies([order('a', 'b', 'c')]);
    expect(spread.map((entry) => entry.dispersion)).toEqual([0, 0, 0]);
  });

  it('flattens to zero when the whole room agrees', () => {
    const list = order('a', 'b', 'c');
    expect(itemDiscrepancies([list, list, list]).every((entry) => entry.dispersion === 0)).toBe(
      true,
    );
  });

  it('measures the spread as a population standard deviation', () => {
    // Positions 4, 1 and 4 around a mean of 3: deviations of 1, 2 and 1.
    const spread = itemDiscrepancies([
      order('a', 'b', 'c', 'd'),
      order('d', 'c', 'b', 'a'),
      order('b', 'a', 'c', 'd'),
    ]);
    expect(spread[0]).toEqual({ itemId: 'd', dispersion: Math.SQRT2 });
  });

  it('sorts from most divisive down to least', () => {
    const spread = itemDiscrepancies([order('a', 'b', 'c', 'd'), order('d', 'c', 'b', 'a')]);
    const dispersions = spread.map((entry) => entry.dispersion);
    expect(dispersions).toEqual([...dispersions].sort((x, y) => y - x));
  });

  it('refuses lists that are not about the same items', () => {
    expect(() => itemDiscrepancies([order('a', 'b'), order('b', 'c')])).toThrow(/same items/);
  });
});
