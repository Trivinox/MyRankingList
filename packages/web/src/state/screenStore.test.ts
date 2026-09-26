// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPlacement } from '../core/placement.ts';
import { writeTabRecord } from '../room/tabRecord.ts';

const items = [
  { id: 'a', text: 'Udon' },
  { id: 'b', text: 'Soba' },
  { id: 'c', text: 'Ramen' },
];

// The opening screen is decided once, when the store is first imported, so
// each case loads it again after setting up the address and the tab.
async function opening(address: string) {
  window.history.replaceState(null, '', address);
  vi.resetModules();
  const { useScreen } = await import('./screenStore.ts');
  return useScreen.getState().screen;
}

beforeEach(() => {
  sessionStorage.clear();
  writeTabRecord({
    code: 'AB3K',
    seat: 's1',
    you: 'j',
    nickname: 'Juan',
    items,
    criterion: 'Best noodle',
    placement: startPlacement(items),
  });
});

afterEach(() => window.history.replaceState(null, '', '/'));

describe('the opening screen', () => {
  it('is the sorting screen when the tab was sorting in the linked room', async () => {
    expect(await opening('/?room=AB3K')).toBe('sorting');
  });

  it('is the join screen when the tab was sorting in another room', async () => {
    expect(await opening('/?room=ZZ9Z')).toBe('room-join');
  });

  it('is the join screen for a link and no record', async () => {
    sessionStorage.clear();

    expect(await opening('/?room=AB3K')).toBe('room-join');
  });

  it('is the form with no link, record or not', async () => {
    expect(await opening('/')).toBe('list-input');
  });
});
