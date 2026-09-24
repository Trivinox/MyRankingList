// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from './i18n/index.ts';
import { en } from './i18n/locales/en.ts';
import { es } from './i18n/locales/es.ts';
import { loadCatalog } from './catalog/catalog.ts';
import { createRoom } from './room/session.ts';
import { useListDraft } from './state/listDraftStore.ts';
import { useRoom } from './state/roomStore.ts';
import { useScreen } from './state/screenStore.ts';
import App from './App.tsx';

// Only the room flow reaches it, and the session has a suite of its own.
vi.mock('./room/session.ts', () => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
}));

const renderApp = () =>
  render(
    <I18nextProvider i18n={createI18n()}>
      <App />
    </I18nextProvider>,
  );

// The stores outlive each render. The flows below leave rows written, which
// would put the next test past a first visit, and a room open.
beforeEach(() => {
  useScreen.setState({ screen: 'list-input' });
  useRoom.getState().leave();
  useListDraft.setState({
    items: Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), text: '' })),
    criterion: '',
  });
});

describe('App', () => {
  it('starts in English', () => {
    renderApp();

    expect(screen.getByText(en.app.tagline)).toBeInTheDocument();
  });

  // Nothing has been sorted yet, so this is a first visit and not a return.
  it('leaves the focus alone on arrival', () => {
    renderApp();

    expect(document.activeElement).toBe(document.body);
  });

  it('swaps the visible strings when switching to Spanish and back', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: 'Spanish' }));

    expect(screen.getByText(es.app.tagline)).toBeInTheDocument();
    expect(screen.queryByText(en.app.tagline)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Inglés' }));

    expect(screen.getByText(en.app.tagline)).toBeInTheDocument();
    expect(screen.queryByText(es.app.tagline)).not.toBeInTheDocument();
  });

  // The shuffle decides the order, so the result is held to whatever the
  // sorting list showed last rather than to a fixed one.
  it('goes from the form through sorting to the result and back to the form', async () => {
    renderApp();

    await userEvent.type(screen.getByLabelText(en.form.criterionLabel), 'Best noodle');
    for (const [number, text] of ['Udon', 'Soba', 'Ramen'].entries()) {
      await userEvent.type(screen.getByRole('textbox', { name: `Item ${number + 1}` }), text);
    }
    await userEvent.click(screen.getByRole('button', { name: en.form.continue }));

    await userEvent.click(screen.getByRole('button', { name: 'Put it at position 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Put it at position 1' }));
    const sorted = within(screen.getByRole('list')).getAllByText(/^(Udon|Soba|Ramen)$/);
    const order = sorted.map((node) => node.textContent);

    await userEvent.click(screen.getByRole('button', { name: en.sorting.seeResult }));

    expect(screen.getByRole('heading', { name: 'Best noodle' })).toHaveFocus();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(screen.getByRole('list'))
        .getAllByText(/^(Udon|Soba|Ramen)$/)
        .map((node) => node.textContent),
    ).toEqual(order);

    await userEvent.click(screen.getByRole('button', { name: en.result.newList }));

    expect(screen.getByLabelText(en.form.criterionLabel)).toHaveValue('Best noodle');
    expect(screen.getByRole('textbox', { name: 'Item 3' })).toHaveValue('Ramen');
  });

  // Read out of the catalog rather than named, so rewriting the content does
  // not rewrite the test. A list with images, so the links are checked too.
  it('goes from the form to the catalog and back with a list to sort', async () => {
    const list = loadCatalog('en')
      .flatMap((category) => category.lists)
      .find((candidate) => candidate.items.some((item) => item.imageUrl))!;
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: en.catalog.browse }));
    await userEvent.click(
      screen.getByRole('button', { name: en.catalog.use, description: list.title }),
    );

    const criterion = screen.getByLabelText(en.form.criterionLabel);
    expect(criterion).toHaveFocus();
    expect(criterion).toHaveValue('');
    expect(screen.getByRole('button', { name: en.form.continue })).toBeDisabled();
    for (const [index, item] of list.items.entries()) {
      expect(screen.getByRole('textbox', { name: `Item ${index + 1}` })).toHaveValue(item.text);
      expect(screen.getByRole('textbox', { name: `Image URL for item ${index + 1}` })).toHaveValue(
        item.imageUrl ?? '',
      );
    }
    expect(screen.getByRole('status')).toHaveTextContent(list.title);

    await userEvent.type(criterion, 'Which one first?');
    await userEvent.click(screen.getByRole('button', { name: en.form.continue }));

    // The sorting screen's own region is the only one of ours left, next to the
    // one dnd-kit always adds, and neither has heard about the copy.
    expect(document.querySelectorAll('[data-announcer]')).toHaveLength(1);
    for (const region of screen.getAllByRole('status')) {
      expect(region).not.toHaveTextContent(list.title);
    }

    for (let placed = 1; placed < list.items.length; placed++) {
      await userEvent.click(screen.getByRole('button', { name: 'Put it at position 1' }));
    }
    await userEvent.click(screen.getByRole('button', { name: en.sorting.seeResult }));

    expect(screen.getByRole('heading', { name: 'Which one first?' })).toHaveFocus();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(
      list.items.length,
    );

    await userEvent.click(screen.getByRole('button', { name: en.result.newList }));

    expect(screen.getByRole('status')).toHaveTextContent(/^$/);
  });

  it('goes from the form to a room of its own', async () => {
    vi.mocked(createRoom).mockImplementation(async (nickname, items, criterion) => {
      useRoom.getState().enterLobby({
        code: 'AB3K',
        you: 'a',
        criterion,
        participants: [{ id: 'a', nickname, isCreator: true, progress: 0 }],
        items,
      });
    });
    renderApp();

    await userEvent.type(screen.getByLabelText(en.form.criterionLabel), 'Best noodle');
    for (const [number, text] of ['Udon', 'Soba', 'Ramen'].entries()) {
      await userEvent.type(screen.getByRole('textbox', { name: `Item ${number + 1}` }), text);
    }
    await userEvent.click(screen.getByRole('button', { name: en.room.create }));
    await userEvent.type(screen.getByLabelText(en.room.nicknameLabel), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: en.room.open }));

    expect(screen.getByText('AB3K')).toBeInTheDocument();
    expect(screen.getByText('Best noodle')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getByText('Ana')).toBeInTheDocument();
    expect(useRoom.getState().items.map((item) => item.text)).toEqual(['Udon', 'Soba', 'Ramen']);
  });

  it('opens the join screen for someone with no list to write', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: en.room.join }));

    expect(screen.getByRole('heading', { name: en.room.joinHeading })).toBeInTheDocument();
    expect(screen.getByLabelText(en.room.codeLabel)).toHaveFocus();
  });
});
