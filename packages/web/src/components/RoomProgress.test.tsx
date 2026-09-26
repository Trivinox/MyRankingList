// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { Item } from '../core/types.ts';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import type { Participant } from '../room/hostRoom.ts';
import { removeParticipant } from '../room/session.ts';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import type { RoomStatus } from '../state/roomStore.ts';
import { RoomProgress } from './RoomProgress.tsx';

vi.mock('../room/session.ts', () => ({ removeParticipant: vi.fn() }));

const items: Item[] = ['Udon', 'Soba', 'Ramen', 'Pho'].map((text) => ({ id: text, text }));

const ana: Participant = {
  id: 'a',
  nickname: 'Ana',
  isCreator: true,
  progress: 1,
  connected: true,
};
const juan: Participant = {
  id: 'j',
  nickname: 'Juan',
  isCreator: false,
  progress: 3,
  connected: true,
};

function inRoom(status: RoomStatus, role: 'host' | 'guest' = 'guest') {
  const you = role === 'host' ? 'a' : 'j';
  useRoom.setState({ role, you, participants: [ana, juan], status, items, overdue: [] });
}

const renderStrip = () => {
  const i18n = createI18n();
  render(
    <I18nextProvider i18n={i18n}>
      <RoomProgress />
    </I18nextProvider>,
  );
  return i18n;
};

beforeEach(() => {
  vi.mocked(removeParticipant).mockReset();
  usePlacement.getState().start(items, 'Best noodle');
});

describe('RoomProgress', () => {
  it('stays up while reconnecting, with the list the host last sent', () => {
    inRoom('reconnecting');
    renderStrip();

    const strip = screen.getByRole('list', { name: en.room.everyone });
    expect(within(strip).getAllByRole('listitem')).toHaveLength(2);
  });

  it('is not there after a reload, until the host says who is in the room', () => {
    useRoom.setState({ role: 'guest', you: 'j', participants: [], status: 'reconnecting' });
    renderStrip();
    expect(screen.queryByRole('list', { name: en.room.everyone })).not.toBeInTheDocument();

    act(() =>
      useRoom.getState().resume({ you: 'j', criterion: 'x', participants: [ana, juan], items }),
    );
    expect(screen.getByRole('list', { name: en.room.everyone })).toBeInTheDocument();
  });

  it('shows everyone with how far along they are', () => {
    inRoom('sorting');
    const i18n = renderStrip();

    const strip = screen.getByRole('list', { name: en.room.everyone });
    expect(within(strip).getAllByRole('listitem')).toHaveLength(2);
    for (const { nickname, progress } of [ana, juan]) {
      expect(
        within(strip).getByRole('img', {
          name: i18n.t('room.placed', { nickname, placed: progress, total: 4 }),
        }),
      ).toBeInTheDocument();
    }
    expect(within(strip).getByText(en.room.lobby.you)).toBeInTheDocument();
  });

  it('follows the progress the host sends', () => {
    inRoom('sorting');
    const i18n = renderStrip();

    act(() => useRoom.getState().setParticipants([ana, { ...juan, progress: 4 }]));

    expect(
      screen.getByRole('img', {
        name: i18n.t('room.placed', { nickname: 'Juan', placed: 4, total: 4 }),
      }),
    ).toBeInTheDocument();
  });

  it('lets the host remove anyone but themselves, once they confirm', async () => {
    inRoom('sorting', 'host');
    const i18n = renderStrip();

    expect(
      screen.queryByRole('button', { name: i18n.t('room.remove.label', { nickname: 'Ana' }) }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('room.remove.label', { nickname: 'Juan' }) }),
    );
    expect(removeParticipant).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: en.room.remove.yes }));

    expect(removeParticipant).toHaveBeenCalledWith('j');
  });

  it('leaves the focus on the strip once the only guest is removed', async () => {
    vi.mocked(removeParticipant).mockImplementation(() =>
      useRoom.getState().setParticipants([ana]),
    );
    inRoom('sorting', 'host');
    const i18n = renderStrip();

    await userEvent.click(
      screen.getByRole('button', { name: i18n.t('room.remove.label', { nickname: 'Juan' }) }),
    );
    await userEvent.click(screen.getByRole('button', { name: en.room.remove.yes }));

    expect(screen.getByRole('list', { name: en.room.everyone })).toHaveFocus();
  });

  it('gives a guest no way to remove anyone', () => {
    inRoom('sorting');
    renderStrip();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  describe('someone away for too long', () => {
    const awayJuan = { ...juan, connected: false };

    function overdue(role: 'host' | 'guest') {
      inRoom('sorting', role);
      useRoom.setState({ participants: [ana, awayJuan], overdue: ['j'] });
    }

    it('shows the creator a notice with a way to finish without them', () => {
      overdue('host');
      const i18n = renderStrip();

      expect(
        screen.getByText(i18n.t('room.overdue.notice', { nickname: 'Juan', count: 20 })),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: i18n.t('room.overdue.finish', { nickname: 'Juan' }) }),
      ).toBeInTheDocument();
    });

    it('shows a guest nothing', () => {
      overdue('guest');
      const i18n = renderStrip();

      expect(
        screen.queryByText(i18n.t('room.overdue.notice', { nickname: 'Juan', count: 20 })),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('asks first, and finishes without them once the creator confirms', async () => {
      overdue('host');
      const i18n = renderStrip();

      await userEvent.click(
        screen.getByRole('button', { name: i18n.t('room.overdue.finish', { nickname: 'Juan' }) }),
      );
      expect(
        screen.getByText(i18n.t('room.overdue.confirm', { nickname: 'Juan' })),
      ).toBeInTheDocument();
      expect(removeParticipant).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: en.room.overdue.yes }));

      expect(removeParticipant).toHaveBeenCalledWith('j');
    });

    it('takes nobody out when the creator cancels, and gives the focus back', async () => {
      overdue('host');
      const i18n = renderStrip();
      const finish = screen.getByRole('button', {
        name: i18n.t('room.overdue.finish', { nickname: 'Juan' }),
      });

      await userEvent.click(finish);
      await userEvent.click(screen.getByRole('button', { name: en.room.remove.no }));

      expect(removeParticipant).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: en.room.overdue.yes })).not.toBeInTheDocument();
      expect(finish).toHaveFocus();
    });

    it('drops the question when they come back while it is asked', async () => {
      overdue('host');
      const i18n = renderStrip();
      await userEvent.click(
        screen.getByRole('button', { name: i18n.t('room.overdue.finish', { nickname: 'Juan' }) }),
      );

      act(() => useRoom.setState({ participants: [ana, juan], overdue: [] }));
      expect(screen.queryByRole('button', { name: en.room.overdue.yes })).not.toBeInTheDocument();

      // Away long enough again, and the question does not come back unasked.
      act(() => useRoom.setState({ participants: [ana, awayJuan], overdue: ['j'] }));
      expect(screen.queryByRole('button', { name: en.room.overdue.yes })).not.toBeInTheDocument();
    });
  });

  it('is not there outside a room', () => {
    useRoom.getState().leave();
    renderStrip();

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
