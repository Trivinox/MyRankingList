// A catalog item is not an Item yet: it carries no id, because the id is minted
// when the list is copied into a draft and belongs to that copy alone.
export interface PresetItem {
  text: string;
  imageUrl?: string;
}

export interface PresetList {
  id: string;
  title: string;
  items: PresetItem[];
}

export interface CatalogCategory {
  id: string;
  name: string;
  lists: PresetList[];
}

// The tree keyed by file path, the way the glob hands it over.
export type CatalogFiles = Record<string, unknown>;

// The shapes as they come off disk: nothing about them is settled until the
// builder has looked. snake_case is the JSON's vocabulary, not the app's.
export interface RawItem {
  text?: unknown;
  image_url?: unknown;
}

export interface RawList {
  title?: unknown;
  items?: unknown;
}

export type RawCategories = Record<string, unknown>;
