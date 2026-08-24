// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { LanguageSelector } from './LanguageSelector.tsx';

const renderSelector = () => {
  const i18n = createI18n();
  render(
    <I18nextProvider i18n={i18n}>
      <LanguageSelector />
    </I18nextProvider>,
  );
  return i18n;
};

describe('LanguageSelector', () => {
  it('offers one button per supported language', () => {
    renderSelector();

    expect(screen.getByRole('button', { name: 'English' })).toHaveTextContent('EN');
    expect(screen.getByRole('button', { name: 'Spanish' })).toHaveTextContent('ES');
  });

  it('marks English as the active language on first render', () => {
    renderSelector();

    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Spanish' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('changes the language and moves the active mark when another one is picked', async () => {
    const i18n = renderSelector();

    await userEvent.click(screen.getByRole('button', { name: 'Spanish' }));

    expect(i18n.language).toBe('es');
    expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('translates its own labels once the language changes', async () => {
    renderSelector();

    await userEvent.click(screen.getByRole('button', { name: 'Spanish' }));

    expect(screen.getByRole('group', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inglés' })).toBeInTheDocument();
  });

  it('keeps the document language in step with the choice', async () => {
    renderSelector();

    expect(document.documentElement.lang).toBe('en');

    await userEvent.click(screen.getByRole('button', { name: 'Spanish' }));
    expect(document.documentElement.lang).toBe('es');

    await userEvent.click(screen.getByRole('button', { name: 'Inglés' }));
    expect(document.documentElement.lang).toBe('en');
  });
});
