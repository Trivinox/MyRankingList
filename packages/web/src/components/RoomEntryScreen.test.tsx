// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import { createRoom, joinRoom, leaveRoom } from '../room/session.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import { useRoom } from '../state/roomStore.ts';
import type { RoomError } from '../state/roomStore.ts';
import { useScreen } from '../state/screenStore.ts';
import { RoomEntryScreen } from './RoomEntryScreen.tsx';

// The session is peerjs and the network. The E2E runs it for real; here the
// store is moved by hand to whatever the session would have written.
vi.mock('../room/session.ts', () => ({
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
}));

const renderEntry = (mode: 'create' | 'join') => {
  const i18n = createI18n();
  render(
    <I18nextProvider i18n={i18n}>
      <RoomEntryScreen mode={mode} />
    </I18nextProvider>,
  );
  return i18n;
};

const nicknameField = () => screen.getByLabelText(en.room.nicknameLabel);
const codeField = () => screen.getByLabelText(en.room.codeLabel);

async function tryToJoin(code: string, nickname = 'Juan') {
  await userEvent.type(codeField(), code);
  await userEvent.type(nicknameField(), nickname);
  await userEvent.click(screen.getByRole('button', { name: en.room.enter }));
}

// What the session writes when an attempt fails.
const failWith = (error: RoomError) => async () => {
  useRoom.getState().connect('guest');
  useRoom.getState().fail(error);
};

beforeEach(() => {
  vi.mocked(createRoom).mockReset();
  vi.mocked(joinRoom).mockReset();
  vi.mocked(leaveRoom).mockReset();
  useRoom.getState().leave();
  useScreen.setState({ screen: 'room-join' });
  window.history.replaceState(null, '', '/');
});

