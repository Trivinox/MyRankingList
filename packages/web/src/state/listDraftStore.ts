import { create } from 'zustand';
import type { Item } from '../core/types.ts';

// App decides what to render off this instead of pulling in a router. It will
// outgrow the draft store around the time the room and result screens land.
export type Screen = 'list-input' | 'sorting';

interface ListDraft {
  screen: Screen;
  items: Item[];
  criterion: string;
  addItem: () => void;
  removeItem: (id: string) => void;
  updateItemText: (id: string, text: string) => void;
  updateItemImageUrl: (id: string, imageUrl: string) => void;
  setCriterion: (criterion: string) => void;
  setScreen: (screen: Screen) => void;
}

const blankItem = (): Item => ({ id: crypto.randomUUID(), text: '' });

const patch = (items: Item[], id: string, changes: Partial<Item>) =>
  items.map((item) => (item.id === id ? { ...item, ...changes } : item));

export const useListDraft = create<ListDraft>((set) => ({
  screen: 'list-input',
  // Three rows on arrival: that is the minimum a list needs, so they are there
  // to fill rather than something the user has to ask for one at a time.
  items: [blankItem(), blankItem(), blankItem()],
  criterion: '',

  addItem: () => set((state) => ({ items: [...state.items, blankItem()] })),

  removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

  updateItemText: (id, text) => set((state) => ({ items: patch(state.items, id, { text }) })),

  // An emptied field drops the property instead of keeping an empty string,
  // so an item without an image reads the same however it got there.
  updateItemImageUrl: (id, imageUrl) =>
    set((state) => ({ items: patch(state.items, id, { imageUrl: imageUrl || undefined }) })),

  setCriterion: (criterion) => set({ criterion }),

  setScreen: (screen) => set({ screen }),
}));
