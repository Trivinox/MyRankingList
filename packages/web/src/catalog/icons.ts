// Placeholders until the real icon set lands; then only the values change.
const categoryIcon: Record<string, string> = {
  food: '🍎',
  movies: '🎬',
};

export function iconFor(category: string) {
  return categoryIcon[category] ?? '📋';
}
