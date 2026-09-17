// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { usePlacement } from '../state/placementStore.ts';
import { SortingScreen } from './SortingScreen.tsx';

// A file of its own because Framer Motion reads the OS setting once and keeps
// the answer for every test after. Here it is on from the very first render.
beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;

  usePlacement.getState().start(
    ['Sushi', 'Ramen', 'Curry'].map((text) => ({ id: text.toLowerCase(), text })),
    'Which one do you like more?',
  );
});

describe('with reduced motion on', () => {
  it('places the item without a burst', async () => {
    render(
      <I18nextProvider i18n={createI18n()}>
        <SortingScreen />
      </I18nextProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Put it at position 1' }));

    expect(screen.getByText('2 of 3 placed')).toBeInTheDocument();
    expect(document.querySelector('[data-burst]')).toBeNull();
  });
});
