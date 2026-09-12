// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DndContextProps, DragEndEvent } from '@dnd-kit/core';
import { I18nextProvider } from 'react-i18next';
import App from '../App.tsx';
import { parseDropTarget } from '../core/dropTargets.ts';
import type { Item } from '../core/types.ts';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import { usePlacement } from '../state/placementStore.ts';
import { SortingScreen } from './SortingScreen.tsx';

// jsdom gives dnd-kit neither layout nor pointer events, so no real drag ever
// starts here. The context is still the real one, wrapped only to keep hold of
// the handlers the screen gives it, which the tests below call the way dnd-kit
// would once its own hit detection had settled on a target.
const dnd = vi.hoisted(() => ({ props: {} as DndContextProps }));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const dndKit = await importOriginal<typeof import('@dnd-kit/core')>();
  const { createElement } = await import('react');
  return {
    ...dndKit,
    DndContext: (props: DndContextProps) => {
      dnd.props = props;
      return createElement(dndKit.DndContext, props);
    },
  };
});

const items: Item[] = ['Sushi', 'Ramen', 'Curry', 'Tacos'].map((text) => ({
  id: text.toLowerCase(),
  text,
}));

// The store draws its own shuffle, so which item opens the list is not known
// until it has. Every assertion below reads the placement back instead of
// naming an item up front.
const started = () => {
  const { placement } = usePlacement.getState();
  if (!placement) {
    throw new Error('The placement store was never started');
  }
  return placement;
};

const textOf = (id: string) => items.find((item) => item.id === id)?.text ?? id;

// Every position row ends with the container holding its cards, so this
// skips the rank number without matching on it.
const listed = () =>
  screen
    .getAllByRole('listitem')
    .filter((row) => parseDropTarget(row.getAttribute('data-drop-target') ?? '')?.kind === 'slot')
    .map((row) => row.lastElementChild?.textContent);

const renderScreen = () =>
  render(
    <I18nextProvider i18n={createI18n()}>
      <SortingScreen />
    </I18nextProvider>,
  );

beforeEach(() => {
  usePlacement.setState({ items: [], criterion: '', placement: null });
  useListDraft.setState({ screen: 'list-input' });
});

describe('SortingScreen', () => {
  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
  });

  it('opens with one item already in the list', () => {
    renderScreen();

    const [opener] = started().rankedSlots[0].itemIds;

    expect(screen.getByRole('list')).toHaveTextContent(textOf(opener));
  });

  it('shows the item at the head of the pool', () => {
    renderScreen();

    const [next] = started().pendingPool;

    expect(screen.getByText(textOf(next))).toBeInTheDocument();
  });

  it('keeps the rest of the pool off the screen', () => {
    renderScreen();

    const waiting = started().pendingPool.slice(1);
    expect(waiting).toHaveLength(2);

    for (const id of waiting) {
      expect(screen.queryByText(textOf(id))).not.toBeInTheDocument();
    }
  });

  it('asks the criterion as the screen question', () => {
    renderScreen();

    expect(
      screen.getByRole('heading', { name: 'Which one do you like more?' }),
    ).toBeInTheDocument();
  });

  it('opens the progress at the item the list started with', () => {
    renderScreen();

    const bar = screen.getByRole('progressbar');

    expect(bar).toHaveAttribute('aria-valuenow', '1');
    // Counted from zero, or the percentage announced and the width of the fill
    // tell two different stories until the last item lands.
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(screen.getByText('1 of 4 placed')).toBeInTheDocument();
  });
});

