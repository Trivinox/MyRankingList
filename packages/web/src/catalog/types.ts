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

// What the JSON files hand over, before anything has been checked.
export type CatalogFiles = Record<string, unknown>;
