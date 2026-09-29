// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import App from '../App.tsx';
import type { Item, RankedSlot } from '../core/types.ts';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import { es } from '../i18n/locales/es.ts';
import type { Participant } from '../room/hostRoom.ts';
import { AFFINITY_MATRIX_LIMIT, buildResult } from '../room/result.ts';
import { changeList, playAgain } from '../room/session.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import { useScreen } from '../state/screenStore.ts';

const confetti = vi.hoisted(() => Object.assign(vi.fn(), { reset: vi.fn() }));

vi.mock('canvas-confetti', () => ({ default: confetti }));

// Leaving stays real, since the tests of the way out rely on it. The two that
// lead to another round are stubbed: only a room the session opened itself
// could act on them, and the session has a suite of its own.
vi.mock('../room/session.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../room/session.ts')>()),
  playAgain: vi.fn(),
  changeList: vi.fn(),
}));

const items: Item[] = ['Udon', 'Soba', 'Ramen', 'Pho'].map((text) => ({ id: text, text }));
const criterion = 'Best noodle';

const person = (nickname: string, connected = true): Participant => ({
  id: nickname.toLowerCase(),
  nickname,
  isCreator: nickname === 'Ana',
  progress: items.length,
  connected,
  finished: true,
});

const list = (...order: string[]): RankedSlot[] => order.map((id) => ({ itemIds: [id] }));

// Three lists that rotate the first three items and agree on the last, so the
// consensus puts three items level at 1 and Pho at 4. Every pair scores 0.4.
const rotating: [Participant, RankedSlot[]][] = [
  [person('Ana'), list('Udon', 'Soba', 'Ramen', 'Pho')],
  [person('Juan'), list('Soba', 'Ramen', 'Udon', 'Pho')],
  [person('Eva'), list('Ramen', 'Udon', 'Soba', 'Pho')],
];

function reveal(lists: [Participant, RankedSlot[]][], role: 'host' | 'guest' = 'host') {
  const participants = lists.map(([participant]) => participant);
  const result = buildResult(
    participants,
    new Map(lists.map(([participant, slots]) => [participant.id, slots])),
  );
  useRoom.setState({
    role,
    code: 'AB3K',
    you: 'ana',
    status: 'revealed',
    result,
    participants,
    items,
    criterion,
  });
  return result;
}

// A room of any size, each list a turn of the one before.
function roomOf(size: number) {
  return Array.from({ length: size }, (_, i): [Participant, RankedSlot[]] => {
    const order = items.map((_, place) => items[(place + i) % items.length].id);
    return [person(i === 0 ? 'Ana' : `Guest ${i}`), list(...order)];
  });
}

const renderApp = () => {
  const i18n = createI18n();
  render(
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>,
  );
  return i18n;
};

const section = (name: string) => screen.getByRole('region', { name });

// A row per item, each its number and then its card.
const rows = (within_: HTMLElement) =>
  within(within_)
    .getAllByRole('listitem')
    .map((position) =>
      [...position.querySelectorAll(':scope > div')].map(
        (row) => `${row.firstElementChild?.textContent} ${row.lastElementChild?.textContent}`,
      ),
    );

beforeEach(() => {
  confetti.mockClear();
  confetti.reset.mockClear();
  vi.mocked(playAgain).mockReset();
  vi.mocked(changeList).mockReset();
  useRoom.getState().leave();
  usePlacement.getState().start(items, criterion);
  useScreen.setState({ screen: 'room-result' });
});

