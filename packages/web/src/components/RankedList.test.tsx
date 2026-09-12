// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { dropTargetId, parseDragSource, parseDropTarget } from '../core/dropTargets.ts';
import type { Item, RankedSlot } from '../core/types.ts';
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

describe('RankedList', () => {
  it('offers an insertion point around every position, and each position as a tie', () => {
    render(
      <DndContext>
        <RankedList slots={slots} items={items} />
      </DndContext>,
    );

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
    render(
      <DndContext>
        <RankedList
          slots={slots}
          items={items}
          preview={{ targetId: dropTargetId({ kind: 'slot', index: 2 }), outcome: 'tie' }}
        />
      </DndContext>,
    );

    const marked = [...document.querySelectorAll('[data-outcome]')];

    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('Tacos');
    expect(marked[0]).toHaveAttribute('data-outcome', 'tie');
  });

  it('lets every placed item be picked up, each half of a tie on its own', () => {
    render(
      <DndContext>
        <RankedList slots={slots} items={items} />
      </DndContext>,
    );

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
});
