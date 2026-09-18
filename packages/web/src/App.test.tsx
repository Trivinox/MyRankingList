// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from './i18n/index.ts';
import { en } from './i18n/locales/en.ts';
import { es } from './i18n/locales/es.ts';
import App from './App.tsx';

const renderApp = () =>
  render(
    <I18nextProvider i18n={createI18n()}>
      <App />
    </I18nextProvider>,
  );

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
});
