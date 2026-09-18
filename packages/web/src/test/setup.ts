import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library only registers its own cleanup when Vitest runs with globals.
afterEach(cleanup);

// jsdom has no audio, and Howler falling back to an <audio> element there
// fills the run with "not implemented" errors. A test that cares which sound
// plays mocks it its own way.
vi.mock('howler', () => ({
  Howl: class {
    play() {}
  },
}));

// jsdom has neither matchMedia nor ResizeObserver, and the node-environment
// tests have no window at all.
if (typeof window !== 'undefined') {
  // Nothing is laid out, so there is never a resize to report.
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Every test starts desktop-wide. The phone tests put their own in place.
  beforeEach(() => {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
  });
}
