import { beforeEach, describe, expect, it } from 'vitest';
import type { PresetItem } from '../catalog/types.ts';
import { useListDraft } from './listDraftStore.ts';

const preset: PresetItem[] = [
  { text: 'Apple', imageUrl: 'https://example.com/apple.jpg' },
  { text: 'Banana' },
  { text: 'Cherry' },
];

beforeEach(() => {
  useListDraft.setState({ items: [], criterion: '' });
});

describe('seedItems', () => {
  it('copies the items in order, images included', () => {
    useListDraft.getState().seedItems(preset);

    expect(useListDraft.getState().items.map(({ text, imageUrl }) => ({ text, imageUrl }))).toEqual(
      preset.map(({ text, imageUrl }) => ({ text, imageUrl })),
    );
  });

  // The store's own actions never change a row in place, so an edit could not
  // leak back today even through a shared object. This holds the copy to not
  // sharing one at all, whatever the actions do later.
  it('hands over new objects rather than the catalog ones', () => {
    useListDraft.getState().seedItems(preset);

    useListDraft.getState().items.forEach((item, index) => {
      expect(item).not.toBe(preset[index]);
    });
  });

  it('leaves the catalog items as they were', () => {
    const before = structuredClone(preset);

    useListDraft.getState().seedItems(preset);

    expect(preset).toEqual(before);
    expect(preset[0]).not.toHaveProperty('id');
  });

  it('gives every row an id of its own, new on each seed', () => {
    const { seedItems } = useListDraft.getState();

    seedItems(preset);
    const first = useListDraft.getState().items.map((item) => item.id);
    seedItems(preset);
    const second = useListDraft.getState().items.map((item) => item.id);

    expect(new Set([...first, ...second]).size).toBe(preset.length * 2);
  });

  it('adds no image property to an item without one', () => {
    useListDraft.getState().seedItems(preset);

    expect(useListDraft.getState().items[1]).not.toHaveProperty('imageUrl');
  });
});
