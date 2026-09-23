import { describe, expect, it } from 'vitest';
import { readRoomCode } from './roomCode.ts';

describe('readRoomCode', () => {
  it('accepts a code as the server writes it', () => {
    expect(readRoomCode('AB3K')).toBe('AB3K');
    expect(readRoomCode('ZZ99')).toBe('ZZ99');
  });

  it('uppercases the code and drops the spaces around it', () => {
    expect(readRoomCode('ab3k')).toBe('AB3K');
    expect(readRoomCode('  aB3k\t')).toBe('AB3K');
  });

  it('refuses a code of the wrong length', () => {
    expect(readRoomCode('AB3')).toBeNull();
    expect(readRoomCode('AB3KM')).toBeNull();
    expect(readRoomCode('')).toBeNull();
  });

  it.each(['0', 'O', '1', 'I', 'L'])('refuses a code with %s in it', (char) => {
    expect(readRoomCode(`AB3${char}`)).toBeNull();
    expect(readRoomCode(`ab3${char.toLowerCase()}`)).toBeNull();
  });

  it('refuses a space or a symbol inside the code', () => {
    expect(readRoomCode('AB 3')).toBeNull();
    expect(readRoomCode('AB-3')).toBeNull();
  });
});
