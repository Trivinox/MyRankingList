// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import type { Participant } from '../room/hostRoom.ts';
import { leaveRoom, removeParticipant, startRoom } from '../room/session.ts';
import { useRoom } from '../state/roomStore.ts';
import type { Role } from '../state/roomStore.ts';
import { useScreen } from '../state/screenStore.ts';
import { LobbyScreen } from './LobbyScreen.tsx';

vi.mock('../room/session.ts', () => ({
  leaveRoom: vi.fn(),
  removeParticipant: vi.fn(),
  startRoom: vi.fn(),
}));

const ana: Participant = { id: 'a', nickname: 'Ana', isCreator: true, progress: 0 };
const juan: Participant = { id: 'j', nickname: 'Juan', isCreator: false, progress: 0 };
const lucia: Participant = { id: 'l', nickname: 'Lucía', isCreator: false, progress: 0 };

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
  vi.mocked(startRoom).mockReset();
  vi.mocked(removeParticipant).mockReset();
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

    it('is told the creator removed them and can go back to the form', async () => {
      window.history.replaceState(null, '', '/?room=AB3K');
      inRoom('guest', 'j');
      renderLobby();

      act(() => useRoom.getState().remove());

      expect(screen.getByRole('alert')).toHaveTextContent(en.room.lobby.removed);
      await userEvent.click(screen.getByRole('button', { name: en.room.back }));
      expect(leaveRoom).toHaveBeenCalled();
      expect(window.location.search).toBe('');
      expect(useScreen.getState().screen).toBe('list-input');
    });

    it('cannot remove anyone', () => {
      inRoom('guest', 'j', [ana, juan, lucia]);
      const i18n = renderLobby();

      for (const { nickname } of [ana, lucia]) {
        expect(
          screen.queryByRole('button', { name: i18n.t('room.remove.label', { nickname }) }),
        ).not.toBeInTheDocument();
      }
    });

    it('waits for the creator, with no way to start the room', () => {
      inRoom('guest', 'j');
      renderLobby();

      expect(screen.getByText(en.room.lobby.waiting)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: en.room.lobby.start })).not.toBeInTheDocument();
    });
  });

  it('moves to the sorting screen once the room starts', () => {
    inRoom('guest', 'j');
    renderLobby();

    act(() => useRoom.getState().startSorting([]));

    expect(useScreen.getState().screen).toBe('sorting');
  });

  describe('as the host', () => {
    it('cannot start alone, and is told why', () => {
      inRoom('host', 'a', [ana]);
      renderLobby();

      const start = screen.getByRole('button', { name: en.room.lobby.start });
      expect(start).toBeDisabled();
      expect(start).toHaveAccessibleDescription(en.room.lobby.needsSomeone);
      expect(screen.queryByText(en.room.lobby.waiting)).not.toBeInTheDocument();
    });

    it('starts the room once someone else is in', async () => {
      inRoom('host', 'a', [ana]);
      renderLobby();

      act(() => useRoom.getState().setParticipants([ana, juan]));
      const start = screen.getByRole('button', { name: en.room.lobby.start });
      expect(start).toBeEnabled();
      expect(screen.queryByText(en.room.lobby.needsSomeone)).not.toBeInTheDocument();

      await userEvent.click(start);
      expect(startRoom).toHaveBeenCalled();
    });

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

    it('can remove everyone but themselves', () => {
      inRoom('host', 'a', [ana, juan, lucia]);
      const i18n = renderLobby();

      const label = (nickname: string) => i18n.t('room.remove.label', { nickname });
      expect(within(row('Juan')).getByRole('button', { name: label('Juan') })).toBeInTheDocument();
      expect(
        within(row('Lucía')).getByRole('button', { name: label('Lucía') }),
      ).toBeInTheDocument();
      expect(within(row('Ana')).queryByRole('button')).not.toBeInTheDocument();
    });

    it('asks before removing someone, and cancelling removes nobody', async () => {
      inRoom('host', 'a');
      const i18n = renderLobby();
      const remove = screen.getByRole('button', {
        name: i18n.t('room.remove.label', { nickname: 'Juan' }),
      });

      await userEvent.click(remove);
      const prompt = screen.getByRole('group', {
        name: i18n.t('room.remove.confirm', { nickname: 'Juan' }),
      });
      expect(within(prompt).getByRole('button', { name: en.room.remove.no })).toHaveFocus();

      await userEvent.click(within(prompt).getByRole('button', { name: en.room.remove.no }));
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
      expect(remove).toHaveFocus();
      expect(removeParticipant).not.toHaveBeenCalled();
    });

    it('removes someone once confirmed', async () => {
      inRoom('host', 'a');
      const i18n = renderLobby();

      await userEvent.click(
        screen.getByRole('button', { name: i18n.t('room.remove.label', { nickname: 'Juan' }) }),
      );
      await userEvent.click(screen.getByRole('button', { name: en.room.remove.yes }));

      expect(removeParticipant).toHaveBeenCalledWith('j');
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
    });

    it('drops the question when the person leaves before the answer', async () => {
      inRoom('host', 'a');
      const i18n = renderLobby();

      await userEvent.click(
        screen.getByRole('button', { name: i18n.t('room.remove.label', { nickname: 'Juan' }) }),
      );
      act(() => useRoom.getState().setParticipants([ana]));

      expect(screen.queryByRole('group')).not.toBeInTheDocument();
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
