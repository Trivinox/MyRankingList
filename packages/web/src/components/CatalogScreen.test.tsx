// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { loadCatalog } from '../catalog/catalog.ts';
import { iconFor } from '../catalog/icons.ts';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import { es } from '../i18n/locales/es.ts';
import type { Item } from '../core/types.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import { CatalogScreen } from './CatalogScreen.tsx';

// Real content everywhere except the one state the content cannot produce:
// a language whose categories.json has nothing left in it.
vi.mock('../catalog/catalog.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalog.ts')>();
  return { loadCatalog: vi.fn(actual.loadCatalog) };
});

function strip(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// The real files are the fixture: the builder is tested on fake trees of its
// own, and what this screen has to get right is the content that ships. The
// expectations are read back out of the catalog rather than written down, so
// rewriting the list content does not rewrite the suite.
const english = loadCatalog('en');
const spanish = loadCatalog('es');

const anyList = english[0].lists[0];
const withImages = english.flatMap((category) =>
  category.lists.filter((list) => list.items.some((item) => item.imageUrl)),
)[0];
const englishIds = new Set(english.flatMap((category) => category.lists.map((list) => list.id)));
const accented = spanish
  .flatMap((category) => category.lists)
  .find((list) => strip(list.title) !== list.title);
const spanishOnly = spanish
  .flatMap((category) => category.lists)
  .find((list) => !englishIds.has(list.id));

const announce = vi.fn();

const renderCatalog = () => {
  const i18n = createI18n();
  render(
    <I18nextProvider i18n={i18n}>
      <CatalogScreen announce={announce} />
    </I18nextProvider>,
  );
  return i18n;
};

const blankRows = (count: number): Item[] =>
  Array.from({ length: count }, () => ({ id: crypto.randomUUID(), text: '' }));

const pickButton = (list: { title: string }) =>
  screen.getByRole('button', { name: en.catalog.use, description: list.title });

// What a row of the draft holds once the id minted for it is set aside.
const contents = () =>
  useListDraft.getState().items.map(({ text, imageUrl }) => ({ text, imageUrl }));
const asFile = (list: { items: { text: string; imageUrl?: string }[] }) =>
  list.items.map(({ text, imageUrl }) => ({ text, imageUrl }));

const typeSearch = (text: string) =>
  userEvent.type(screen.getByRole('searchbox', { name: en.catalog.searchLabel }), text);

beforeEach(() => {
  useListDraft.setState({ screen: 'catalog', items: blankRows(3), criterion: '' });
  announce.mockClear();
});

describe('CatalogScreen', () => {
  it('shows every category with its lists under it', () => {
    renderCatalog();

    for (const category of english) {
      const heading = screen.getByRole('heading', { name: category.name });
      const lists = within(heading.parentElement as HTMLElement).getByRole('list');

      expect(within(lists).getAllByRole('listitem')).toHaveLength(category.lists.length);
      for (const list of category.lists) {
        expect(within(lists).getByText(list.title)).toBeInTheDocument();
      }
    }
  });

  it('puts an icon next to each category name and keeps it out of the name', () => {
    renderCatalog();

    for (const category of english) {
      const heading = screen.getByRole('heading', { name: category.name });
      const icon = within(heading).getByText(iconFor(category.id));

      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });

  // Where a category added later, before anyone draws it an icon, ends up.
  it('has an icon left for a category nobody mapped', () => {
    const icon = iconFor('board-games');

    expect(icon).not.toBe('');
    expect(icon).not.toBe(iconFor(english[0].id));
  });

  it('counts the items and marks the lists that carry images', () => {
    const i18n = renderCatalog();

    const row = screen.getByText(withImages.title).closest('li') as HTMLElement;

    expect(
      within(row).getByText(i18n.t('catalog.itemCount', { count: withImages.items.length })),
    ).toBeInTheDocument();
    expect(within(row).getByText(en.catalog.hasImages)).toBeInTheDocument();
  });

  it('flattens to the matching lists once the box has text', async () => {
    renderCatalog();

    await typeSearch(anyList.title);

    const results = screen.getByRole('list', { name: en.catalog.resultsLabel });
    expect(within(results).getByText(anyList.title)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: english[0].name })).not.toBeInTheDocument();
  });

  it('finds a list by something written inside it', async () => {
    renderCatalog();
    const needle = anyList.items[0].text;
    // Otherwise the title could be what matched and the test proves nothing.
    expect(anyList.title.toLowerCase()).not.toContain(needle.toLowerCase());

    await typeSearch(needle);

    expect(screen.getByText(anyList.title)).toBeInTheDocument();
  });

  it('ignores case and the spaces around the query', async () => {
    renderCatalog();

    await typeSearch(`  ${anyList.title.toUpperCase()} `);

    expect(screen.getByText(anyList.title)).toBeInTheDocument();
  });

  it('finds an accented title typed without the accents', async () => {
    expect(accented).toBeDefined();
    const i18n = renderCatalog();
    await act(() => i18n.changeLanguage('es'));

    await userEvent.type(
      screen.getByRole('searchbox', { name: es.catalog.searchLabel }),
      strip(accented!.title),
    );

    expect(screen.getByText(accented!.title)).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    renderCatalog();

    await typeSearch('qwertyuiop');

    expect(screen.getByText(en.catalog.noResults)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('goes back to the form', async () => {
    renderCatalog();

    await userEvent.click(screen.getByRole('button', { name: en.catalog.back }));

    expect(useListDraft.getState().screen).toBe('list-input');
  });

  it('translates the interface and the catalog together', async () => {
    const i18n = renderCatalog();

    expect(screen.getByRole('heading', { name: english[0].name })).toBeInTheDocument();

    await act(() => i18n.changeLanguage('es'));

    expect(screen.getByText(es.catalog.heading)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: spanish[0].name })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: english[0].name })).not.toBeInTheDocument();
  });

  it('says the language has no lists rather than showing an empty page', () => {
    vi.mocked(loadCatalog).mockReturnValueOnce([]);
    renderCatalog();

    expect(screen.getByText(en.catalog.empty)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('keeps a list with no English file out of the English catalog', async () => {
    expect(spanishOnly).toBeDefined();
    const i18n = renderCatalog();

    expect(screen.queryByText(spanishOnly!.title)).not.toBeInTheDocument();

    await act(() => i18n.changeLanguage('es'));

    expect(screen.getByText(spanishOnly!.title)).toBeInTheDocument();
  });

  it('fills the form with the list it picks, in order and with its images', async () => {
    const i18n = renderCatalog();

    await userEvent.click(pickButton(withImages));

    expect(contents()).toEqual(asFile(withImages));
    expect(useListDraft.getState().screen).toBe('list-input');
    expect(announce).toHaveBeenCalledWith(
      i18n.t('catalog.copied', { count: withImages.items.length, title: withImages.title }),
    );
  });

  it('picks straight away when the draft has nothing written', async () => {
    renderCatalog();

    await userEvent.click(pickButton(anyList));

    expect(screen.queryByText(en.catalog.confirmReplace)).not.toBeInTheDocument();
    expect(useListDraft.getState().screen).toBe('list-input');
  });

  // The criterion is the user's to write, and a title is not one.
  it('leaves the criterion alone', async () => {
    renderCatalog();

    await userEvent.click(pickButton(anyList));

    expect(useListDraft.getState().criterion).toBe('');
  });

  it('asks before replacing rows the user wrote, and keeps them when told to', async () => {
    const written = [{ id: crypto.randomUUID(), text: 'Churros' }, ...blankRows(2)];
    useListDraft.setState({ items: written });
    const i18n = renderCatalog();

    await userEvent.click(pickButton(anyList));

    const prompt = screen.getByRole('group', {
      name: i18n.t('catalog.confirmPrompt', { title: anyList.title }),
    });
    expect(within(prompt).getByRole('button', { name: en.catalog.confirmKeep })).toHaveFocus();

    await userEvent.click(within(prompt).getByRole('button', { name: en.catalog.confirmKeep }));

    expect(useListDraft.getState().items).toEqual(written);
    expect(useListDraft.getState().screen).toBe('catalog');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(pickButton(anyList)).toHaveFocus();
    expect(announce).not.toHaveBeenCalled();
  });

  it('replaces the rows once the prompt is accepted', async () => {
    useListDraft.setState({ items: [{ id: crypto.randomUUID(), text: 'Churros' }] });
    renderCatalog();

    await userEvent.click(pickButton(anyList));
    await userEvent.click(screen.getByRole('button', { name: en.catalog.confirmReplace }));

    expect(contents()).toEqual(asFile(anyList));
    expect(useListDraft.getState().screen).toBe('list-input');
  });

  it('counts an image link on its own as something written', async () => {
    useListDraft.setState({
      items: [{ id: crypto.randomUUID(), text: '', imageUrl: 'https://example.com/a.png' }],
    });
    renderCatalog();

    await userEvent.click(pickButton(anyList));

    expect(screen.getByRole('button', { name: en.catalog.confirmReplace })).toBeInTheDocument();
  });

  // What the user can see of it. The store test is the one that holds the rows
  // to not sharing an object with the catalog.
  it('hands over a copy that editing cannot reach back through', async () => {
    const i18n = renderCatalog();
    await userEvent.click(pickButton(withImages));

    const draft = useListDraft.getState();
    draft.updateItemText(draft.items[0].id, 'Edited');
    draft.updateItemImageUrl(draft.items[1].id, '');
    draft.removeItem(draft.items[2].id);
    draft.setScreen('catalog');

    const row = screen.getByText(withImages.title).closest('li') as HTMLElement;
    expect(
      within(row).getByText(i18n.t('catalog.itemCount', { count: withImages.items.length })),
    ).toBeInTheDocument();

    await userEvent.click(pickButton(withImages));
    await userEvent.click(screen.getByRole('button', { name: en.catalog.confirmReplace }));

    expect(contents()).toEqual(asFile(withImages));
  });

  it('drops an open prompt when the search changes', async () => {
    useListDraft.setState({ items: [{ id: crypto.randomUUID(), text: 'Churros' }] });
    renderCatalog();

    await userEvent.click(pickButton(anyList));
    await typeSearch(anyList.title);

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});
