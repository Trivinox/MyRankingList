import { describe, expect, it } from 'vitest';
import type { Item, RankedSlot } from '../core/types.ts';
import type { Participant } from './hostRoom.ts';
import { AFFINITY_MATRIX_LIMIT, affinityOf, buildResult, fitsItems } from './result.ts';

const items: Item[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id.toUpperCase() }));

const person = (id: string, connected = true): Participant => ({
  id,
  nickname: id.toUpperCase(),
  isCreator: id === 'ana',
  progress: items.length,
  connected,
  finished: true,
});

const list = (...order: (string | [string, string])[]): RankedSlot[] =>
  order.map((entry) => ({ itemIds: typeof entry === 'string' ? [entry] : entry }));

const forward = list('a', 'b', 'c', 'd');
const backward = list('d', 'c', 'b', 'a');

describe('buildResult', () => {
  it('compares two lists, one pair and every item once', () => {
    const result = buildResult(
      [person('ana'), person('juan')],
      new Map([
        ['ana', forward],
        ['juan', backward],
      ]),
    );

    expect(result.lists.map((l) => l.id)).toEqual(['ana', 'juan']);
    expect(result.affinity).toEqual([{ a: 'ana', b: 'juan', coefficient: -1 }]);
    expect(result.consensus.every((entry) => entry.averagePosition === 2.5)).toBe(true);
    expect(result.discrepancies.map((entry) => entry.itemId)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('gives three people three pairs, and reads any of them either way round', () => {
    const result = buildResult(
      [person('ana'), person('juan'), person('eva')],
      new Map([
        ['ana', forward],
        ['juan', forward],
        ['eva', backward],
      ]),
    );

    expect(result.affinity).toHaveLength(3);
    expect(affinityOf(result, 'ana', 'juan')).toBe(1);
    expect(affinityOf(result, 'eva', 'ana')).toBe(-1);
    expect(affinityOf(result, 'ana', 'nobody')).toBeUndefined();
  });

  it('pairs everyone in a room too big for the grid, nine lists and 36 pairs', () => {
    const ids = Array.from({ length: AFFINITY_MATRIX_LIMIT + 1 }, (_, i) => `p${i}`);
    const result = buildResult(
      ids.map((id) => person(id)),
      new Map(ids.map((id, i) => [id, i % 2 ? forward : backward])),
    );

    expect(result.lists).toHaveLength(9);
    expect(result.affinity).toHaveLength(36);
  });

  it('counts the list of someone no longer connected, and says they left', () => {
    const result = buildResult(
      [person('ana'), person('juan', false)],
      new Map([
        ['ana', forward],
        ['juan', forward],
      ]),
    );

    expect(result.lists.map((l) => [l.id, l.left])).toEqual([
      ['ana', false],
      ['juan', true],
    ]);
  });

  it('shares a rank between items level on average, and keeps the ties in the lists', () => {
    const tied = list(['a', 'b'], 'c', 'd');
    const result = buildResult(
      [person('ana'), person('juan')],
      new Map([
        ['ana', tied],
        ['juan', list(['b', 'a'], 'c', 'd')],
      ]),
    );

    expect(result.consensus.slice(0, 2)).toEqual([
      { itemId: 'a', averagePosition: 1.5, rank: 1, tied: true },
      { itemId: 'b', averagePosition: 1.5, rank: 1, tied: true },
    ]);
    expect(result.lists[0].slots).toEqual(tied);
  });

  it('scores identical lists a 1, with nothing divisive', () => {
    const result = buildResult(
      [person('ana'), person('juan'), person('eva')],
      new Map([
        ['ana', forward],
        ['juan', forward],
        ['eva', forward],
      ]),
    );

    expect(result.affinity.map((pair) => pair.coefficient)).toEqual([1, 1, 1]);
    expect(result.discrepancies.every((entry) => entry.dispersion === 0)).toBe(true);
  });

  it('takes a single list as the consensus, with nobody to pair it with', () => {
    const result = buildResult([person('ana')], new Map([['ana', list('c', ['a', 'b'], 'd')]]));

    expect(result.consensus.map((entry) => [entry.itemId, entry.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 2],
      ['d', 4],
    ]);
    expect(result.affinity).toEqual([]);
  });

  it('leaves out anyone without a list', () => {
    const result = buildResult(
      [person('ana'), { ...person('juan'), finished: false }],
      new Map([['ana', forward]]),
    );

    expect(result.lists.map((l) => l.id)).toEqual(['ana']);
  });
});

describe('fitsItems', () => {
  const result = buildResult(
    [person('ana'), person('juan')],
    new Map([
      ['ana', forward],
      ['juan', backward],
    ]),
  );
  // Swaps item d for one this tab never had.
  const stranger = (id: string) => (id === 'd' ? 'x' : id);

  it('takes a result about the same items', () => {
    expect(fitsItems(result, items)).toBe(true);
  });

  it('refuses one about fewer items', () => {
    expect(fitsItems(result, items.slice(0, 3))).toBe(false);
  });

  it('refuses one with a stranger in the consensus, the discrepancies or a list', () => {
    const consensus = result.consensus.map((e) => ({ ...e, itemId: stranger(e.itemId) }));
    const discrepancies = result.discrepancies.map((e) => ({ ...e, itemId: stranger(e.itemId) }));
    const lists = [{ ...result.lists[0], slots: list('a', 'b', 'c', 'c') }];

    expect(fitsItems({ ...result, consensus }, items)).toBe(false);
    expect(fitsItems({ ...result, discrepancies }, items)).toBe(false);
    expect(fitsItems({ ...result, lists }, items)).toBe(false);
  });
});
