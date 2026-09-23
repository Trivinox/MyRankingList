// A fixed window per key: it opens on the first miss, and once it holds `limit`
// misses the key is blocked until the window runs out.
export type RateLimiter = {
  // Milliseconds until the key may try again, or 0 if it is not blocked.
  blockedFor(key: string): number;
  recordMiss(key: string): void;
  readonly size: number;
};

type Window = { start: number; misses: number };

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  // A key's window is only ever added when its old one is gone, so the map
  // stays sorted by start time and the expired ones are always at the front.
  const windows = new Map<string, Window>();

  function dropExpired(time: number) {
    for (const [key, window] of windows) {
      if (time - window.start < windowMs) break;
      windows.delete(key);
    }
  }

  return {
    blockedFor(key) {
      const time = now();
      dropExpired(time);
      const window = windows.get(key);
      if (window === undefined || window.misses < limit) return 0;
      return window.start + windowMs - time;
    },

    recordMiss(key) {
      const time = now();
      dropExpired(time);
      const window = windows.get(key);
      if (window) window.misses++;
      else windows.set(key, { start: time, misses: 1 });
    },

    get size() {
      return windows.size;
    },
  };
}
