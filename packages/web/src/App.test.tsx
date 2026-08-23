// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('swaps the visible strings when switching to Spanish and back', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: 'Spanish' }));

    expect(screen.getByText(es.app.tagline)).toBeInTheDocument();
    expect(screen.queryByText(en.app.tagline)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Inglés' }));

    expect(screen.getByText(en.app.tagline)).toBeInTheDocument();
    expect(screen.queryByText(es.app.tagline)).not.toBeInTheDocument();
  });
});
