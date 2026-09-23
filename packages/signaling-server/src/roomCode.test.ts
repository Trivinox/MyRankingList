import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, generateRoomCode, normalizeRoomCode } from './roomCode.ts';

// A pick that spells out the given codes, one character per call.
function spelling(...codes: string[]) {
  const indexes = codes.flatMap((code) =>
    [...code].map((char) => ROOM_CODE_ALPHABET.indexOf(char)),
  );
  return () => {
    const next = indexes.shift();
    if (next === undefined) throw new Error('ran out of picks');
    return next;
  };
}

describe('ROOM_CODE_ALPHABET', () => {
  it('has 31 distinct characters and none that read as another', () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(31);
    for (const char of '0O1IL') expect(ROOM_CODE_ALPHABET).not.toContain(char);
  });
});

describe('generateRoomCode', () => {
  it('draws four characters from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(() => false);
      expect(code).toMatch(/^[A-Z2-9]{4}$/);
      for (const char of code!) expect(ROOM_CODE_ALPHABET).toContain(char);
    }
  });

  it('tries again when the code is taken', () => {
    const taken = new Set(['AB3K', 'ZZZZ']);
    const code = generateRoomCode((c) => taken.has(c), spelling('AB3K', 'ZZZZ', 'MN72'));
    expect(code).toBe('MN72');
  });

  it('gives up with null when every try is taken', () => {
    expect(generateRoomCode(() => true)).toBeNull();
  });
});

describe('normalizeRoomCode', () => {
  it('accepts lowercase and surrounding spaces', () => {
    expect(normalizeRoomCode('  ab3k ')).toBe('AB3K');
  });
});
