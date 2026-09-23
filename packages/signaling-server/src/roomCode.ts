import { randomInt } from 'node:crypto';

// No I, L, O, 0 or 1: a code gets read out loud and copied off someone else's
// screen, and none of these should have two readings.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 4;

// With under 1% of the codes ever in use, ten collisions in a row does not
// happen by chance. Giving up beats looping on a registry that is somehow full.
const MAX_TRIES = 10;

// Returns an index in [0, max). randomInt draws without modulo bias, so every
// character is as likely as the next.
export type Pick = (max: number) => number;

export function generateRoomCode(
  isTaken: (code: string) => boolean,
  pick: Pick = randomInt,
): string | null {
  for (let i = 0; i < MAX_TRIES; i++) {
    let code = '';
    while (code.length < ROOM_CODE_LENGTH) {
      code += ROOM_CODE_ALPHABET[pick(ROOM_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
  return null;
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}
