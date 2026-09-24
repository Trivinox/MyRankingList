// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import type { Participant } from '../room/hostRoom.ts';
import { leaveRoom } from '../room/session.ts';
import { useRoom } from '../state/roomStore.ts';
import type { Role } from '../state/roomStore.ts';
import { useScreen } from '../state/screenStore.ts';
import { LobbyScreen } from './LobbyScreen.tsx';

vi.mock('../room/session.ts', () => ({ leaveRoom: vi.fn() }));

const ana: Participant = { id: 'a', nickname: 'Ana', isCreator: true };
const juan: Participant = { id: 'j', nickname: 'Juan', isCreator: false };
const lucia: Participant = { id: 'l', nickname: 'Lucía', isCreator: false };

const renderLobby = () => {
  const i18n = createI18n();
  render(
    <I18nextProvider i18n={i18n}>
      <LobbyScreen />
    </I18nextProvider>,
  );
  return i18n;
};

function inRoom(role: Role, you: string, participants = [ana, juan]) {
  useRoom.setState({
    role,
    code: 'AB3K',
    you,
    participants,
    criterion: 'Best noodle',
    status: 'lobby',
    error: null,
  });
}

const row = (nickname: string) => screen.getByText(nickname, { exact: true }).closest('li')!;
const announcer = () => document.querySelector('[data-announcer]')!;

beforeEach(() => {
  vi.mocked(leaveRoom).mockReset();
  useScreen.setState({ screen: 'lobby' });
  window.history.replaceState(null, '', '/');
});

describe('LobbyScreen', () => {
  it('shows the code, what the room compares and who is in it', () => {
    inRoom('guest', 'j');
    const i18n = renderLobby();

    expect(screen.getByText('AB3K')).toBeInTheDocument();
    expect(screen.getByText('Best noodle')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByText(i18n.t('room.lobby.count', { count: 2, limit: 20 })),
    ).toBeInTheDocument();
  });

  it('marks the creator and the user, each on their own row', () => {
    inRoom('guest', 'j');
    renderLobby();

    expect(within(row('Ana')).getByText(en.room.lobby.creator)).toBeInTheDocument();
    expect(within(row('Ana')).queryByText(en.room.lobby.you)).not.toBeInTheDocument();
    expect(within(row('Juan')).getByText(en.room.lobby.you)).toBeInTheDocument();
    expect(within(row('Juan')).queryByText(en.room.lobby.creator)).not.toBeInTheDocument();
  });

  it('keeps the count and the rows in step with the room, and says who came and went', () => {
    inRoom('host', 'a');
    const i18n = renderLobby();

    act(() => useRoom.getState().setParticipants([ana, juan, lucia]));
    expect(
      screen.getByText(i18n.t('room.lobby.count', { count: 3, limit: 20 })),
    ).toBeInTheDocument();
    expect(announcer()).toHaveTextContent(i18n.t('room.lobby.joined', { nickname: 'Lucía' }));

    act(() => useRoom.getState().setParticipants([ana, lucia]));
    expect(screen.queryByText('Juan', { exact: true })).not.toBeInTheDocument();
    expect(
      screen.getByText(i18n.t('room.lobby.count', { count: 2, limit: 20 })),
    ).toBeInTheDocument();
  });

  it('copies the link to the room', async () => {
    const user = userEvent.setup();
    inRoom('host', 'a');
    renderLobby();

    await user.click(screen.getByRole('button', { name: en.room.lobby.copyLink }));

    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/?room=AB3K`);
    expect(screen.getByText(en.room.lobby.copied)).toBeInTheDocument();
  });

  describe('as a guest', () => {
    it('leaves without asking, and drops the code from the address', async () => {
      window.history.replaceState(null, '', '/?room=AB3K');
      inRoom('guest', 'j');
      renderLobby();

      await userEvent.click(screen.getByRole('button', { name: en.room.lobby.leave }));

      expect(leaveRoom).toHaveBeenCalled();
      expect(window.location.search).toBe('');
      expect(useScreen.getState().screen).toBe('list-input');
    });

    it('is told when the room closes under them and can go back to the form', async () => {
      window.history.replaceState(null, '', '/?room=AB3K');
      inRoom('guest', 'j');
      renderLobby();

      act(() => useRoom.getState().close());

      expect(screen.getByRole('alert')).toHaveTextContent(en.room.lobby.closed);
      await userEvent.click(screen.getByRole('button', { name: en.room.back }));
      expect(leaveRoom).toHaveBeenCalled();
      expect(window.location.search).toBe('');
      expect(useScreen.getState().screen).toBe('list-input');
    });
  });

  describe('as the host', () => {
    it('asks before closing the room, and staying keeps it open', async () => {
      inRoom('host', 'a');
      renderLobby();

      await userEvent.click(screen.getByRole('button', { name: en.room.lobby.close }));
      expect(screen.getByText(en.room.lobby.confirmClose)).toBeInTheDocument();
      expect(leaveRoom).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: en.room.lobby.confirmNo }));
      expect(screen.queryByText(en.room.lobby.confirmClose)).not.toBeInTheDocument();
      expect(leaveRoom).not.toHaveBeenCalled();
      expect(useScreen.getState().screen).toBe('lobby');
    });

    it('closes the room once confirmed', async () => {
      inRoom('host', 'a');
      renderLobby();

      await userEvent.click(screen.getByRole('button', { name: en.room.lobby.close }));
      await userEvent.click(screen.getByRole('button', { name: en.room.lobby.confirmYes }));

      expect(leaveRoom).toHaveBeenCalled();
      expect(useScreen.getState().screen).toBe('list-input');
    });
  });
});
