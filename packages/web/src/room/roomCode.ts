// Copied from the signaling server; the two packages share no code. Every
// code is drawn from these characters. One with any other in it cannot exist,
// and looking it up would spend one of the few misses an address is allowed.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 4;

export function readRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every((char) => ROOM_CODE_ALPHABET.includes(char)) ? code : null;
}
