// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import App from '../App.tsx';
import type { Item, PlacementState } from '../core/types.ts';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import { es } from '../i18n/locales/es.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import { usePlacement } from '../state/placementStore.ts';

const confetti = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));

vi.mock('canvas-confetti', () => ({ default: confetti }));

const items: Item[] = ['Sushi', 'Ramen', 'Curry', 'Tacos', 'Pizza'].map((text) => ({
  id: text.toLowerCase(),
  text,
}));

// Finished by hand rather than sorted through the screen: Curry and Tacos
// share second place.
const finished: PlacementState = {
  shuffledOrder: ['ramen', 'sushi', 'curry', 'tacos', 'pizza'],
  rankedSlots: [
    { itemIds: ['sushi'] },
    { itemIds: ['curry', 'tacos'] },
    { itemIds: ['ramen'] },
    { itemIds: ['pizza'] },
  ],
  pendingPool: [],
};

const draft = {
  criterion: 'Which one do you like more?',
  items: [...items, { id: 'blank', text: '' }],
};

const renderApp = () =>
  render(
    <I18nextProvider i18n={createI18n()}>
      <App />
    </I18nextProvider>,
  );

const positions = () => within(screen.getByRole('list')).getAllByRole('listitem');

// A row per item, each one its number and then its card.
const rows = () =>
  positions().map((position) =>
    [...position.querySelectorAll(':scope > div')].map(
      (row) => `${row.firstElementChild?.textContent} ${row.lastElementChild?.textContent}`,
    ),
  );

beforeEach(() => {
  confetti.mockClear();
  confetti.reset.mockClear();
  useListDraft.setState({ screen: 'result', ...draft });
  usePlacement.setState({ items, criterion: draft.criterion, placement: finished });
});

describe('ResultScreen', () => {
  it('lists the items from favourite to least favourite, a tie as one card', () => {
    renderApp();

    expect(rows()).toEqual([['1 Sushi'], ['2 Curry', '2 Tacos'], ['4 Ramen'], ['5 Pizza']]);
  });

  it('labels the tied card and only that one', () => {
    renderApp();

    const [first, second, third] = positions();

    expect(second).toHaveTextContent(en.result.tied);
    expect(first).not.toHaveTextContent(en.result.tied);
    expect(third).not.toHaveTextContent(en.result.tied);
  });

  it('shows no tie label when nothing is tied', () => {
    usePlacement.setState({
      placement: {
        ...finished,
        rankedSlots: finished.shuffledOrder.map((id) => ({ itemIds: [id] })),
      },
    });
    renderApp();

    expect(rows()).toEqual([['1 Ramen'], ['2 Sushi'], ['3 Curry'], ['4 Tacos'], ['5 Pizza']]);
    expect(screen.queryByText(en.result.tied)).not.toBeInTheDocument();
  });

  it('asks the criterion as the heading and starts there', () => {
    renderApp();

    const heading = screen.getByRole('heading', { name: draft.criterion });

    expect(heading).toHaveFocus();
  });

  it('celebrates once, leaving reduced motion to the library', () => {
    renderApp();

    expect(confetti).toHaveBeenCalledTimes(1);
    expect(confetti).toHaveBeenCalledWith(
      expect.objectContaining({ disableForReducedMotion: true }),
    );
  });

  it('stops a burst still falling once the screen is left', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: en.result.newList }));

    expect(confetti.reset).toHaveBeenCalled();
  });

  it('sorts the same items again from a fresh start', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: en.result.sortAgain }));

    const { placement, items: sorting, criterion } = usePlacement.getState();
    expect(useListDraft.getState().screen).toBe('sorting');
    expect(sorting).toEqual(items);
    expect(criterion).toBe(draft.criterion);
    expect(placement?.rankedSlots).toHaveLength(1);
    expect(placement?.pendingPool).toHaveLength(4);
    expect(screen.getByText('1 of 5 placed')).toBeInTheDocument();
  });

  it('goes back to the form with the draft as it was', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: en.result.newList }));

    expect(useListDraft.getState().screen).toBe('list-input');
    expect(screen.getByRole('textbox', { name: 'Item 1' })).toHaveValue('Sushi');
    expect(screen.getByRole('textbox', { name: 'Item 6' })).toHaveValue('');
    expect(screen.getByDisplayValue(draft.criterion)).toBeInTheDocument();
  });

  it('switches its strings with the language', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: 'Spanish' }));

    expect(screen.getByText(es.result.title)).toBeInTheDocument();
    expect(screen.getByText(es.result.tied)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: es.result.sortAgain })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: es.result.newList })).toBeInTheDocument();
  });
});
