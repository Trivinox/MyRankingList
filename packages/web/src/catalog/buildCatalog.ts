import type {
  CatalogCategory,
  CatalogFiles,
  PresetItem,
  PresetList,
  RawCategories,
  RawItem,
  RawList,
} from './types.ts';

// Mirrors the form's per-item limit. A file is written by hand, so nothing
// stops it going over and nothing in the form would catch it later.
const TEXT_LIMIT = 80;

// The language and the category live in the path, not inside the file, so both
// patterns start at the lists directory to tell a list apart from the
// categories file sitting one level above it.
const listPath = /lists\/([^/]+)\/([^/]+)\/([^/]+)\.json$/;
const categoriesPath = /lists\/([^/]+)\/categories\.json$/;

function readItem(raw: unknown): PresetItem | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const { text, image_url: imageUrl } = raw as RawItem;
  if (typeof text !== 'string' || text.trim() === '' || text.length > TEXT_LIMIT) return null;
  if (imageUrl !== undefined && typeof imageUrl !== 'string') return null;

  return imageUrl === undefined ? { text } : { text, imageUrl };
}

// A list that has lost an item is worse than a list nobody sees: the user would
// sort five things believing they were six. One bad item drops the whole file.
function readList(raw: unknown, id: string): PresetList | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const { title, items } = raw as RawList;
  if (typeof title !== 'string' || title.trim() === '') return null;
  if (!Array.isArray(items) || items.length === 0) return null;

  const read: PresetItem[] = [];
  for (const entry of items) {
    const item = readItem(entry);
    if (item === null) return null;
    read.push(item);
  }

  return { id, title, items: read };
}

function readCategoryNames(files: CatalogFiles, lang: string): Map<string, string> {
  const names = new Map<string, string>();

  for (const [path, raw] of Object.entries(files)) {
    if (categoriesPath.exec(path)?.[1] !== lang) continue;
    if (typeof raw !== 'object' || raw === null) continue;

    for (const [id, name] of Object.entries(raw as RawCategories)) {
      if (typeof name === 'string' && name.trim() !== '') names.set(id, name);
    }
  }

  return names;
}

// Both arguments are the tree as it comes off disk, keyed by path. Categories
// come out in the order categories.json names them, which is the curated one;
// the lists inside each come out by title.
export function buildCatalog(
  lists: CatalogFiles,
  categories: CatalogFiles,
  lang: string,
): CatalogCategory[] {
  const names = readCategoryNames(categories, lang);
  const grouped = new Map<string, PresetList[]>();

  for (const [path, raw] of Object.entries(lists)) {
    const match = listPath.exec(path);
    if (match === null || match[1] !== lang) continue;

    const [, , category, file] = match;
    // A category with no translated name is hidden in this language, the same
    // way a list with no translation is, so its files are never read.
    if (!names.has(category)) continue;

    const list = readList(raw, file);
    if (list === null) continue;

    const bucket = grouped.get(category);
    if (bucket) {
      bucket.push(list);
    } else {
      grouped.set(category, [list]);
    }
  }

  return [...names].flatMap(([id, name]) => {
    const lists = grouped.get(id);
    if (lists === undefined) return [];

    // By title, not by file name: the files are named in English, so the path
    // order would sort the Spanish catalog on words nobody ever sees.
    lists.sort((a, b) => a.title.localeCompare(b.title, lang));
    return [{ id, name, lists }];
  });
}
