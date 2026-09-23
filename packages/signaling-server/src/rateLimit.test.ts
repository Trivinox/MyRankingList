import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit.ts';
import type { RateLimiter } from './rateLimit.ts';

const WINDOW = 5 * 60 * 1000;

function setup() {
  let time = 1_000_000;
  const limiter = createRateLimiter({ limit: 10, windowMs: WINDOW, now: () => time });
  const advance = (ms: number) => {
    time += ms;
  };
  return { limiter, advance };
}

function miss(limiter: RateLimiter, key: string, times: number) {
  for (let i = 0; i < times; i++) limiter.recordMiss(key);
}

describe('createRateLimiter', () => {
  it('lets ten misses through and blocks the lookup after them', () => {
    const { limiter } = setup();
    miss(limiter, 'a', 9);
    expect(limiter.blockedFor('a')).toBe(0);
    miss(limiter, 'a', 1);
    expect(limiter.blockedFor('a')).toBe(WINDOW);
  });

  it('counts each key on its own', () => {
    const { limiter } = setup();
    miss(limiter, 'a', 10);
    expect(limiter.blockedFor('b')).toBe(0);
  });

  it('counts the block down from the first miss, and lifts it when the window ends', () => {
    const { limiter, advance } = setup();
    limiter.recordMiss('a');
    advance(60_000);
    miss(limiter, 'a', 9);
    expect(limiter.blockedFor('a')).toBe(WINDOW - 60_000);

    advance(WINDOW - 60_000);
    expect(limiter.blockedFor('a')).toBe(0);
    // A fresh window, not the old one carried over.
    limiter.recordMiss('a');
    expect(limiter.blockedFor('a')).toBe(0);
  });

  it('drops expired windows', () => {
    const { limiter, advance } = setup();
    limiter.recordMiss('a');
    advance(1000);
    limiter.recordMiss('b');
    expect(limiter.size).toBe(2);

    advance(WINDOW - 1000);
    limiter.recordMiss('c');
    expect(limiter.size).toBe(2);

    advance(1000);
    expect(limiter.blockedFor('c')).toBe(0);
    expect(limiter.size).toBe(1);
  });
});
