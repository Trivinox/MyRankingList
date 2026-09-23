import { create } from 'zustand';

// App decides what to render off this instead of pulling in a router.
export type Screen = 'list-input' | 'catalog' | 'sorting' | 'result';

interface ScreenState {
  screen: Screen;
  setScreen: (screen: Screen) => void;
}

export const useScreen = create<ScreenState>((set) => ({
  screen: 'list-input',
  setScreen: (screen) => set({ screen }),
}));
