// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPlacement } from '../core/placement.ts';
import { clearTabRecord, readTabRecord, recordFor, writeTabRecord } from './tabRecord.ts';
import type { TabRecord } from './tabRecord.ts';

const items = [
  { id: 'a', text: 'Udon' },
  { id: 'b', text: 'Soba' },
  { id: 'c', text: 'Ramen' },
];

const record: TabRecord = {
  code: 'AB3K',
  seat: 's1',
  you: 'j',
  nickname: 'Juan',
  items,
  criterion: 'Best noodle',
  placement: startPlacement(items),
  finished: false,
  result: null,
};

// What a browser that refuses site data does on any touch of the storage.
const refuse = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

beforeEach(() => sessionStorage.clear());

afterEach(() => vi.restoreAllMocks());

describe('the tab record', () => {
  it('gives back what was written', () => {
    writeTabRecord(record);

    expect(readTabRecord()).toEqual(record);
  });

  it('keeps a list that was handed in as finished', () => {
    const done = { ...record, finished: true };
    writeTabRecord(done);

    expect(readTabRecord()).toEqual(done);
  });

  it('keeps the result once the room is revealed', () => {
    const revealed = {
      ...record,
      finished: true,
      result: {
        consensus: items.map((item, index) => ({
          itemId: item.id,
          averagePosition: index + 1,
          rank: index + 1,
          tied: false,
        })),
        discrepancies: items.map((item) => ({ itemId: item.id, dispersion: 0 })),
        lists: [],
        affinity: [],
      },
    };
    writeTabRecord(revealed);

    expect(readTabRecord()).toEqual(revealed);
  });

  it('is gone once cleared', () => {
    writeTabRecord(record);

    clearTabRecord();

    expect(readTabRecord()).toBeNull();
  });

  it('is only found for the room the address points at', () => {
    writeTabRecord(record);

    expect(recordFor('AB3K')).toEqual(record);
    expect(recordFor('ZZ9Z')).toBeNull();
    expect(recordFor(null)).toBeNull();
  });

  it('counts as none when what is stored is not a whole record', () => {
    sessionStorage.setItem('myrankinglist-room', '{"code":"AB3K","seat":"s1"}');
    expect(readTabRecord()).toBeNull();

    sessionStorage.setItem('myrankinglist-room', 'not json');
    expect(readTabRecord()).toBeNull();

    // Written by a build from before a list could be finished.
    const older: Partial<TabRecord> = { ...record };
    delete older.finished;
    sessionStorage.setItem('myrankinglist-room', JSON.stringify(older));
    expect(readTabRecord()).toBeNull();

    // And by one from before a room had a result.
    const unrevealed: Partial<TabRecord> = { ...record };
    delete unrevealed.result;
    sessionStorage.setItem('myrankinglist-room', JSON.stringify(unrevealed));
    expect(readTabRecord()).toBeNull();
  });

  it('counts as none, and throws nothing, when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse);

    expect(() => writeTabRecord(record)).not.toThrow();
    expect(() => clearTabRecord()).not.toThrow();
    expect(readTabRecord()).toBeNull();
  });
});
