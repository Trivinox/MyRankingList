import { FilmSlateIcon, ForkKnifeIcon, ListBulletsIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

const categoryIcon: Record<string, Icon> = {
  food: ForkKnifeIcon,
  movies: FilmSlateIcon,
};

// A category added to the files later gets the plain list until someone picks
// it an icon of its own.
export function iconFor(category: string) {
  return categoryIcon[category] ?? ListBulletsIcon;
}
