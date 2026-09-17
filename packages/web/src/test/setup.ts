import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library only registers its own cleanup when Vitest runs with globals.
afterEach(cleanup);

// jsdom has no matchMedia at all. Every test starts on a desktop-wide screen
// that never changes, and the ones about the phone layout swap in their own.
// Node-environment tests have no window to put it on.
if (typeof window !== 'undefined') {
  beforeEach(() => {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
  });
}
