import { normalizeItemText } from '../core/duplicates.ts';

export const NICKNAME_LIMIT = 20;

// Compared the way the form compares items, since "Juan" and "juan " in one
// room read as the same person. The limit is on what was typed: the suffix is
// ours to add, so "Juan (2)" may run past it. Null means there is no name to
// give, either blank or too long.
export function uniqueNickname(taken: string[], wanted: string): string | null {
  const nickname = wanted.trim();
  if (nickname === '' || nickname.length > NICKNAME_LIMIT) return null;

  const used = new Set(taken.map(normalizeItemText));
  if (!used.has(normalizeItemText(nickname))) return nickname;

  // The lowest free number, so a gap left by someone who went fills first.
  let n = 2;
  while (used.has(normalizeItemText(`${nickname} (${n})`))) n++;
  return `${nickname} (${n})`;
}
