// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import { CloseRoom } from './CloseRoom.tsx';

const renderClose = () => {
  const onClose = vi.fn();
  render(
    <I18nextProvider i18n={createI18n()}>
      <CloseRoom onClose={onClose} />
    </I18nextProvider>,
  );
  return onClose;
};

describe('CloseRoom', () => {
  it('leaves the focus alone until it is used', () => {
    renderClose();

    expect(screen.getByRole('button', { name: en.room.lobby.close })).not.toHaveFocus();
  });

  it('asks first, with the focus on staying', async () => {
    const onClose = renderClose();

    await userEvent.click(screen.getByRole('button', { name: en.room.lobby.close }));

    expect(screen.getByRole('group', { name: en.room.lobby.confirmClose })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.room.lobby.confirmNo })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes nothing on Stay, and hands the focus back to its button', async () => {
    const onClose = renderClose();

    await userEvent.click(screen.getByRole('button', { name: en.room.lobby.close }));
    await userEvent.click(screen.getByRole('button', { name: en.room.lobby.confirmNo }));

    expect(screen.queryByText(en.room.lobby.confirmClose)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.room.lobby.close })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the room once confirmed', async () => {
    const onClose = renderClose();

    await userEvent.click(screen.getByRole('button', { name: en.room.lobby.close }));
    await userEvent.click(screen.getByRole('button', { name: en.room.lobby.confirmYes }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
