// Emoji stand in until the real icon set arrives; only the values change then.
const categoryIcon: Record<string, string> = {
  food: '\u{1F34E}',
  movies: '\u{1F3AC}',
};

const fallbackIcon = '\u{1F4CB}';

export function iconFor(category: string) {
  return categoryIcon[category] ?? fallbackIcon;
}
