import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadCatalog } from '../catalog/catalog.ts';
import { iconFor } from '../catalog/icons.ts';
import type { CatalogCategory, PresetList } from '../catalog/types.ts';
import { normalizeItemText } from '../core/duplicates.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import styles from './CatalogScreen.module.css';

// The duplicate check keeps accents apart on purpose, since two spellings are
// two items. Searching is the other case: somebody typing "peliculas" in a
// hurry still has to land on "Peliculas clasicas", so the marks come off both
// sides on top of what normalizeItemText already does.
function forSearch(text: string) {
  return normalizeItemText(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function matches(list: PresetList, query: string) {
  if (forSearch(list.title).includes(query)) return true;
  return list.items.some((item) => forSearch(item.text).includes(query));
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

  const search = forSearch(query);
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

      {categories.length === 0 ? (
        // Reachable through categories.json alone: a language whose file lost
        // its entries builds nothing, and a bare search box over an empty page
        // reads as a catalog that broke rather than as one with no lists.
        <p className={styles.empty}>{t('catalog.empty')}</p>
      ) : found === null ? (
        categories.map((category) => (
          <section key={category.id} className={styles.category}>
            <h3 className={styles.categoryName}>
              <span aria-hidden="true" className={styles.icon}>
                {iconFor(category.id)}
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
