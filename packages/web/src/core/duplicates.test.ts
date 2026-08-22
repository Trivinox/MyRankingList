import { describe, expect, it } from 'vitest';
import { findDuplicates, normalizeItemText } from './duplicates.ts';

const positions = (texts: string[]) => findDuplicates(texts).map((group) => group.indexes);

describe('normalizeItemText', () => {
  it('leaves already clean text alone apart from the casing', () => {
    expect(normalizeItemText('Ice Cream')).toBe('ice cream');
    expect(normalizeItemText('PIZZA')).toBe('pizza');
  });

  it('drops the spaces around the text', () => {
    expect(normalizeItemText('  pizza ')).toBe('pizza');
  });

  it('collapses runs of whitespace inside the text', () => {
    expect(normalizeItemText('Ice  Cream')).toBe('ice cream');
    expect(normalizeItemText('ice     cream')).toBe('ice cream');
    expect(normalizeItemText('ice	cream')).toBe('ice cream');
  });

  it('does not close a gap that was never there', () => {
    expect(normalizeItemText('icecream')).not.toBe(normalizeItemText('ice cream'));
  });

  it('turns whitespace-only text into nothing', () => {
    expect(normalizeItemText('   ')).toBe('');
  });

  it('matches an accent written as a combining mark with the precomposed one', () => {
    expect(normalizeItemText('cafe\u0301')).toBe(normalizeItemText('caf\u00e9'));
  });
});

describe('findDuplicates', () => {
  it('finds nothing in a list with no repeats', () => {
    expect(findDuplicates(['pizza', 'pasta', 'sushi'])).toEqual([]);
  });

  it('reports the rows that collide and leaves the rest out', () => {
    expect(positions(['Pizza', 'pasta', ' pizza '])).toEqual([[0, 2]]);
  });

  it('keeps the first spelling to show in the warning', () => {
    expect(findDuplicates(['Ice  Cream', 'ice cream'])).toEqual([
      { text: 'Ice  Cream', indexes: [0, 1] },
    ]);
  });

  it('puts three copies of the same item in one group', () => {
    expect(positions(['sushi', 'SUSHI', 'Sushi '])).toEqual([[0, 1, 2]]);
  });

  it('reports several groups in the order they first show up', () => {
    expect(positions(['pasta', 'pizza', 'PASTA', 'sushi', 'Pizza'])).toEqual([
      [0, 2],
      [1, 4],
    ]);
  });

  it('does not pair up blank fields', () => {
    expect(findDuplicates(['pizza', '  ', '', '\t'])).toEqual([]);
  });
});
