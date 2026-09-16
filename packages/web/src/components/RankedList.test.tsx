// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { I18nextProvider } from 'react-i18next';
import { dropTargetId, parseDragSource, parseDropTarget } from '../core/dropTargets.ts';
import type { DropTarget } from '../core/dropTargets.ts';
import type { Item, RankedSlot } from '../core/types.ts';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import type { DropPreview } from './RankedList.tsx';
import { RankedList } from './RankedList.tsx';

const items: Item[] = ['Sushi', 'Ramen', 'Curry', 'Tacos'].map((text) => ({
  id: text.toLowerCase(),
  text,
}));

const slots: RankedSlot[] = [
  { itemIds: ['sushi'] },
  { itemIds: ['ramen', 'curry'] },
  { itemIds: ['tacos'] },
];

interface Handlers {
  onSelect?: (target: DropTarget) => void;
  onHover?: (target: DropTarget | null) => void;
}

const renderList = (preview?: DropPreview, handlers: Handlers = {}) =>
  render(
    <I18nextProvider i18n={createI18n()}>
      <DndContext>
        <RankedList slots={slots} items={items} preview={preview} {...handlers} />
      </DndContext>
    </I18nextProvider>,
  );

const positions = () =>
  [...screen.getByRole('list').children].filter(
    (row) => parseDropTarget(row.getAttribute('data-drop-target') ?? '')?.kind === 'slot',
  );

describe('RankedList', () => {
  it('offers an insertion point around every position, and each position as a tie', () => {
    renderList();

    const rows = [...screen.getByRole('list').children].map((row) =>
      parseDropTarget(row.getAttribute('data-drop-target') ?? ''),
    );

    // Read back through the parser rather than compared as strings: what
    // matters is the target the resolver will be handed, not the spelling.
    expect(rows).toEqual([
      { kind: 'gap', index: 0 },
      { kind: 'slot', index: 0 },
      { kind: 'gap', index: 1 },
      { kind: 'slot', index: 1 },
      { kind: 'gap', index: 2 },
      { kind: 'slot', index: 2 },
      { kind: 'gap', index: 3 },
    ]);
  });

  it('marks the target the preview names and nothing else', () => {
    renderList({ targetId: dropTargetId({ kind: 'slot', index: 2 }), outcome: 'tie' });

    const marked = [...document.querySelectorAll('[data-outcome]')];

    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('Tacos');
    expect(marked[0]).toHaveAttribute('data-outcome', 'tie');
  });

  // Competition numbering, so the pair sharing position 2 leaves no 3 behind
  // and the item under them is a 4.
  it('numbers the positions without the one a tie swallowed', () => {
    renderList();

    expect(positions().map((row) => row.firstElementChild?.textContent)).toEqual(['1', '2', '4']);
  });

  it('notes the tie for a screen reader on the shared position only', () => {
    renderList();

    const notes = screen.getAllByText(en.sorting.tied);

    expect(notes).toHaveLength(1);
    expect(notes[0].closest('[data-drop-target]')).toBe(positions()[1]);
  });

  it('lets every placed item be picked up, each half of a tie on its own', () => {
    renderList();

    const handles = [...document.querySelectorAll('[data-drag-id]')].map((handle) => [
      handle.textContent,
      parseDragSource(handle.getAttribute('data-drag-id') ?? ''),
    ]);

    expect(handles).toEqual([
      ['Sushi', { from: 'placed', itemId: 'sushi' }],
      ['Ramen', { from: 'placed', itemId: 'ramen' }],
      ['Curry', { from: 'placed', itemId: 'curry' }],
      ['Tacos', { from: 'placed', itemId: 'tacos' }],
    ]);
  });

  it('names every target for what a click there would do', () => {
    renderList(undefined, { onSelect: () => undefined });

    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));

    expect(names).toEqual([
      'Put it at position 1',
      'Tie it with Sushi',
      'Put it at position 2',
      'Tie it with Ramen and Curry',
      'Put it at position 3',
      'Tie it with Tacos',
      'Put it at position 4',
    ]);
  });

  it('hands the clicked target up, from a gap, a rank or anywhere on the row', async () => {
    const onSelect = vi.fn();
    renderList(undefined, { onSelect });

    await userEvent.click(screen.getByRole('button', { name: 'Put it at position 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tie it with Tacos' }));
    await userEvent.click(positions()[0]);

    // One call per click: the rank's click reaches the row and stops there.
    expect(onSelect.mock.calls).toEqual([
      [{ kind: 'gap', index: 2 }],
      [{ kind: 'slot', index: 2 }],
      [{ kind: 'slot', index: 0 }],
    ]);
  });

  it('ignores the second click of a double-click', async () => {
    const onSelect = vi.fn();
    renderList(undefined, { onSelect });

    await userEvent.dblClick(screen.getByRole('button', { name: 'Put it at position 1' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reports the target under the mouse and clears it on the way out', async () => {
    const onHover = vi.fn();
    renderList(undefined, { onSelect: () => undefined, onHover });

    await userEvent.hover(screen.getByRole('button', { name: 'Put it at position 1' }));
    await userEvent.unhover(screen.getByRole('button', { name: 'Put it at position 1' }));

    expect(onHover.mock.calls).toEqual([[{ kind: 'gap', index: 0 }], [null]]);
  });

  it('disables every target when there is nothing to put down', () => {
    renderList();

    const buttons = screen.getAllByRole('button');

    expect(buttons).toHaveLength(7);
    for (const button of buttons) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }
  });
});
