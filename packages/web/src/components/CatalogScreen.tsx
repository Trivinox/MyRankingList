import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadCatalog } from '../catalog/catalog.ts';
import type { CatalogCategory, PresetList } from '../catalog/types.ts';
import { normalizeItemText } from '../core/duplicates.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import styles from './CatalogScreen.module.css';

// Emoji stand in until the real icon set arrives; only the values change then.
const categoryIcon: Record<string, string> = {
  food: '\u{1F34E}',
  movies: '\u{1F3AC}',
};

const fallbackIcon = '\u{1F4CB}';

// The same normalizer the duplicate check uses, on both sides of the compare,
// so "  Apple" from a paste finds the same lists "apple" does.
function matches(list: PresetList, query: string) {
  if (normalizeItemText(list.title).includes(query)) return true;
  return list.items.some((item) => normalizeItemText(item.text).includes(query));
}

export function CatalogScreen() {
  const { t, i18n } = useTranslation();
  const setScreen = useListDraft((state) => state.setScreen);
  const [query, setQuery] = useState('');

  // resolvedLanguage rather than language: a tag with no folder of its own
  // resolves to the one it falls back to, instead of building nothing and
  // looking like a catalog that failed to load.
  const lang = i18n.resolvedLanguage ?? 'en';
  // Every call rebuilds and returns new arrays, so without this the whole
  // screen would rerender against a different catalog on every keystroke.
  const categories = useMemo(() => loadCatalog(lang), [lang]);

  const search = normalizeItemText(query);
  const found = search === '' ? null : flatten(categories, search);

  return (
    <section className={styles.screen}>
      <div className={styles.top}>
        <h2 className={styles.heading}>{t('catalog.heading')}</h2>
        <button type="button" className={styles.back} onClick={() => setScreen('list-input')}>
          {t('catalog.back')}
        </button>
      </div>

      <label className={styles.search}>
        <span className={styles.label}>{t('catalog.searchLabel')}</span>
        <input
          type="search"
          value={query}
          placeholder={t('catalog.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {found === null ? (
        categories.map((category) => (
          <section key={category.id} className={styles.category}>
            <h3 className={styles.categoryName}>
              <span aria-hidden="true" className={styles.icon}>
                {categoryIcon[category.id] ?? fallbackIcon}
              </span>
              {category.name}
            </h3>
            <ul className={styles.lists}>
              {category.lists.map((list) => (
                <ListRow key={list.id} list={list} />
              ))}
            </ul>
          </section>
        ))
      ) : found.length === 0 ? (
        <p className={styles.empty}>{t('catalog.noResults')}</p>
      ) : (
        <ul className={styles.lists} aria-label={t('catalog.resultsLabel')}>
          {found.map(({ category, list }) => (
            <ListRow key={`${category}/${list.id}`} list={list} category={category} />
          ))}
        </ul>
      )}
    </section>
  );
}

// Searching drops the tree: a word found inside the items reads as "these four
// lists have it", not as a set of categories waiting to be opened one by one.
function flatten(categories: CatalogCategory[], query: string) {
  return categories.flatMap((category) =>
    category.lists
      .filter((list) => matches(list, query))
      .map((list) => ({ category: category.name, list })),
  );
}

interface ListRowProps {
  list: PresetList;
  category?: string;
}

function ListRow({ list, category }: ListRowProps) {
  const { t } = useTranslation();
  const withImages = list.items.some((item) => item.imageUrl);

  return (
    <li className={styles.list}>
      <span className={styles.title}>{list.title}</span>
      <span className={styles.meta}>
        {category && <span className={styles.from}>{category}</span>}
        <span>{t('catalog.itemCount', { count: list.items.length })}</span>
        {withImages && <span className={styles.images}>{t('catalog.hasImages')}</span>}
      </span>
    </li>
  );
}