describe('continuing from the form', () => {
  it('carries only the filled rows onto the sorting screen', async () => {
    useListDraft.setState({
      screen: 'list-input',
      criterion: 'Best noodle',
      items: [
        { id: 'a', text: 'Sushi' },
        { id: 'b', text: '' },
        { id: 'c', text: 'Ramen' },
        { id: 'd', text: '  ' },
        { id: 'e', text: 'Curry' },
      ],
    });

    render(
      <I18nextProvider i18n={createI18n()}>
        <App />
      </I18nextProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: en.form.continue }));

    expect(useListDraft.getState().screen).toBe('sorting');
    expect(usePlacement.getState().items.map((item) => item.text)).toEqual([
      'Sushi',
      'Ramen',
      'Curry',
    ]);
    expect(screen.getByRole('heading', { name: 'Best noodle' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3');
  });
});

describe('dragging the pool item into the list', () => {
  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
  });

  // The drag itself is dnd-kit's, and jsdom gives it neither layout nor
  // pointer events. What is worth pinning here is the id it drags and what the
  // screen looks like once the resolved drop comes back through the store.
  const dropAt = (index: number) => {
    act(() => {
      usePlacement.getState().drop({ from: 'pool' }, { kind: 'gap', index });
    });
  };

  it('picks the card up by the pool id', () => {
    renderScreen();

    const [next] = started().pendingPool;

    expect(screen.getByText(textOf(next)).closest('[data-drag-id]')).toHaveAttribute(
      'data-drag-id',
      'pool',
    );
  });

  it('leaves the card to the pointer, promising no keyboard drag', () => {
    renderScreen();

    const handle = screen.getByText(textOf(started().pendingPool[0])).closest('[data-drag-id]');

    expect(handle).not.toHaveAttribute('tabindex');
    expect(handle).not.toHaveAttribute('role');
    expect(handle).not.toHaveAttribute('aria-describedby');
    // dnd-kit renders its stock instructions even with nothing pointing at
    // them, so this only holds while they are overridden.
    expect(document.body).not.toHaveTextContent(/space bar|arrow keys/i);
  });

  it('lands the item above everything, between two positions and at the bottom', () => {
    renderScreen();

    const opener = textOf(started().rankedSlots[0].itemIds[0]);
    const [first, second, third] = started().pendingPool.map(textOf);

    dropAt(0);
    expect(listed()).toEqual([first, opener]);

    dropAt(1);
    expect(listed()).toEqual([first, second, opener]);

    dropAt(3);
    expect(listed()).toEqual([first, second, opener, third]);
  });

  it('moves the pool on and the progress with it', () => {
    renderScreen();

    const [, second] = started().pendingPool.map(textOf);

    dropAt(0);

    expect(screen.getByText(second).closest('[data-drag-id]')).not.toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText('2 of 4 placed')).toBeInTheDocument();
  });
});

describe('moving an item that is already in the list', () => {
  // Each pool item goes to the bottom, so the list ends up in shuffle order
  // and every case starts from four known positions with the pool empty.
  let order: string[];

  beforeEach(() => {
    const { start, drop } = usePlacement.getState();
    start(items, 'Which one do you like more?');
    for (let index = 1; index < items.length; index++) {
      drop({ from: 'pool' }, { kind: 'gap', index });
    }
    order = started().shuffledOrder.map(textOf);
  });

  const move = (position: number, index: number) => {
    const itemId = started().rankedSlots[position].itemIds[0];
    act(() => {
      usePlacement.getState().drop({ from: 'placed', itemId }, { kind: 'gap', index });
    });
  };

  it('offers every item for dragging, not only the last one placed', () => {
    renderScreen();

    const ids = [...screen.getByRole('list').querySelectorAll('[data-drag-id]')].map((handle) =>
      handle.getAttribute('data-drag-id'),
    );

    expect(ids).toEqual(started().shuffledOrder.map((id) => `placed:${id}`));
  });

  it('moves an item from the middle down and back up', () => {
    renderScreen();
    const [a, b, c, d] = order;
    expect(listed()).toEqual([a, b, c, d]);

    move(1, 4);
    expect(listed()).toEqual([a, c, d, b]);

    move(3, 1);
    expect(listed()).toEqual([a, b, c, d]);
  });

  it('moves the first item down into a gap between two others', () => {
    renderScreen();
    const [a, b, c, d] = order;

    move(0, 3);

    expect(listed()).toEqual([b, c, a, d]);
  });

  it('moves the last item to the top', () => {
    renderScreen();
    const [a, b, c, d] = order;

    move(3, 0);

    expect(listed()).toEqual([d, a, b, c]);
  });

  it('keeps the progress where it was, since nothing new was placed', () => {
    renderScreen();

    move(0, 4);

    expect(screen.getByText('4 of 4 placed')).toBeInTheDocument();
    expect(screen.getByText(en.sorting.allPlaced)).toBeInTheDocument();
  });
});

