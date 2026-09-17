// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { Item } from '../core/types.ts';
import { createI18n } from '../i18n/index.ts';
import { usePlacement } from '../state/placementStore.ts';
import { SortingScreen } from './SortingScreen.tsx';

const items: Item[] = ['Sushi', 'Ramen', 'Curry', 'Tacos'].map((text) => ({
  id: text.toLowerCase(),
  text,
}));

const textOf = (id: string) => items.find((item) => item.id === id)?.text ?? id;

const shuffled = () => {
  const { placement } = usePlacement.getState();
  if (!placement) {
    throw new Error('The placement store was never started');
  }
  return placement.shuffledOrder;
};

// jsdom lays nothing out, so where the rocket ends up cannot be measured. The
// share of the track it has covered is what the stylesheet positions it from.
const bar = () => screen.getByRole('progressbar');
const covered = () => Number(bar().style.getPropertyValue('--progress'));

const gap = (position: number) =>
  screen.getByRole('button', { name: `Put it at position ${position}` });

const renderScreen = () => {
  const i18n = createI18n();
  render(
    <I18nextProvider i18n={i18n}>
      <SortingScreen />
    </I18nextProvider>,
  );
  return i18n;
};

beforeEach(() => {
  usePlacement.getState().start(items, 'Which one do you like more?');
});

describe('ProgressBar', () => {
  it('opens one item in, with the rocket a quarter of the way', () => {
    renderScreen();

    expect(bar()).toHaveAttribute('aria-valuenow', '1');
    expect(covered()).toBe(0.25);
  });

  it('keeps the rocket and the flag away from screen readers', () => {
    renderScreen();

    // The flag sits beside the track rather than on it.
    const icons = bar().parentElement?.querySelectorAll('svg') ?? [];

    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('moves one step for each item placed', async () => {
    renderScreen();

    await userEvent.click(gap(1));
    expect(bar()).toHaveAttribute('aria-valuenow', '2');
    expect(covered()).toBe(0.5);

    await userEvent.click(gap(3));
    expect(bar()).toHaveAttribute('aria-valuenow', '3');
    expect(covered()).toBe(0.75);
  });

  it('stays put when a placement is refused', async () => {
    const [a, , c] = shuffled();
    act(() => {
      const { drop } = usePlacement.getState();
      drop({ from: 'pool' }, { kind: 'gap', index: 1 });
      drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    });
    renderScreen();

    await userEvent.click(
      screen.getByRole('button', { name: `Tie it with ${textOf(a)} and ${textOf(c)}` }),
    );

    expect(bar()).toHaveAttribute('aria-valuenow', '3');
    expect(covered()).toBe(0.75);
  });

  it('stays put when an item already in the list is moved', async () => {
    const [a] = shuffled();
    act(() => {
      usePlacement.getState().drop({ from: 'pool' }, { kind: 'gap', index: 1 });
    });
    renderScreen();

    await userEvent.click(screen.getByRole('button', { name: `Move ${textOf(a)}` }));
    await userEvent.click(gap(3));

    expect(bar()).toHaveAttribute('aria-valuenow', '2');
    expect(covered()).toBe(0.5);
  });

  it('counts a tie as a step, the same as an insertion', async () => {
    const [a] = shuffled();
    renderScreen();

    await userEvent.click(screen.getByText(textOf(a)));

    expect(bar()).toHaveAttribute('aria-valuenow', '2');
    expect(covered()).toBe(0.5);
  });

  it('reaches the flag with the last item', async () => {
    renderScreen();

    await userEvent.click(gap(1));
    await userEvent.click(gap(1));
    await userEvent.click(gap(1));

    expect(bar()).toHaveAttribute('aria-valuenow', '4');
    expect(bar()).toHaveAttribute('aria-valuetext', '4 of 4 placed');
    expect(covered()).toBe(1);
  });

  it('reads the count in the language picked', async () => {
    const i18n = renderScreen();

    await act(() => i18n.changeLanguage('es'));

    expect(bar()).toHaveAttribute('aria-valuetext', '1 de 4 colocados');
    expect(screen.getByText('1 de 4 colocados')).toBeInTheDocument();
  });
});
