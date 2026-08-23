export interface DuplicateGroup {
  text: string;
  indexes: number[];
}

// Only casing and spacing separate two texts that name the same item, so
// "Apple" and " apple " collide. The whitespace class covers the tabs a paste
// drags in, and NFC keeps an accent typed as a combining mark from reading as
// something other than the precomposed one.
export function normalizeItemText(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Positions rather than ids, since the form asks this while its rows are still
// being typed and are not items yet. A group carries the spelling of its first
// row because that is what the warning puts on screen. Blank rows stay out: an
// empty field is the form's own complaint to make.
export function findDuplicates(texts: string[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();

  texts.forEach((text, index) => {
    const key = normalizeItemText(text);
    if (key === '') return;

    const group = groups.get(key);
    if (group) {
      group.indexes.push(index);
    } else {
      groups.set(key, { text, indexes: [index] });
    }
  });

  return [...groups.values()].filter((group) => group.indexes.length > 1);
}
