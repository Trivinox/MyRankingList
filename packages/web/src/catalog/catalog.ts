import { buildCatalog } from './buildCatalog.ts';
import type { CatalogCategory } from './types.ts';

// Vite walks the tree at build time, so the catalog travels with the bundle and
// no screen waits on a request for it. Without import: 'default' every value
// would be a module namespace wrapping the JSON.
const listFiles = import.meta.glob('../lists/*/*/*.json', { eager: true, import: 'default' });
const categoryFiles = import.meta.glob('../lists/*/categories.json', {
  eager: true,
  import: 'default',
});

export function loadCatalog(lang: string): CatalogCategory[] {
  return buildCatalog(listFiles, categoryFiles, lang);
}
