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

const ana: Participant = { id: 'a', nickname: 'Ana', isCreator: true, progress: 1 };
const juan: Participant = { id: 'j', nickname: 'Juan', isCreator: false, progress: 3 };

function inRoom(status: RoomStatus, role: 'host' | 'guest' = 'guest') {
  const you = role === 'host' ? 'a' : 'j';
  useRoom.setState({ role, you, participants: [ana, juan], status, items });
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

  it('gives a guest no way to remove anyone', () => {
    inRoom('sorting');
    renderStrip();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is not there outside a room', () => {
    useRoom.getState().leave();
    renderStrip();

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
