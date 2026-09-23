import { normalizeItemText } from '../core/duplicates.ts';

export const NICKNAME_LIMIT = 20;

// Compared the way the form compares items: "Juan" and "juan " in one room
// read as the same person. The limit is on what was typed and the suffix is
// ours, which lets "Juan (2)" run past it. Null means blank or too long.
export function uniqueNickname(taken: string[], wanted: string): string | null {
  const nickname = wanted.trim();
  if (nickname === '' || nickname.length > NICKNAME_LIMIT) return null;

  const used = new Set(taken.map(normalizeItemText));
  if (!used.has(normalizeItemText(nickname))) return nickname;

  // A gap left by someone who went is filled before counting any higher.
  let n = 2;
  while (used.has(normalizeItemText(`${nickname} (${n})`))) n++;
  return `${nickname} (${n})`;
}