describe('RoomEntryScreen', () => {
  it('asks the creator only for a nickname', () => {
    renderEntry('create');

    expect(nicknameField()).toBeInTheDocument();
    expect(screen.queryByLabelText(en.room.codeLabel)).not.toBeInTheDocument();
  });

  it('asks a guest for the code as well', () => {
    renderEntry('join');

    expect(codeField()).toBeInTheDocument();
    expect(nicknameField()).toBeInTheDocument();
  });

  it('cannot be sent without a nickname, or with one of only spaces', async () => {
    renderEntry('create');
    const open = screen.getByRole('button', { name: en.room.open });

    expect(open).toBeDisabled();
    await userEvent.type(nicknameField(), '   ');
    expect(open).toBeDisabled();
    await userEvent.type(nicknameField(), 'Ana');
    expect(open).toBeEnabled();
  });

  it('stops the nickname at 20 characters', async () => {
    renderEntry('create');

    await userEvent.type(nicknameField(), 'x'.repeat(26));

    expect(nicknameField()).toHaveValue('x'.repeat(20));
  });

  it('opens the room with the filled rows and the criterion, trimmed', async () => {
    useListDraft.setState({
      criterion: '  Best noodle ',
      items: [
        { id: 'a', text: 'Udon' },
        { id: 'b', text: '  ' },
        { id: 'c', text: 'Soba' },
        { id: 'd', text: 'Ramen' },
      ],
    });
    renderEntry('create');

    await userEvent.type(nicknameField(), ' Ana ');
    await userEvent.click(screen.getByRole('button', { name: en.room.open }));

    expect(createRoom).toHaveBeenCalledWith(
      'Ana',
      [
        { id: 'a', text: 'Udon' },
        { id: 'c', text: 'Soba' },
        { id: 'd', text: 'Ramen' },
      ],
      'Best noodle',
    );
  });

  it('turns away a code no room can have without asking the server', async () => {
    renderEntry('join');

    await tryToJoin('AB0K');

    expect(screen.getByText(en.room.codeInvalid)).toBeInTheDocument();
    expect(codeField()).toHaveAttribute('aria-invalid', 'true');
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('looks up a code typed in lowercase, with spaces around it', async () => {
    renderEntry('join');

    await tryToJoin(' ab3k ');

    expect(joinRoom).toHaveBeenCalledWith('AB3K', 'Juan');
    expect(screen.queryByText(en.room.codeInvalid)).not.toBeInTheDocument();
  });

  it('says it is connecting and holds the button meanwhile', async () => {
    vi.mocked(joinRoom).mockImplementation(async () => useRoom.getState().connect('guest'));
    renderEntry('join');

    await tryToJoin('AB3K');

    expect(screen.getByRole('status')).toHaveTextContent(en.room.connecting);
    expect(screen.getByRole('button', { name: en.room.enter })).toBeDisabled();
  });

  describe('when the room cannot be joined', () => {
    it('says there is no room with that code', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'not-found' }));
      renderEntry('join');

      await tryToJoin('AB3K');

      expect(screen.getByRole('alert')).toHaveTextContent(en.room.notFound);
    });

    it('says how many minutes to wait, rounded up', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'rate-limited', retryAfter: 241 }));
      const i18n = renderEntry('join');

      await tryToJoin('AB3K');

      expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('room.rateLimited', { count: 5 }));
    });

    it('says the room is full', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'full' }));
      renderEntry('join');

      await tryToJoin('AB3K');

      expect(screen.getByRole('alert')).toHaveTextContent(en.room.full);
    });

    it('says the room could not be reached', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'unreachable' }));
      renderEntry('join');

      await tryToJoin('AB3K');

      expect(screen.getByRole('alert')).toHaveTextContent(en.room.unreachable);
      expect(screen.getByRole('button', { name: en.room.enter })).toBeEnabled();
    });
  });

  it('says the room could not be opened when creating one fails', async () => {
    vi.mocked(createRoom).mockImplementation(async () => {
      useRoom.getState().connect('host');
      useRoom.getState().fail({ kind: 'unreachable' });
    });
    renderEntry('create');

    await userEvent.type(nicknameField(), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: en.room.open }));

    expect(screen.getByRole('alert')).toHaveTextContent(en.room.notOpened);
  });

  it('moves on to the lobby once the room lets the user in', async () => {
    renderEntry('join');

    act(() =>
      useRoom.getState().enterLobby({ code: 'AB3K', you: 'j', criterion: 'x', participants: [] }),
    );

    expect(useScreen.getState().screen).toBe('lobby');
  });

  it('puts the code in the address of a guest who typed it', () => {
    renderEntry('join');

    act(() =>
      useRoom.getState().enterLobby({ code: 'AB3K', you: 'j', criterion: 'x', participants: [] }),
    );

    expect(window.location.search).toBe('?room=AB3K');
  });

  it('leaves the address of the host alone', () => {
    renderEntry('create');

    act(() =>
      useRoom.getState().enterLobby({ code: 'AB3K', you: 'a', criterion: 'x', participants: [] }),
    );

    expect(window.location.search).toBe('');
  });

  describe('opened from a link', () => {
    it('arrives with the code filled in and the nickname to write', () => {
      window.history.replaceState(null, '', '/?room=ab3k');
      renderEntry('join');

      expect(codeField()).toHaveValue('AB3K');
      expect(nicknameField()).toHaveFocus();
    });

    it('leaves the field empty for a code no room can have', () => {
      window.history.replaceState(null, '', '/?room=AB0K');
      renderEntry('join');

      expect(codeField()).toHaveValue('');
      expect(codeField()).toHaveFocus();
    });

    it('drops the code from the address on the way back to the form', async () => {
      window.history.replaceState(null, '', '/?room=AB3K');
      renderEntry('join');

      await userEvent.click(screen.getByRole('button', { name: en.room.back }));

      expect(window.location.search).toBe('');
      expect(leaveRoom).toHaveBeenCalled();
      expect(useScreen.getState().screen).toBe('list-input');
    });
  });
});
