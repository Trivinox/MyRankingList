// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import type { RoomList, RoomResult } from '../room/result.ts';
import { AffinityMatrix } from './AffinityMatrix.tsx';

const listOf = (id: string, left = false): RoomList => ({
  id,
  nickname: id,
  left,
  slots: [{ itemIds: ['a'] }],
});

// Only the lists and the pairs matter to the grid.
function resultOf(lists: RoomList[], affinity: RoomResult['affinity']): RoomResult {
  return { consensus: [], discrepancies: [], lists, affinity };
}

function renderGrid(result: RoomResult, you = 'Ana') {
  render(
    <I18nextProvider i18n={createI18n()}>
      <h3 id="affinity">{en.roomResult.affinity}</h3>
      <AffinityMatrix result={result} you={you} labelledBy="affinity" />
    </I18nextProvider>,
  );
  return screen.getByRole('table', { name: en.roomResult.affinity });
}

describe('AffinityMatrix', () => {
  it('shows two people as a 2x2 grid, the pair in both cells and the diagonal empty', () => {
    const grid = within(
      renderGrid(
        resultOf([listOf('Ana'), listOf('Juan')], [{ a: 'Ana', b: 'Juan', coefficient: 0.5 }]),
      ),
    );

    expect(grid.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Ana', 'Juan']);
    expect(grid.getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Ana', 'Juan']);
    const cells = grid.getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent)).toEqual(['', '', '0.50', '0.50', '']);
  });

  it('shades a closer pair deeper than a further one', () => {
    const grid = within(
      renderGrid(
        resultOf(
          [listOf('Ana'), listOf('Juan'), listOf('Eva')],
          [
            { a: 'Ana', b: 'Juan', coefficient: 0.9 },
            { a: 'Ana', b: 'Eva', coefficient: -0.9 },
            { a: 'Juan', b: 'Eva', coefficient: 0 },
          ],
        ),
      ),
    );

    const shadeOf = (value: string) =>
      grid.getAllByRole('cell', { name: value })[0].style.getPropertyValue('--shade');
    const saturation = (value: string) => Number(/hsl\(\d+ (\d+)%/.exec(shadeOf(value))![1]);
    expect(saturation('0.90')).toBeGreaterThan(saturation('0.00'));
    expect(saturation('0.00')).toBeGreaterThan(saturation('-0.90'));
  });

  it('says a pair with no coefficient has no value', () => {
    const grid = within(
      renderGrid(
        resultOf([listOf('Ana'), listOf('Juan')], [{ a: 'Ana', b: 'Juan', coefficient: null }]),
      ),
    );

    expect(grid.getAllByRole('cell', { name: en.roomResult.noValue })).toHaveLength(2);
  });

  it('holds eight people in eight rows of eight', () => {
    const ids = ['Ana', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const affinity = ids.flatMap((a, i) =>
      ids.slice(i + 1).map((b) => ({ a, b, coefficient: 0.25 })),
    );
    const grid = within(
      renderGrid(
        resultOf(
          ids.map((id) => listOf(id)),
          affinity,
        ),
      ),
    );

    expect(grid.getAllByRole('columnheader')).toHaveLength(8);
    expect(grid.getAllByRole('rowheader')).toHaveLength(8);
    expect(grid.getAllByRole('cell', { name: '0.25' })).toHaveLength(56);
  });

  it('names someone who left as gone', () => {
    const grid = within(
      renderGrid(
        resultOf([listOf('Ana'), listOf('Juan', true)], [{ a: 'Ana', b: 'Juan', coefficient: 1 }]),
      ),
    );

    expect(grid.getByRole('columnheader', { name: 'Juan (left)' })).toBeInTheDocument();
    expect(grid.getByRole('rowheader', { name: 'Juan (left)' })).toBeInTheDocument();
  });
});