describe('RoomResultScreen', () => {
  it('asks the criterion as the heading and starts there', () => {
    reveal(rotating);
    renderApp();

    expect(screen.getByText(en.roomResult.title)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: criterion })).toHaveFocus();
  });

  it('celebrates once, leaving reduced motion to the library, and stops once left', async () => {
    reveal(rotating, 'guest');
    renderApp();

    expect(confetti).toHaveBeenCalledTimes(1);
    expect(confetti).toHaveBeenCalledWith(
      expect.objectContaining({ disableForReducedMotion: true }),
    );

    await userEvent.click(screen.getByRole('button', { name: en.room.lobby.leave }));

    expect(confetti.reset).toHaveBeenCalled();
  });

  it('puts three items level on one rank in one card, and the next one at 4', () => {
    reveal(rotating);
    renderApp();

    const consensus = section(en.roomResult.consensus);
    expect(rows(consensus)).toEqual([['1 Udon', '1 Soba', '1 Ramen'], ['4 Pho']]);
    expect(within(consensus).getByText(en.result.tied)).toBeInTheDocument();
  });

  it('compares everyone in a grid, each pair in both of its cells', () => {
    reveal(rotating);
    renderApp();

    const grid = within(section(en.roomResult.affinity));
    expect(grid.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Ana',
      'Juan',
      'Eva',
    ]);
    // A rotation leaves every pair as far apart as the next: three pairs, each
    // in two cells.
    expect(grid.getAllByRole('cell', { name: '0.40' })).toHaveLength(6);
  });

  it('still uses the grid for a room of 8', () => {
    reveal(roomOf(AFFINITY_MATRIX_LIMIT));
    renderApp();

    const grid = within(section(en.roomResult.affinity));
    expect(grid.getAllByRole('columnheader')).toHaveLength(8);
    expect(grid.getAllByRole('row')).toHaveLength(9);
  });

  it('sums a room of 9 up as who is most and least like you, with anyone else in the dropdown', () => {
    reveal(roomOf(AFFINITY_MATRIX_LIMIT + 1));
    renderApp();

    const affinity = within(section(en.roomResult.affinity));
    expect(affinity.queryByRole('table')).not.toBeInTheDocument();
    expect(affinity.getByText(en.roomResult.mostAlike)).toBeInTheDocument();
    expect(affinity.getByText(en.roomResult.leastAlike)).toBeInTheDocument();

    const picker = screen.getByRole('combobox', { name: en.roomResult.compareWith });
    expect(within(picker).getAllByRole('option')).toHaveLength(8);
  });

  it('says who left before the reveal, wherever they are named', () => {
    reveal([rotating[0], [person('Juan', false), rotating[1][1]]]);
    renderApp();

    const name = 'Juan (left)';
    expect(within(section(en.roomResult.affinity)).getAllByText(name)).toHaveLength(2);
    expect(screen.getByRole('option', { name })).toBeInTheDocument();
  });

  it('shows the items the lists put furthest apart, with the best and worst place given', () => {
    reveal(rotating);
    renderApp();

    const divisive = within(section(en.roomResult.divisive));
    const split = divisive.getAllByRole('listitem');
    expect(split).toHaveLength(3);
    expect(split[0]).toHaveTextContent('Placed anywhere from 1 to 3');
    expect(divisive.queryByText('Pho')).not.toBeInTheDocument();
  });

  it('says so when everyone agreed on everything', () => {
    const same = list('Udon', 'Soba', 'Ramen', 'Pho');
    reveal([
      [person('Ana'), same],
      [person('Juan'), same],
    ]);
    renderApp();

    expect(
      within(section(en.roomResult.divisive)).getByText(en.roomResult.agreed),
    ).toBeInTheDocument();
  });

  it('shows your own list, and puts it next to anyone you pick', async () => {
    reveal(rotating);
    renderApp();

    const own = section(en.roomResult.yourList);
    expect(rows(own)).toEqual([['1 Udon'], ['2 Soba'], ['3 Ramen'], ['4 Pho']]);

    const table = within(own).getByRole('table');
    const lines = () =>
      within(table)
        .getAllByRole('row')
        .map((row) => row.textContent);
    expect(lines()).toEqual([
      `${en.roomResult.item}${en.roomResult.you}Juan`,
      'Udon13',
      'Soba21',
      'Ramen32',
      'Pho44',
    ]);
    expect(within(own).getByText('Affinity: 0.40')).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: en.roomResult.compareWith }),
      'Eva',
    );

    expect(lines()[0]).toBe(`${en.roomResult.item}${en.roomResult.you}Eva`);
    expect(lines()[1]).toBe('Udon12');
  });

  it('shows a single list as it is, with nothing to compare', () => {
    reveal([rotating[0]]);
    renderApp();

    expect(rows(section(en.roomResult.consensus))).toEqual([
      ['1 Udon'],
      ['2 Soba'],
      ['3 Ramen'],
      ['4 Pho'],
    ]);
    expect(screen.getByText(en.roomResult.onlyList)).toBeInTheDocument();
    for (const heading of [
      en.roomResult.affinity,
      en.roomResult.divisive,
      en.roomResult.yourList,
    ]) {
      expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
    }
  });

  it('offers the creator to close the room, and a guest to leave it', async () => {
    reveal(rotating);
    renderApp();
    expect(screen.getByRole('button', { name: en.room.lobby.close })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.room.lobby.leave })).not.toBeInTheDocument();

    act(() => useRoom.setState({ role: 'guest', you: 'juan' }));
    await userEvent.click(screen.getByRole('button', { name: en.room.lobby.leave }));

    expect(useRoom.getState().status).toBe('idle');
    expect(useScreen.getState().screen).toBe('list-input');
  });

  it('asks the creator before closing, saying everyone keeps the result', async () => {
    reveal(rotating);
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: en.room.lobby.close }));

    expect(
      screen.getByRole('group', { name: en.room.lobby.confirmCloseRevealed }),
    ).toBeInTheDocument();
  });

  describe('another round', () => {
    const field = () => screen.getByRole('textbox', { name: en.roomResult.nextCriterion });

    it('plays the same items again under the criterion the creator leaves in the field', async () => {
      reveal(rotating);
      renderApp();

      expect(field()).toHaveValue(criterion);
      await userEvent.clear(field());
      await userEvent.type(field(), 'Best broth');
      await userEvent.click(screen.getByRole('button', { name: en.roomResult.sameItems }));

      expect(playAgain).toHaveBeenCalledWith({ criterion: 'Best broth' });
    });

    it('needs a criterion, and someone else connected, to start one', async () => {
      reveal(rotating);
      renderApp();
      const same = screen.getByRole('button', { name: en.roomResult.sameItems });

      await userEvent.clear(field());
      expect(same).toBeDisabled();

      await userEvent.type(field(), 'Best broth');
      act(() =>
        useRoom.setState({
          participants: rotating.map(([p]) => ({ ...p, connected: p.isCreator })),
        }),
      );
      expect(same).toBeDisabled();
      expect(same).toHaveAccessibleDescription(en.room.alone);
    });

    it('takes the creator to the form for a new list, holding the criterion', async () => {
      reveal(rotating);
      renderApp();

      await userEvent.clear(field());
      await userEvent.type(field(), 'Best broth');
      await userEvent.click(screen.getByRole('button', { name: en.roomResult.changeList }));

      expect(changeList).toHaveBeenCalled();
      expect(useScreen.getState().screen).toBe('list-input');
      expect(useListDraft.getState().criterion).toBe('Best broth');
      expect(screen.getByRole('button', { name: en.form.startRound })).toBeInTheDocument();
    });

    it('tells a guest the creator decides, with nothing to press for it', () => {
      reveal(rotating, 'guest');
      renderApp();

      expect(screen.getByText(en.roomResult.creatorDecides)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: en.roomResult.sameItems }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('takes a guest to wait for the new list, back to the result, and on to sort', () => {
      const result = reveal(rotating, 'guest');
      renderApp();

      act(() => useRoom.getState().prepare());
      expect(useScreen.getState().screen).toBe('lobby');
      expect(screen.getByText(en.room.lobby.preparing)).toHaveFocus();

      act(() => useRoom.getState().reveal(result));
      expect(useScreen.getState().screen).toBe('room-result');
      expect(screen.getByRole('heading', { name: criterion })).toHaveFocus();

      act(() => {
        usePlacement.getState().start(items, 'Best broth');
        useRoom.getState().startSorting(items, 'Best broth');
      });
      expect(useScreen.getState().screen).toBe('sorting');
      expect(screen.getByRole('heading', { name: 'Best broth' })).toHaveFocus();
    });
  });

  it('keeps the result for a guest the room moved on from, and says why', () => {
    reveal(rotating, 'guest');
    renderApp();

    act(() => useRoom.getState().miss());

    expect(screen.getByRole('status')).toHaveTextContent(en.room.lobby.missed);
    expect(screen.queryByText(en.roomResult.creatorDecides)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.room.back })).toBeInTheDocument();
  });

  it('keeps the result once the room is closed, and says so', () => {
    const result = reveal(rotating, 'guest');
    renderApp();

    act(() => useRoom.getState().close());

    expect(screen.getByRole('status')).toHaveTextContent(en.room.lobby.closed);
    expect(useRoom.getState().result).toBe(result);
    expect(rows(section(en.roomResult.consensus))).toHaveLength(2);
    expect(screen.getByRole('button', { name: en.room.back })).toBeInTheDocument();
  });

  it('switches its strings, and its decimals, with the language', async () => {
    reveal(rotating);
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: 'Spanish' }));

    expect(screen.getByText(es.roomResult.title)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: es.roomResult.consensus })).toBeInTheDocument();
    expect(screen.getByText('Afinidad: 0,40')).toBeInTheDocument();
  });
});
