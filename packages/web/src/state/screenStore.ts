import { create } from 'zustand';
import { linkedCode } from '../room/link.ts';
import { recordFor } from '../room/tabRecord.ts';

// App decides what to render off this instead of pulling in a router.
export type Screen =
  'list-input' | 'catalog' | 'sorting' | 'result' | 'room-create' | 'room-join' | 'lobby';

// Someone who opened a room's link came to join it, not to write a list. A tab
// that was already sorting in that room goes straight back to its list.
function opening(): Screen {
  const code = linkedCode();
  if (code === null) return 'list-input';
  return recordFor(code) ? 'sorting' : 'room-join';
}

interface ScreenState {
  screen: Screen;
  setScreen: (screen: Screen) => void;
}

export const useScreen = create<ScreenState>((set) => ({
  screen: opening(),
  setScreen: (screen) => set({ screen }),
}));
