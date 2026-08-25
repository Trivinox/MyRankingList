// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { Item } from '../core/types.ts';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import { usePlacement } from '../state/placementStore.ts';
import App from '../App.tsx';
import { SortingScreen } from './SortingScreen.tsx';

const items: Item[] = ['Sushi', 'Ramen', 'Curry', 'Tacos'].map((text) => ({
  id: text.toLowerCase(),
  text,
}));

// The store draws its own shuffle, so which item opens the list is not known
// until it has. Every assertion below reads the placement back instead of
// naming an item up front.
const started = () => {
  const { placement } = usePlacement.getState();
  if (!placement) {
    throw new Error('The placement store was never started');
  }
  return placement;
};

const textOf = (id: string) => items.find((item) => item.id === id)?.text ?? id;

const renderScreen = () =>
  render(
    <I18nextProvider i18n={createI18n()}>
      <SortingScreen />
    </I18nextProvider>,
  );

beforeEach(() => {
  usePlacement.setState({ items: [], criterion: '', placement: null });
  useListDraft.setState({ screen: 'list-input' });
});

describe('SortingScreen', () => {
  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
  });

  it('opens with one item already in the list', () => {
    renderScreen();

    const [opener] = started().rankedSlots[0].itemIds;

    expect(screen.getByRole('list')).toHaveTextContent(textOf(opener));
  });

  it('shows the item at the head of the pool', () => {
    renderScreen();

    const [next] = started().pendingPool;

    expect(screen.getByText(textOf(next))).toBeInTheDocument();
  });

  it('keeps the rest of the pool off the screen', () => {
    renderScreen();

    const waiting = started().pendingPool.slice(1);
    expect(waiting).toHaveLength(2);

    for (const id of waiting) {
      expect(screen.queryByText(textOf(id))).not.toBeInTheDocument();
    }
  });

  it('asks the criterion as the screen question', () => {
    renderScreen();

    expect(
      screen.getByRole('heading', { name: 'Which one do you like more?' }),
    ).toBeInTheDocument();
  });

  it('opens the progress at the item the list started with', () => {
    renderScreen();

    const bar = screen.getByRole('progressbar');

    expect(bar).toHaveAttribute('aria-valuenow', '1');
    // Counted from zero, or the percentage announced and the width of the fill
    // tell two different stories until the last item lands.
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(screen.getByText('1 of 4 placed')).toBeInTheDocument();
  });
});

describe('continuing from the form', () => {
  it('carries only the filled rows onto the sorting screen', async () => {
    useListDraft.setState({
      screen: 'list-input',
      criterion: 'Best noodle',
      items: [
        { id: 'a', text: 'Sushi' },
        { id: 'b', text: '' },
        { id: 'c', text: 'Ramen' },
        { id: 'd', text: '  ' },
        { id: 'e', text: 'Curry' },
      ],
    });

    render(
      <I18nextProvider i18n={createI18n()}>
        <App />
      </I18nextProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: en.form.continue }));

    expect(useListDraft.getState().screen).toBe('sorting');
    expect(usePlacement.getState().items.map((item) => item.text)).toEqual([
      'Sushi',
      'Ramen',
      'Curry',
    ]);
    expect(screen.getByRole('heading', { name: 'Best noodle' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3');
  });
});
