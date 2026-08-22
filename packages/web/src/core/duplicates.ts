export interface DuplicateGroup {
  text: string;
  indexes: number[];
}

// Two items count as the same when only casing or spacing tells them apart, so
// "Ice Cream" and " ice  cream " collide. Any whitespace run collapses, not
// just plain spaces: text pasted from elsewhere arrives with tabs and newlines
// in it. NFC keeps an accent typed as a combining mark from passing for a
// different item than the same accent typed precomposed.
export function normalizeItemText(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Takes the texts rather than items, and answers with positions, because the
// form asks this question while the rows are still being typed and have no
// item to belong to yet.
//
// Groups come back in order of first appearance, and each keeps the text as the
// first of its rows spelled it, since that is what the warning has to show.
// Rows whose text normalizes to nothing are left out: an empty field is the
// form's problem, not a repeat.
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
