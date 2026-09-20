// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  held?: string;
  onPickUp?: (itemId: string) => void;
  draggable?: boolean;
}

const renderList = (preview?: DropPreview, handlers: Handlers = {}) =>
  render(
    <I18nextProvider i18n={createI18n()}>
      <DndContext>
        <RankedList
          slots={slots}
          items={items}
          preview={preview}
          onPickUp={() => undefined}
          {...handlers}
        />
      </DndContext>
    </I18nextProvider>,
  );

const positions = () =>
  [...screen.getByRole('list').children].filter(
    (row) => parseDropTarget(row.getAttribute('data-drop-target') ?? '')?.kind === 'slot',
  );

// Every button in the list except the move buttons, which pick a card up
// rather than put anything down.
const targets = () =>
  screen.getAllByRole('button').filter((button) => !button.hasAttribute('aria-pressed'));

const moveButton = (text: string) => screen.getByRole('button', { name: `Move ${text}` });

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

  // The class is what carries touch-action: none, so without it a swipe that
  // starts on a card scrolls the page.
  it('drops the drag styling from every card when dragging is off', () => {
    renderList(undefined, { draggable: false });

    const handles = [...document.querySelectorAll('[data-drag-id]')];

    expect(handles).toHaveLength(4);
    for (const handle of handles) {
      expect(handle.className).not.toMatch(/draggable/);
    }
    expect(moveButton('Ramen')).toBeInTheDocument();
  });

  it('names every target for what a click there would do', () => {
    renderList(undefined, { onSelect: () => undefined });

    const names = targets().map((button) => button.getAttribute('aria-label'));

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

  // Two items in a row often belong in the same position, and on a phone the
  // second tap arrives inside the window the browser counts double-taps in.
  it('takes a second tap on the same gap', () => {
    const onSelect = vi.fn();
    renderList(undefined, { onSelect });

    const gap = screen.getByRole('button', { name: 'Put it at position 1' });
    fireEvent(gap, new PointerEvent('click', { bubbles: true, detail: 1, pointerType: 'touch' }));
    fireEvent(gap, new PointerEvent('click', { bubbles: true, detail: 2, pointerType: 'touch' }));

    expect(onSelect).toHaveBeenCalledTimes(2);
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

    const buttons = targets();

    expect(buttons).toHaveLength(7);
    for (const button of buttons) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
    }
  });
});

describe('the move button', () => {
  it('sits on every card, each half of a tie included, and stays usable with nothing to place', () => {
    renderList();

    for (const text of ['Sushi', 'Ramen', 'Curry', 'Tacos']) {
      expect(moveButton(text)).not.toHaveAttribute('aria-disabled');
    }
  });

  // The card it belongs to is also the row a tap ties the pool item with, so
  // the click has to stop at the button.
  it('picks its own card up without also selecting the row', async () => {
    const onSelect = vi.fn();
    const onPickUp = vi.fn();
    renderList(undefined, { onSelect, onPickUp });

    await userEvent.click(moveButton('Curry'));

    expect(onPickUp.mock.calls).toEqual([['curry']]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows as pressed on the held card only, and dims that card', () => {
    renderList(undefined, { held: 'tacos' });

    expect(moveButton('Tacos')).toHaveAttribute('aria-pressed', 'true');
    expect(moveButton('Sushi')).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('[data-drag-id="placed:tacos"]')?.className).toMatch(/lifted/);
    expect(document.querySelector('[data-drag-id="placed:sushi"]')?.className).not.toMatch(
      /lifted/,
    );
  });

  it('ignores the second click of a double-click', async () => {
    const onPickUp = vi.fn();
    renderList(undefined, { onPickUp });

    await userEvent.dblClick(moveButton('Sushi'));

    expect(onPickUp).toHaveBeenCalledTimes(1);
  });

  // Pressing it picks the card up and never ties anything, so a mouse resting
  // on it should not see the row lit up as a tie.
  it('takes the preview off its row while the mouse is on it', async () => {
    const onHover = vi.fn();
    renderList(undefined, { onSelect: () => undefined, onHover });

    // Read after each step rather than as one list of calls: user-event enters
    // the row again on its way into the button, which a browser does not.
    await userEvent.hover(screen.getByText('Tacos'));
    expect(onHover.mock.lastCall).toEqual([{ kind: 'slot', index: 2 }]);

    await userEvent.hover(moveButton('Tacos'));
    expect(onHover.mock.lastCall).toEqual([null]);

    await userEvent.hover(screen.getByText('Tacos'));
    expect(onHover.mock.lastCall).toEqual([{ kind: 'slot', index: 2 }]);
  });
});
