// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { useSound } from '../state/soundStore.ts';
import { MuteButton } from './MuteButton.tsx';

const renderButton = () => {
  const i18n = createI18n();
  render(
    <I18nextProvider i18n={i18n}>
      <MuteButton />
    </I18nextProvider>,
  );
  return i18n;
};

beforeEach(() => {
  sessionStorage.clear();
  useSound.setState({ muted: false });
});

describe('MuteButton', () => {
  it('starts with the sound on and toggles it', async () => {
    renderButton();

    const button = screen.getByRole('button', { name: 'Mute sounds' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(useSound.getState().muted).toBe(true);

    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(useSound.getState().muted).toBe(false);
  });

  it('keeps its name and its state across a language switch', async () => {
    const i18n = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Mute sounds' }));
    await act(() => i18n.changeLanguage('es'));

    expect(screen.getByRole('button', { name: 'Silenciar sonidos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // A reload starts every module from scratch, and the only thing left over
  // from before it is what the tab kept.
  it('is still muted after a reload in the same tab', async () => {
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Mute sounds' }));
    vi.resetModules();
    const reloaded = await import('../state/soundStore.ts');

    expect(reloaded.useSound.getState().muted).toBe(true);
  });
});
