// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

// The session is tested on its own and in the E2E. Here the store is moved by
// hand to whatever the session would have written.
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

const popup = (message: string) => screen.getByRole('alertdialog', { name: message });
// The severity shows in the colour and the shape of the icon, and the class
// is what decides both.
const severityOf = (dialog: HTMLElement) => dialog.className.match(/info|warning|error/)?.[0];
const loader = () => screen.getByRole('status').querySelector('[class*="loader"]');

// What Chrome sends a modal dialog when Escape is pressed.
const pressEscape = (dialog: HTMLElement) =>
  fireEvent(dialog, new Event('cancel', { cancelable: true }));

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

  it('shows the loader beside that line, hidden from screen readers', async () => {
    vi.mocked(joinRoom).mockImplementation(async () => useRoom.getState().connect('guest'));
    renderEntry('join');
    expect(loader()).toBeNull();

    await tryToJoin('AB3K');

    expect(loader()).toHaveAttribute('aria-hidden', 'true');
  });

  it('drops the loader once the room lets the user in', async () => {
    vi.mocked(joinRoom).mockImplementation(async () => useRoom.getState().connect('guest'));
    renderEntry('join');
    await tryToJoin('AB3K');

    act(() =>
      useRoom.getState().enterLobby({ code: 'AB3K', you: 'j', criterion: 'x', participants: [] }),
    );

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  describe('when the room cannot be joined', () => {
    it('says there is no room with that code, as an error', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'not-found' }));
      renderEntry('join');

      await tryToJoin('AB3K');

      expect(severityOf(popup(en.room.notFound))).toBe('error');
    });

    it('says how many minutes to wait, rounded up, as a warning', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'rate-limited', retryAfter: 241 }));
      const i18n = renderEntry('join');

      await tryToJoin('AB3K');

      expect(severityOf(popup(i18n.t('room.rateLimited', { count: 5 })))).toBe('warning');
    });

    it('says the room is full, as a warning', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'full' }));
      renderEntry('join');

      await tryToJoin('AB3K');

      expect(severityOf(popup(en.room.full))).toBe('warning');
    });

    it('says the room has already started, as a warning', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'started' }));
      renderEntry('join');

      await tryToJoin('AB3K');

      expect(severityOf(popup(en.room.started))).toBe('warning');
    });

    it('says the room could not be reached, as an error', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'unreachable' }));
      renderEntry('join');

      await tryToJoin('AB3K');

      expect(severityOf(popup(en.room.unreachable))).toBe('error');
      expect(screen.getByRole('button', { name: en.room.enter })).toBeEnabled();
    });

    it('opens on its button and gives the focus back to the code once closed', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'not-found' }));
      renderEntry('join');
      await tryToJoin('AB3K');
      expect(screen.getByRole('button', { name: en.room.dismiss })).toHaveFocus();

      await userEvent.click(screen.getByRole('button', { name: en.room.dismiss }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(useRoom.getState().error).toBeNull();
      expect(codeField()).toHaveFocus();
      expect(codeField()).toHaveValue('AB3K');
    });

    it('does the same on Escape', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'full' }));
      renderEntry('join');
      await tryToJoin('AB3K');

      pressEscape(popup(en.room.full));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(codeField()).toHaveFocus();
    });

    it('opens again when the next attempt fails too', async () => {
      vi.mocked(joinRoom).mockImplementation(failWith({ kind: 'not-found' }));
      renderEntry('join');
      await tryToJoin('AB3K');
      await userEvent.click(screen.getByRole('button', { name: en.room.dismiss }));

      await userEvent.click(screen.getByRole('button', { name: en.room.enter }));

      expect(popup(en.room.notFound)).toBeInTheDocument();
    });
  });

  describe('when the room cannot be opened', () => {
    beforeEach(() => {
      vi.mocked(createRoom).mockImplementation(async () => {
        useRoom.getState().connect('host');
        useRoom.getState().fail({ kind: 'unreachable' });
      });
    });

    it('says so, as an error', async () => {
      renderEntry('create');

      await userEvent.type(nicknameField(), 'Ana');
      await userEvent.click(screen.getByRole('button', { name: en.room.open }));

      expect(severityOf(popup(en.room.notOpened))).toBe('error');
    });

    // There is no code to correct, so the focus goes back where the user left.
    it('gives the focus back to the button that opens the room once closed', async () => {
      renderEntry('create');
      await userEvent.type(nicknameField(), 'Ana');
      await userEvent.click(screen.getByRole('button', { name: en.room.open }));

      await userEvent.click(screen.getByRole('button', { name: en.room.dismiss }));

      expect(screen.getByRole('button', { name: en.room.open })).toHaveFocus();
    });
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
