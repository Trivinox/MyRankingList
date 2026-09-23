import { describe, expect, it } from 'vitest';
import { RoomRegistry } from './rooms.ts';

describe('RoomRegistry', () => {
  it('resolves an open code to its host', () => {
    const rooms = new RoomRegistry();
    const code = rooms.open('host-a');
    expect(code).not.toBeNull();
    expect(rooms.resolve(code!)).toBe('host-a');
  });

  it('gives two hosts two different codes', () => {
    const rooms = new RoomRegistry();
    expect(rooms.open('host-a')).not.toBe(rooms.open('host-b'));
  });

  it('gives a host that asks again the code it already has', () => {
    const rooms = new RoomRegistry();
    const first = rooms.open('host-a');
    expect(rooms.open('host-a')).toBe(first);
  });

  it('frees the code when its host is released', () => {
    const rooms = new RoomRegistry();
    const code = rooms.open('host-a')!;
    rooms.release('host-a');
    expect(rooms.resolve(code)).toBeUndefined();
    // Asking again after a release is a new room, not the old one.
    expect(rooms.open('host-a')).not.toBeNull();
  });

  it('leaves other rooms alone when releasing a peer that holds none', () => {
    const rooms = new RoomRegistry();
    const code = rooms.open('host-a')!;
    rooms.release('guest');
    expect(rooms.resolve(code)).toBe('host-a');
  });
});