describe('while an item is in the air', () => {
  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
  });

  // Only the ids are ever read off a drag event, so that is all these carry.
  const event = (active: string, over: string | null) =>
    ({ active: { id: active }, over: over && { id: over } }) as unknown as DragEndEvent;

  const pickUp = (active: string) => act(() => dnd.props.onDragStart?.(event(active, null)));
  const hover = (active: string, over: string | null) =>
    act(() => dnd.props.onDragOver?.(event(active, over)));
  const letGo = (active: string, over: string | null) =>
    act(() => dnd.props.onDragEnd?.(event(active, over)));
  const cancel = (active: string) => act(() => dnd.props.onDragCancel?.(event(active, null)));

  const marked = () =>
    [...document.querySelectorAll('[data-outcome]')].map((node) => [
      node.getAttribute('data-drop-target'),
      node.getAttribute('data-outcome'),
    ]);

  const inPool = () => screen.getByText(textOf(started().pendingPool[0])).closest('[data-drag-id]');

  it('marks the gap under the cursor as an insertion', () => {
    renderScreen();

    pickUp('pool');
    hover('pool', 'gap:1');

    expect(marked()).toEqual([['gap:1', 'insert']]);
  });

  it('marks a position holding one item as a tie', () => {
    renderScreen();

    pickUp('pool');
    hover('pool', 'slot:0');

    expect(marked()).toEqual([['slot:0', 'tie']]);
  });

  it('moves the mark along with the cursor and drops it over nothing', () => {
    renderScreen();

    pickUp('pool');
    hover('pool', 'gap:0');
    hover('pool', 'slot:0');
    expect(marked()).toEqual([['slot:0', 'tie']]);

    hover('pool', null);
    expect(marked()).toEqual([]);
  });

  it('lands the item when it is let go over a gap', () => {
    renderScreen();

    const opener = textOf(started().rankedSlots[0].itemIds[0]);
    const [first] = started().pendingPool.map(textOf);

    pickUp('pool');
    hover('pool', 'gap:0');
    letGo('pool', 'gap:0');

    expect(listed()).toEqual([first, opener]);
    expect(marked()).toEqual([]);
  });

  it('refuses a position that already holds two and keeps the item in the pool', () => {
    act(() => {
      usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    });
    renderScreen();

    const before = listed();
    const waiting = started().pendingPool[0];

    pickUp('pool');
    hover('pool', 'slot:0');
    expect(marked()).toEqual([['slot:0', 'rejected']]);

    letGo('pool', 'slot:0');

    expect(listed()).toEqual(before);
    expect(started().pendingPool[0]).toBe(waiting);
    expect(inPool()).toHaveAttribute('data-drag-id', 'pool');
    expect(screen.getByText('2 of 4 placed')).toBeInTheDocument();
  });

  it('refuses a placed item on its own position and leaves it there', () => {
    act(() => {
      usePlacement.getState().drop({ from: 'pool' }, { kind: 'gap', index: 1 });
    });
    renderScreen();

    const before = listed();
    const [itemId] = started().rankedSlots[0].itemIds;

    pickUp(`placed:${itemId}`);
    hover(`placed:${itemId}`, 'slot:0');
    expect(marked()).toEqual([['slot:0', 'rejected']]);

    letGo(`placed:${itemId}`, 'slot:0');

    expect(listed()).toEqual(before);
  });

  it('puts the item back in the pool when it is let go outside the list', () => {
    renderScreen();

    const before = listed();

    pickUp('pool');
    hover('pool', 'gap:1');
    hover('pool', null);
    letGo('pool', null);

    expect(listed()).toEqual(before);
    expect(inPool()).toHaveAttribute('data-drag-id', 'pool');
    expect(screen.getByText('1 of 4 placed')).toBeInTheDocument();
  });

  it('clears the mark and changes nothing when the drag is cancelled', () => {
    renderScreen();

    const before = listed();

    pickUp('pool');
    hover('pool', 'gap:0');
    expect(marked()).toEqual([['gap:0', 'insert']]);

    cancel('pool');

    expect(marked()).toEqual([]);
    expect(listed()).toEqual(before);
    expect(inPool()).toHaveAttribute('data-drag-id', 'pool');
  });
});
