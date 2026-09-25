import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomRegistry } from './rooms.ts';

const GRACE = 60_000;

describe('RoomRegistry', () => {
  it('resolves an open code to its host', () => {
    const rooms = new RoomRegistry({ graceMs: GRACE });
    const code = rooms.open('host-a');
    expect(code).not.toBeNull();
    expect(rooms.resolve(code!)).toBe('host-a');
  });

  it('gives two hosts two different codes', () => {
    const rooms = new RoomRegistry({ graceMs: GRACE });
    expect(rooms.open('host-a')).not.toBe(rooms.open('host-b'));
  });

  it('gives a host that asks again the code it already has', () => {
    const rooms = new RoomRegistry({ graceMs: GRACE });
    const first = rooms.open('host-a');
    expect(rooms.open('host-a')).toBe(first);
  });
});

describe('RoomRegistry holds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a held code resolving until the window runs out, then frees it', () => {
    const rooms = new RoomRegistry({ graceMs: GRACE });
    const code = rooms.open('host-a')!;
    rooms.hold('host-a');

    vi.advanceTimersByTime(GRACE - 1);
    expect(rooms.resolve(code)).toBe('host-a');

    vi.advanceTimersByTime(1);
    expect(rooms.resolve(code)).toBeUndefined();
    // Asking again after the window is a new room, not the old one.
    expect(rooms.open('host-a')).not.toBeNull();
  });

  it('keeps the code for good when the host comes back inside the window', () => {
    const rooms = new RoomRegistry({ graceMs: GRACE });
    const code = rooms.open('host-a')!;
    rooms.hold('host-a');

    vi.advanceTimersByTime(GRACE / 2);
    rooms.cancelHold('host-a');
    vi.advanceTimersByTime(GRACE * 2);
    expect(rooms.resolve(code)).toBe('host-a');
  });

  it('gives a held host its own code when it asks again', () => {
    const rooms = new RoomRegistry({ graceMs: GRACE });
    const code = rooms.open('host-a');
    rooms.hold('host-a');
    expect(rooms.open('host-a')).toBe(code);
  });

  it('does not restart the window when the same host is held twice', () => {
    const rooms = new RoomRegistry({ graceMs: GRACE });
    const code = rooms.open('host-a')!;
    rooms.hold('host-a');
    vi.advanceTimersByTime(GRACE / 2);
    rooms.hold('host-a');

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(GRACE / 2);
    expect(rooms.resolve(code)).toBeUndefined();
  });

  it('holds nothing for a peer that has no code', () => {
    const rooms = new RoomRegistry({ graceMs: GRACE });
    const code = rooms.open('host-a')!;
    rooms.hold('guest');

    expect(vi.getTimerCount()).toBe(0);
    expect(rooms.resolve(code)).toBe('host-a');
  });

  it('drops every pending window on clearHolds', () => {
    const rooms = new RoomRegistry({ graceMs: GRACE });
    rooms.open('host-a');
    rooms.open('host-b');
    rooms.hold('host-a');
    rooms.hold('host-b');

    rooms.clearHolds();
    expect(vi.getTimerCount()).toBe(0);
  });
});
