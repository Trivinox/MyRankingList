import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SoundSettings {
  muted: boolean;
  toggleMuted: () => void;
}

// Kept for the tab rather than for good: someone who muted and then reloaded
// would not expect the sound back, but a new visit starts with it on. When the
// browser blocks site data the middleware finds no storage and the setting
// just lives in memory.
export const useSound = create<SoundSettings>()(
  persist(
    (set) => ({
      muted: false,
      toggleMuted: () => set((state) => ({ muted: !state.muted })),
    }),
    { name: 'myrankinglist-sound', storage: createJSONStorage(() => sessionStorage) },
  ),
);
