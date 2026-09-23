import { create } from 'zustand';
import { linkedCode } from '../room/link.ts';

// App decides what to render off this instead of pulling in a router.
export type Screen =
  'list-input' | 'catalog' | 'sorting' | 'result' | 'room-create' | 'room-join' | 'lobby';

interface ScreenState {
  screen: Screen;
  setScreen: (screen: Screen) => void;
}

export const useScreen = create<ScreenState>((set) => ({
  // Someone who opened a room's link came to join it, not to write a list.
  screen: linkedCode() === null ? 'list-input' : 'room-join',
  setScreen: (screen) => set({ screen }),
}));
