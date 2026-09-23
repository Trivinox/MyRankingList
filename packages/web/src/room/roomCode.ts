// Copied from the signaling server, since the two packages share no code. The
// server draws every code from these characters, so a code with any other in
// it cannot exist and is not worth one of the lookups a wrong code costs.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 4;

// Returns the code the way the server writes it, or null when what was typed
// cannot be one.
export function readRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every((char) => ROOM_CODE_ALPHABET.includes(char)) ? code : null;
}
