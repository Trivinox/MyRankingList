import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadCatalog } from '../catalog/catalog.ts';
import { iconFor } from '../catalog/icons.ts';
import type { CatalogCategory, PresetList } from '../catalog/types.ts';
import { normalizeItemText } from '../core/duplicates.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import { useScreen } from '../state/screenStore.ts';
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

// Handed down to every row, so a row can start a pick and draw the prompt
// that belongs to it without knowing about the draft.
interface Picker {
  pending: PresetList | null;
  use: (list: PresetList) => void;
  replace: (list: PresetList) => void;
  keep: () => void;
}

interface CatalogScreenProps {
  // This screen is gone by the time the rows are copied, so whatever says so
  // has to live in a region that outlasts it.
  announce: (message: string) => void;
}

export function CatalogScreen({ announce }: CatalogScreenProps) {
  const { t, i18n } = useTranslation();
  const setScreen = useScreen((state) => state.setScreen);
  const seedItems = useListDraft((state) => state.seedItems);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<PresetList | null>(null);

  // resolvedLanguage rather than language: a tag with no folder of its own
  // resolves to the one it falls back to, instead of building nothing and
  // looking like a catalog that failed to load.
  const lang = i18n.resolvedLanguage ?? 'en';
  // Every call rebuilds and returns new arrays, so without this the whole
  // screen would rerender against a different catalog on every keystroke.
  const categories = useMemo(() => loadCatalog(lang), [lang]);

  // The criterion is left as it is. The title stays behind in the catalog: a
  // list the user sorts has no title, only what it is being compared by.
  const replace = (list: PresetList) => {
    seedItems(list.items);
    setScreen('list-input');
    announce(t('catalog.copied', { count: list.items.length, title: list.title }));
  };

  // Three blank rows are what the form opens with and nothing is lost by
  // replacing them. Anything written, a lone image link included, is asked
  // about first.
  const use = (list: PresetList) => {
    const written = useListDraft
      .getState()
      .items.some((item) => item.text.trim() !== '' || item.imageUrl);
    if (written) {
      setPending(list);
    } else {
      replace(list);
    }
  };

  const picker: Picker = { pending, use, replace, keep: () => setPending(null) };

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
          onChange={(event) => {
            setQuery(event.target.value);
            setPending(null);
          }}
        />
      </label>

      <Listings categories={categories} query={forSearch(query)} picker={picker} />
    </section>
  );
}

interface ListingsProps {
  categories: CatalogCategory[];
  query: string;
  picker: Picker;
}

function Listings({ categories, query, picker }: ListingsProps) {
  const { t } = useTranslation();

  // Reachable through categories.json alone: a language whose file lost its
  // entries builds nothing, and a bare search box over an empty page reads as
  // a catalog that broke rather than as one with no lists.
  if (categories.length === 0) {
    return <p className={styles.empty}>{t('catalog.empty')}</p>;
  }

  if (query === '') {
    return categories.map((category) => (
      <section key={category.id} className={styles.category}>
        <h3 className={styles.categoryName}>
          <span aria-hidden="true" className={styles.icon}>
            {iconFor(category.id)}
          </span>
          {category.name}
        </h3>
        <ul className={styles.lists}>
          {category.lists.map((list) => (
            <ListRow key={list.id} list={list} picker={picker} />
          ))}
        </ul>
      </section>
    ));
  }

  // Searching drops the tree: a word found inside the items reads as "these
  // lists have it", not as a set of categories waiting to be opened one by one.
  const found = categories.flatMap((category) =>
    category.lists
      .filter((list) => matches(list, query))
      .map((list) => ({ category: category.name, list })),
  );

  if (found.length === 0) {
    return <p className={styles.empty}>{t('catalog.noResults')}</p>;
  }

  return (
    <ul className={styles.lists} aria-label={t('catalog.resultsLabel')}>
      {found.map(({ category, list }) => (
        <ListRow key={`${category}/${list.id}`} list={list} category={category} picker={picker} />
      ))}
    </ul>
  );
}

interface ListRowProps {
  list: PresetList;
  category?: string;
  picker: Picker;
}

function ListRow({ list, category, picker }: ListRowProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const promptId = useId();
  const pickButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const backToPick = useRef(false);
  const confirming = picker.pending === list;
  const withImages = list.items.some((item) => item.imageUrl);

  // The prompt takes the place of the button that opened it, so the focus is
  // moved by hand both ways, or it would drop to the page. It lands on keeping
  // the rows, the choice that loses nothing. It only goes back to the button
  // when this prompt was declined; a prompt closed by another row's pick
  // leaves the focus where that row put it.
  useEffect(() => {
    if (confirming) {
      keepButton.current?.focus();
    } else if (backToPick.current) {
      backToPick.current = false;
      pickButton.current?.focus();
    }
  }, [confirming]);

  const keep = () => {
    backToPick.current = true;
    picker.keep();
  };

  return (
    <li className={styles.list}>
      <span id={titleId} className={styles.title}>
        {list.title}
      </span>
      <span className={styles.meta}>
        {category && <span className={styles.from}>{category}</span>}
        <span>{t('catalog.itemCount', { count: list.items.length })}</span>
        {withImages && <span className={styles.images}>{t('catalog.hasImages')}</span>}
      </span>
      {confirming ? (
        <div role="group" aria-labelledby={promptId} className={styles.confirm}>
          <p id={promptId} className={styles.prompt}>
            {t('catalog.confirmPrompt', { title: list.title })}
          </p>
          <div className={styles.choices}>
            <button type="button" className={styles.pick} onClick={() => picker.replace(list)}>
              {t('catalog.confirmReplace')}
            </button>
            <button ref={keepButton} type="button" className={styles.pick} onClick={keep}>
              {t('catalog.confirmKeep')}
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={pickButton}
          type="button"
          className={styles.pick}
          aria-describedby={titleId}
          onClick={() => picker.use(list)}
        >
          {t('catalog.use')}
        </button>
      )}
    </li>
  );
}
