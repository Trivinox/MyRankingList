// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DndContextProps, DragEndEvent, DragOverlayProps } from '@dnd-kit/core';
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
// would once its own hit detection had settled on a target. The overlay is
// wrapped the same way, for the drop animation it is handed.
const dnd = vi.hoisted(() => ({
  props: {} as DndContextProps,
  overlay: {} as DragOverlayProps,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const dndKit = await importOriginal<typeof import('@dnd-kit/core')>();
  const { createElement } = await import('react');
  return {
    ...dndKit,
    DndContext: (props: DndContextProps) => {
      dnd.props = props;
      return createElement(dndKit.DndContext, props);
    },
    DragOverlay: (props: DragOverlayProps) => {
      dnd.overlay = props;
      return createElement(dndKit.DragOverlay, props);
    },
  };
});

// Framer Motion runs in jsdom, but nothing it moves there can be read back
// reliably. What the list asks it to animate, and on which element, can.
const motion = vi.hoisted(() => ({
  calls: [] as { element: Element; keyframes: object }[],
}));

vi.mock('framer-motion', async (importOriginal) => {
  const framer = await importOriginal<typeof import('framer-motion')>();
  // One function for every render, as the real one is, so an effect that
  // depends on it does not run again on each render.
  const animate = (element: Element, keyframes: object) => {
    motion.calls.push({ element, keyframes });
  };
  return {
    ...framer,
    useAnimate: () => [framer.useAnimate()[0], animate],
  };
});

// jsdom plays no audio. Which sound each event asks for is what can be checked.
const sounds = vi.hoisted(() => ({ play: vi.fn(), preload: vi.fn() }));

vi.mock('../sound/sounds.ts', () => sounds);

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

const positions = () =>
  screen
    .getAllByRole('listitem')
    .filter((row) => parseDropTarget(row.getAttribute('data-drop-target') ?? '')?.kind === 'slot');

// A position row opens with its rank, and each of its cards is a drag handle
// with the move button beside it rather than inside, so the handles carry
// nothing but the item.
const listed = () =>
  positions().map((row) =>
    [...row.querySelectorAll('[data-drag-id]')].map((card) => card.textContent).join(''),
  );
const ranks = () => positions().map((row) => row.firstElementChild?.textContent);

// listed() reads a whole position at once, so a tie comes back as both names
// run together.
const row = (...ids: string[]) => ids.map(textOf).join('');

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

const announced = () => document.querySelector('[data-announcer]')?.textContent;

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

describe('tying two items together', () => {
  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
  });

  // The shuffle picks the opener, so each case empties as much of the pool as
  // it needs into the bottom of the list and reads the ids back afterwards.
  const fill = (count: number) => {
    const { drop } = usePlacement.getState();
    for (let index = 1; index <= count; index++) {
      drop({ from: 'pool' }, { kind: 'gap', index });
    }
    return started().shuffledOrder;
  };

  const tieOnto = (index: number) => {
    act(() => {
      usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index });
    });
  };

  it('puts both items under one number and moves the pool on', () => {
    const [a, b, c, d] = fill(2);
    renderScreen();

    pickUp('pool');
    hover('pool', 'slot:1');
    expect(marked()).toEqual([['slot:1', 'tie']]);

    letGo('pool', 'slot:1');

    expect(listed()).toEqual([row(a), row(b, d), row(c)]);
    expect(ranks()).toEqual(['1', '2', '4']);
    expect(screen.getByText('4 of 4 placed')).toBeInTheDocument();
  });

  it('refuses a third item, whether it comes from the pool or from the list', () => {
    const [a, b, c] = fill(1);
    renderScreen();

    tieOnto(0);
    expect(listed()).toEqual([row(a, c), row(b)]);

    pickUp('pool');
    hover('pool', 'slot:0');
    expect(marked()).toEqual([['slot:0', 'rejected']]);
    letGo('pool', 'slot:0');
    expect(listed()).toEqual([row(a, c), row(b)]);
    expect(inPool()).toHaveAttribute('data-drag-id', 'pool');

    pickUp(`placed:${b}`);
    hover(`placed:${b}`, 'slot:0');
    expect(marked()).toEqual([['slot:0', 'rejected']]);
    letGo(`placed:${b}`, 'slot:0');
    expect(listed()).toEqual([row(a, c), row(b)]);
  });

  // A pair with two positions under it, so the numbering has room to move when
  // one half of it goes up.
  const pairOnTop = () => {
    const order = fill(2);
    tieOnto(0);
    return order;
  };

  it('takes half a pair out of the list the moment it is picked up', () => {
    const [a, b, c, d] = pairOnTop();
    renderScreen();

    expect(listed()).toEqual([row(a, d), row(b), row(c)]);
    expect(ranks()).toEqual(['1', '3', '4']);

    pickUp(`placed:${d}`);

    expect(listed()).toEqual([row(a), row(b), row(c)]);
    expect(ranks()).toEqual(['1', '2', '3']);
  });

  it('lands that half in a gap and leaves the partner holding its position', () => {
    const [a, b, c, d] = pairOnTop();
    renderScreen();

    pickUp(`placed:${d}`);
    hover(`placed:${d}`, 'gap:3');
    letGo(`placed:${d}`, 'gap:3');

    expect(listed()).toEqual([row(a), row(b), row(c), row(d)]);
    expect(ranks()).toEqual(['1', '2', '3', '4']);
  });

  it('puts it back beside its partner when the drag is cancelled', () => {
    const [a, b, c, d] = pairOnTop();
    renderScreen();

    pickUp(`placed:${d}`);
    hover(`placed:${d}`, 'gap:3');
    expect(listed()).toEqual([row(a), row(b), row(c)]);

    cancel(`placed:${d}`);

    expect(listed()).toEqual([row(a, d), row(b), row(c)]);
    expect(ranks()).toEqual(['1', '3', '4']);
    expect(marked()).toEqual([]);
  });

  // The partner is standing there on its own by then, so a red position around
  // a single item would contradict the rule the user has just been taught.
  it('reads a drop back onto the partner as a tie and leaves the list as it was', () => {
    const [a, b, c, d] = pairOnTop();
    renderScreen();

    pickUp(`placed:${d}`);
    hover(`placed:${d}`, 'slot:0');
    expect(marked()).toEqual([['slot:0', 'tie']]);

    letGo(`placed:${d}`, 'slot:0');

    expect(listed()).toEqual([row(a, d), row(b), row(c)]);
    expect(ranks()).toEqual(['1', '3', '4']);
  });

  // Only a tie leaves the list on pick-up. An untied item takes its position
  // with it, which would slide every gap below it out from under the cursor.
  it('keeps an untied item in the list while it is in the air', () => {
    const [a, b, c] = fill(2);
    renderScreen();

    pickUp(`placed:${b}`);

    expect(listed()).toEqual([row(a), row(b), row(c)]);
    expect(ranks()).toEqual(['1', '2', '3']);
  });
});

describe('clicking where the pool item goes', () => {
  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
  });

  const fill = (count: number) => {
    const { drop } = usePlacement.getState();
    for (let index = 1; index <= count; index++) {
      drop({ from: 'pool' }, { kind: 'gap', index });
    }
    return started().shuffledOrder;
  };

  const gap = (position: number) =>
    screen.getByRole('button', { name: `Put it at position ${position}` });

  it('lands the item above everything, between two positions and at the bottom', async () => {
    renderScreen();

    const opener = textOf(started().rankedSlots[0].itemIds[0]);
    const [first, second, third] = started().pendingPool.map(textOf);

    await userEvent.click(gap(1));
    expect(listed()).toEqual([first, opener]);
    expect(inPool()).toHaveTextContent(second);

    await userEvent.click(gap(2));
    expect(listed()).toEqual([first, second, opener]);
    expect(inPool()).toHaveTextContent(third);

    await userEvent.click(gap(4));
    expect(listed()).toEqual([first, second, opener, third]);
    expect(screen.getByText('4 of 4 placed')).toBeInTheDocument();
  });

  // Clicked on the card rather than the rank: a press that never travels is
  // not a drag, so the row still gets it.
  it('ties the item with a position holding one', async () => {
    const [a, b, c, d] = fill(2);
    renderScreen();

    await userEvent.click(screen.getByText(textOf(b)));

    expect(listed()).toEqual([row(a), row(b, d), row(c)]);
    expect(ranks()).toEqual(['1', '2', '4']);
    expect(announced()).toBe(`Tied with ${textOf(b)}.`);
  });

  it('refuses a position holding two, marks it and keeps the item in the pool', async () => {
    const [a, b, c] = fill(1);
    act(() => {
      usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    });
    renderScreen();

    const waiting = started().pendingPool[0];

    await userEvent.click(
      screen.getByRole('button', { name: `Tie it with ${textOf(a)} and ${textOf(c)}` }),
    );

    expect(listed()).toEqual([row(a, c), row(b)]);
    expect(started().pendingPool[0]).toBe(waiting);
    expect(marked()).toEqual([['slot:0', 'rejected']]);
    expect(announced()).toBe('It cannot go there. The list is unchanged.');

    // The red stays only until the next click lands somewhere.
    await userEvent.click(gap(3));
    expect(marked()).toEqual([]);
  });

  it('previews under the mouse what a click would do, and clears on the way out', async () => {
    const [a] = fill(1);
    act(() => {
      usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    });
    renderScreen();

    await userEvent.hover(gap(2));
    expect(marked()).toEqual([['gap:1', 'insert']]);

    await userEvent.hover(screen.getAllByRole('listitem')[3]);
    expect(marked()).toEqual([['slot:1', 'tie']]);

    await userEvent.hover(screen.getByText(textOf(a)));
    expect(marked()).toEqual([['slot:0', 'rejected']]);

    await userEvent.unhover(screen.getByText(textOf(a)));
    expect(marked()).toEqual([]);
  });

  it('disables every target once the pool is empty', () => {
    fill(3);
    renderScreen();

    // The move buttons stay live: reordering goes on after the pool is empty.
    const targets = screen
      .getAllByRole('button')
      .filter((button) => !button.hasAttribute('aria-pressed'));

    expect(targets).toHaveLength(9);
    for (const target of targets) {
      expect(target).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('places one item for a double-click, not two', async () => {
    renderScreen();

    await userEvent.dblClick(gap(1));

    expect(started().pendingPool).toHaveLength(2);
  });

  it('places from the keyboard, with Enter on a gap and Space on a rank', async () => {
    const [a, b, c, d] = fill(1);
    renderScreen();

    gap(3).focus();
    await userEvent.keyboard('{Enter}');
    expect(listed()).toEqual([row(a), row(b), row(c)]);

    screen.getByRole('button', { name: `Tie it with ${textOf(b)}` }).focus();
    await userEvent.keyboard(' ');
    expect(listed()).toEqual([row(a), row(b, d), row(c)]);
  });

  // The pressed button moves down with its row when something lands above it,
  // so the focus goes to where the item went rather than staying put.
  it('moves the focus to the position the item landed in', async () => {
    renderScreen();
    const [first, second] = started().pendingPool.map(textOf);

    gap(1).focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: `Tie it with ${first}` }),
    );

    // Tied onto the focused position, the focus stays with the pair.
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: `Tie it with ${first} and ${second}` }),
    );
  });

  it('keeps the focus on the list when the last item is placed from the keyboard', async () => {
    fill(2);
    renderScreen();

    gap(1).focus();
    await userEvent.keyboard('{Enter}');

    expect(started().pendingPool).toHaveLength(0);
    expect(document.activeElement).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('list')).toContainElement(document.activeElement as HTMLElement);
  });
});

describe('moving a placed item with its move button', () => {
  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
  });

  const fill = (count: number) => {
    const { drop } = usePlacement.getState();
    for (let index = 1; index <= count; index++) {
      drop({ from: 'pool' }, { kind: 'gap', index });
    }
    return started().shuffledOrder;
  };

  const gap = (position: number) =>
    screen.getByRole('button', { name: `Put it at position ${position}` });
  const moveButton = (id: string) => screen.getByRole('button', { name: `Move ${textOf(id)}` });
  const pressed = () =>
    screen
      .queryAllByRole('button', { pressed: true })
      .map((button) => button.getAttribute('aria-label'));

  // The gap indexes are counted on the list as it stands with the item still
  // in it, and the item leaves its own position on the way down, so these are
  // the cases where an off-by-one would show.
  it('moves an item from the middle, the top and the bottom, with the pool already empty', async () => {
    const [a, b, c, d] = fill(3);
    renderScreen();

    await userEvent.click(moveButton(b));
    await userEvent.click(gap(4));
    expect(listed()).toEqual([row(a), row(c), row(b), row(d)]);

    await userEvent.click(moveButton(a));
    await userEvent.click(gap(4));
    expect(listed()).toEqual([row(c), row(b), row(a), row(d)]);

    await userEvent.click(moveButton(d));
    await userEvent.click(gap(1));
    expect(listed()).toEqual([row(d), row(c), row(b), row(a)]);
    expect(pressed()).toEqual([]);
  });

  it('puts the held item down instead of the pool item, and leaves the pool alone', async () => {
    const [a, b] = fill(1);
    renderScreen();
    const waiting = started().pendingPool[0];

    await userEvent.click(moveButton(a));
    expect(inPool()?.className).toMatch(/lifted/);
    expect(screen.getByText(`Choose where ${textOf(a)} goes`)).toBeInTheDocument();

    await userEvent.click(gap(3));

    expect(listed()).toEqual([row(b), row(a)]);
    expect(started().pendingPool[0]).toBe(waiting);
    expect(screen.getByText('2 of 4 placed')).toBeInTheDocument();
    expect(screen.getByText(en.sorting.poolHint)).toBeInTheDocument();
  });

  it('ties the held item with a position holding one', async () => {
    const [a, b, c] = fill(2);
    renderScreen();

    await userEvent.click(moveButton(c));
    await userEvent.click(screen.getByText(textOf(a)));

    expect(listed()).toEqual([row(a, c), row(b)]);
    expect(ranks()).toEqual(['1', '3']);
  });

  it('unties half a pair at once and puts it back on its partner', async () => {
    const [a, b, c, d] = fill(2);
    act(() => {
      usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    });
    renderScreen();
    expect(listed()).toEqual([row(a, d), row(b), row(c)]);

    await userEvent.click(moveButton(d));
    expect(listed()).toEqual([row(a), row(b), row(c)]);
    expect(ranks()).toEqual(['1', '2', '3']);

    await userEvent.click(screen.getByRole('button', { name: `Tie it with ${textOf(a)}` }));
    expect(listed()).toEqual([row(a, d), row(b), row(c)]);
    expect(ranks()).toEqual(['1', '3', '4']);
  });

  it('refuses a position holding two and keeps the item in hand', async () => {
    const [a, b, c, d] = fill(3);
    act(() => {
      usePlacement.getState().drop({ from: 'placed', itemId: b }, { kind: 'slot', index: 0 });
    });
    renderScreen();
    const before = listed();
    expect(before).toEqual([row(a, b), row(c), row(d)]);

    await userEvent.click(moveButton(d));
    await userEvent.click(screen.getByText(textOf(a)));

    expect(listed()).toEqual(before);
    expect(marked()).toEqual([['slot:0', 'rejected']]);
    expect(pressed()).toEqual([`Move ${textOf(d)}`]);

    // Still in hand, so the next tap moves it.
    await userEvent.click(gap(1));
    expect(listed()).toEqual([row(d), row(a, b), row(c)]);
  });

  it('changes nothing when it is put down in either gap beside its own position', async () => {
    const [a, b, c, d] = fill(3);
    renderScreen();

    await userEvent.click(moveButton(b));
    await userEvent.click(gap(2));
    expect(listed()).toEqual([row(a), row(b), row(c), row(d)]);
    expect(pressed()).toEqual([]);

    await userEvent.click(moveButton(b));
    await userEvent.click(gap(3));
    expect(listed()).toEqual([row(a), row(b), row(c), row(d)]);
    expect(pressed()).toEqual([]);
  });

  it('refuses an untied item on its own position', async () => {
    const [a, b, c, d] = fill(3);
    renderScreen();

    await userEvent.click(moveButton(b));
    await userEvent.click(screen.getByText(textOf(b)));

    expect(marked()).toEqual([['slot:1', 'rejected']]);
    expect(pressed()).toEqual([`Move ${textOf(b)}`]);
    expect(listed()).toEqual([row(a), row(b), row(c), row(d)]);
  });

  it('puts the item back with Escape, with the move button again, or by tapping the pool', async () => {
    const [a, b, c, d] = fill(2);
    act(() => {
      usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    });
    renderScreen();
    const before = listed();
    expect(before).toEqual([row(a, d), row(b), row(c)]);
    const waiting = started().pendingPool;

    await userEvent.click(moveButton(d));
    await userEvent.keyboard('{Escape}');
    expect(listed()).toEqual(before);
    expect(pressed()).toEqual([]);

    await userEvent.click(moveButton(b));
    await userEvent.click(moveButton(b));
    expect(listed()).toEqual(before);
    expect(pressed()).toEqual([]);

    await userEvent.click(moveButton(c));
    await userEvent.click(screen.getByText(en.sorting.allPlaced));
    expect(listed()).toEqual(before);
    expect(pressed()).toEqual([]);

    expect(started().pendingPool).toEqual(waiting);
  });

  it('hands the next tap back to the pool item once released', async () => {
    const [a, b] = fill(1);
    renderScreen();
    const [next] = started().pendingPool;

    await userEvent.click(moveButton(a));
    await userEvent.click(inPool() as HTMLElement);
    await userEvent.click(gap(1));

    expect(listed()).toEqual([row(next), row(a), row(b)]);
  });

  it('drops what was held for a tap as soon as a drag starts', async () => {
    const [a] = fill(1);
    renderScreen();

    await userEvent.click(moveButton(a));
    pickUp('pool');

    expect(pressed()).toEqual([]);
  });

  it('picks up only once for a double-click', async () => {
    const [a] = fill(3);
    renderScreen();

    await userEvent.dblClick(moveButton(a));

    expect(pressed()).toEqual([`Move ${textOf(a)}`]);
  });

  it('hands over to another item when its move button is pressed while one is held', async () => {
    const [a, b] = fill(3);
    renderScreen();

    await userEvent.click(moveButton(a));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await userEvent.click(moveButton(b));

    expect(pressed()).toEqual([`Move ${textOf(b)}`]);
    expect(announced()).toBe(`Moving ${textOf(b)}. Choose where it goes.`);
    expect(screen.getByText(`Choose where ${textOf(b)} goes`)).toBeInTheDocument();

    await userEvent.click(gap(1));
    expect(listed()[0]).toBe(row(b));
  });

  // The preview is worked out for what is in hand, not for the pool item: the
  // pair is refused either way, but the held item's own position is refused
  // only because it is the one being moved.
  it('previews under the mouse what putting the held item down would do', async () => {
    const [a, b, c, d] = fill(3);
    act(() => {
      usePlacement.getState().drop({ from: 'placed', itemId: b }, { kind: 'slot', index: 0 });
    });
    renderScreen();
    expect(listed()).toEqual([row(a, b), row(c), row(d)]);

    await userEvent.click(moveButton(d));

    await userEvent.hover(screen.getByText(textOf(a)));
    expect(marked()).toEqual([['slot:0', 'rejected']]);

    await userEvent.hover(screen.getByText(textOf(c)));
    expect(marked()).toEqual([['slot:1', 'tie']]);

    await userEvent.hover(screen.getByText(textOf(d)));
    expect(marked()).toEqual([['slot:2', 'rejected']]);

    await userEvent.hover(gap(1));
    expect(marked()).toEqual([['gap:0', 'insert']]);
  });

  it('reads the tap wording in Spanish', async () => {
    const [a] = fill(3);
    const i18n = createI18n();
    await i18n.changeLanguage('es');
    render(
      <I18nextProvider i18n={i18n}>
        <SortingScreen />
      </I18nextProvider>,
    );
    const mover = () => screen.getByRole('button', { name: `Mover ${textOf(a)}` });

    await userEvent.click(mover());
    expect(announced()).toBe(`Moviendo ${textOf(a)}. Elige dónde va.`);
    expect(screen.getByText(`Elige dónde va ${textOf(a)}`)).toBeInTheDocument();

    await new Promise((resolve) => setTimeout(resolve, 300));
    await userEvent.keyboard('{Escape}');
    expect(announced()).toBe(`${textOf(a)} se queda donde estaba. La lista sigue igual.`);

    await new Promise((resolve) => setTimeout(resolve, 300));
    await userEvent.click(mover());
    await new Promise((resolve) => setTimeout(resolve, 300));
    await userEvent.click(screen.getByRole('button', { name: 'Ponerlo en la posición 5' }));
    expect(announced()).toBe('Movido a la posición 4.');
  });

  describe('where the focus goes', () => {
    it('stays on the button that picked the item up, and follows the item once it lands', async () => {
      const [a] = fill(3);
      renderScreen();

      moveButton(a).focus();
      await userEvent.keyboard('{Enter}');
      expect(document.activeElement).toBe(moveButton(a));

      gap(5).focus();
      await userEvent.keyboard('{Enter}');
      expect(document.activeElement).toBe(moveButton(a));
    });

    // Its button left the list with it, so it has to be found again in the
    // render that puts the item down.
    it('follows half a pair to its move button once it lands in a gap', async () => {
      const [a, b, c, d] = fill(2);
      act(() => {
        usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index: 0 });
      });
      renderScreen();

      moveButton(d).focus();
      await userEvent.keyboard('{Enter}');
      expect(listed()).toEqual([row(a), row(b), row(c)]);

      gap(4).focus();
      await userEvent.keyboard('{Enter}');

      expect(listed()).toEqual([row(a), row(b), row(c), row(d)]);
      expect(document.activeElement).toBe(moveButton(d));
    });

    it('goes back to the move button after Escape', async () => {
      const [a] = fill(3);
      renderScreen();

      moveButton(a).focus();
      await userEvent.keyboard('{Enter}');
      gap(3).focus();
      await userEvent.keyboard('{Escape}');

      expect(document.activeElement).toBe(moveButton(a));
    });

    // Half a pair leaves the list when it is held, and its button with it.
    it("lands on the partner's rank when half a pair is picked up, and back on the button after Escape", async () => {
      const [a, , , d] = fill(2);
      act(() => {
        usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index: 0 });
      });
      renderScreen();

      moveButton(d).focus();
      await userEvent.keyboard('{Enter}');
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: `Tie it with ${textOf(a)}` }),
      );

      await userEvent.keyboard('{Escape}');
      expect(document.activeElement).toBe(moveButton(d));
    });
  });

  describe('what it says', () => {
    it('names the item picked up, the partner it leaves and the item put back', async () => {
      const [a, , , d] = fill(2);
      act(() => {
        usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index: 0 });
      });
      renderScreen();

      await userEvent.click(moveButton(d));
      expect(announced()).toBe(`Moving ${textOf(d)}. Only ${textOf(a)} is left in that position.`);

      await new Promise((resolve) => setTimeout(resolve, 300));
      await userEvent.keyboard('{Escape}');
      expect(announced()).toBe(`${textOf(d)} stays where it was. The list is unchanged.`);

      await new Promise((resolve) => setTimeout(resolve, 300));
      await userEvent.click(moveButton(a));
      expect(announced()).toBe(`Moving ${textOf(a)}. Only ${textOf(d)} is left in that position.`);
    });

    it('calls a put-down a move, not a placement', async () => {
      const [a] = fill(3);
      renderScreen();

      await userEvent.click(moveButton(a));
      await new Promise((resolve) => setTimeout(resolve, 300));
      await userEvent.click(gap(5));

      expect(announced()).toBe('Moved to position 4.');
    });
  });
});

// dnd-kit sends the pick-up and the first drop hint a frame apart, and a live
// region read twice in one frame is heard once, so the screen holds each
// message for a beat. These step the clock a beat at a time and read the
// region in between.
describe('what the live region says', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePlacement.getState().start(items, 'Which one do you like more?');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const beat = () =>
    act(() => {
      vi.advanceTimersByTime(250);
    });

  it('keeps the pick-up up until the hint that follows it has waited its turn', () => {
    renderScreen();
    const next = textOf(started().pendingPool[0]);

    pickUp('pool');
    expect(announced()).toBe(`Picked up ${next}.`);

    // Arrives while the pick-up is still being read, so it queues behind it.
    hover('pool', 'gap:0');
    expect(announced()).toBe(`Picked up ${next}.`);

    beat();
    expect(announced()).toBe('Drop to put it at position 1.');
  });

  it('says who is left holding the position when half a tie is picked up', () => {
    const { drop } = usePlacement.getState();
    drop({ from: 'pool' }, { kind: 'gap', index: 1 });
    drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    renderScreen();

    // The ids come back as a one-or-two tuple, and the pair is what this case
    // is about, so it stops here rather than reading past the end.
    const ids = started().rankedSlots[0].itemIds;
    if (ids.length !== 2) {
      throw new Error('The drops above were supposed to leave a tie in the top position');
    }
    const [first, second] = ids;

    pickUp(`placed:${second}`);
    hover(`placed:${second}`, 'slot:0');

    expect(announced()).toBe(
      `Picked up ${textOf(second)}. Only ${textOf(first)} is left in that position.`,
    );
    beat();
    expect(announced()).toBe(`Drop to tie it with ${textOf(first)}.`);
  });

  it('still just names an untied item on the way up, which leaves nothing behind', () => {
    const { drop } = usePlacement.getState();
    drop({ from: 'pool' }, { kind: 'gap', index: 1 });
    renderScreen();

    const [itemId] = started().rankedSlots[1].itemIds;

    pickUp(`placed:${itemId}`);

    expect(announced()).toBe(`Picked up ${textOf(itemId)}.`);
  });

  // A drag crosses a lot of targets, and a region that read all of them would
  // still be somewhere behind the pointer when the item lands.
  it('skips the positions a fast drag crossed and says where it ended up', () => {
    renderScreen();

    pickUp('pool');
    hover('pool', 'gap:0');
    hover('pool', 'gap:1');
    hover('pool', 'gap:0');

    beat();
    expect(announced()).toBe('Drop to put it at position 1.');

    beat();
    expect(announced()).toBe('Drop to put it at position 1.');
  });

  it('names the partner when a drop ties, rather than calling it a placement', () => {
    renderScreen();
    const [opener] = started().rankedSlots[0].itemIds;

    pickUp('pool');
    hover('pool', 'slot:0');
    letGo('pool', 'slot:0');

    beat();
    beat();
    expect(announced()).toBe(`Tied with ${textOf(opener)}.`);
  });

  // Two clicks on the same gap a while apart are two placements, and both are
  // read, even though the second message is word for word the first.
  it('reads a message again when the next one says the same thing', async () => {
    vi.useRealTimers();
    renderScreen();
    const region = document.querySelector('[data-announcer]');
    if (!region) {
      throw new Error('The screen rendered no live region');
    }
    const gap = () => screen.getByRole('button', { name: 'Put it at position 1' });

    await userEvent.click(gap());
    await new Promise((resolve) => setTimeout(resolve, 300));
    const first = region.firstElementChild;

    await userEvent.click(gap());

    expect(announced()).toBe('Placed at position 1.');
    expect(region.firstElementChild).not.toBe(first);
  });

  it('tells a drop over nothing from a cancelled drag', () => {
    renderScreen();

    pickUp('pool');
    letGo('pool', null);
    beat();
    expect(announced()).toBe('Dropped outside the list. The list is unchanged.');

    pickUp('pool');
    cancel('pool');
    beat();
    beat();
    expect(announced()).toBe('Drag cancelled. The list is unchanged.');
  });

  // The item was let go on a position, not off the end of the list, and being
  // told it landed outside would send the user looking in the wrong place.
  it('says a refused drop was refused rather than dropped outside', () => {
    const { drop } = usePlacement.getState();
    drop({ from: 'pool' }, { kind: 'gap', index: 1 });
    drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    renderScreen();

    pickUp('pool');
    hover('pool', 'slot:0');
    letGo('pool', 'slot:0');

    beat();
    expect(announced()).toBe('It cannot be dropped there. The list is unchanged.');
  });

  // dnd-kit renders a region of its own whether or not anything is put in it,
  // and left to its own devices it fills that one with ids while this one is
  // reading item names. Checked through the config rather than the DOM: the
  // handlers here are called directly, so its pipeline never runs in a test.
  it('leaves dnd-kit with nothing to say of its own', () => {
    renderScreen();

    const theirs = dnd.props.accessibility?.announcements;
    const event = { active: { id: 'pool' }, over: null } as unknown as DragEndEvent;

    expect(theirs).toBeDefined();
    expect(theirs?.onDragStart(event)).toBeUndefined();
    expect(theirs?.onDragOver(event)).toBeUndefined();
    expect(theirs?.onDragEnd(event)).toBeUndefined();
    expect(theirs?.onDragCancel(event)).toBeUndefined();
  });
});

describe('what the list shows once something is put down', () => {
  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
    motion.calls = [];
  });

  // The position each animation was asked for, and what it moves: x for a
  // shake, scale for a settle.
  const animated = () =>
    motion.calls.map(({ element, keyframes }) => [
      element.closest('[data-drop-target]')?.getAttribute('data-drop-target'),
      Object.keys(keyframes),
    ]);

  const gap = (position: number) =>
    screen.getByRole('button', { name: `Put it at position ${position}` });

  const bursts = () =>
    [...document.querySelectorAll<HTMLElement>('[data-burst]')].map((burst) => [
      burst.closest('[data-drop-target]')?.getAttribute('data-drop-target'),
      burst.dataset.burst,
    ]);

  it('bursts on the position an item was placed in', async () => {
    renderScreen();

    await userEvent.click(gap(2));

    expect(bursts()).toEqual([['slot:1', 'insert']]);
  });

  it('bursts differently for a tie', async () => {
    renderScreen();

    const [opener] = started().rankedSlots[0].itemIds;
    await userEvent.click(screen.getByText(textOf(opener)));

    expect(bursts()).toEqual([['slot:0', 'tie']]);
  });

  it('bursts for a drop the same as for a tap', () => {
    renderScreen();

    pickUp('pool');
    letGo('pool', 'gap:0');

    expect(bursts()).toEqual([['slot:0', 'insert']]);
  });

  it('does not burst for a refused item', async () => {
    const { drop } = usePlacement.getState();
    drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    renderScreen();

    const pair = started().rankedSlots[0].itemIds.map(textOf).join(' and ');
    await userEvent.click(screen.getByRole('button', { name: `Tie it with ${pair}` }));

    expect(announced()).toBe('It cannot go there. The list is unchanged.');
    expect(bursts()).toEqual([]);
  });

  // The second item lands on the same position the first one did, and a
  // burst left over from the first would just stay there without playing.
  it('bursts again for a second placement in the same spot', async () => {
    renderScreen();

    await userEvent.click(gap(1));
    const first = document.querySelector('[data-burst]');
    expect(first).not.toBeNull();
    await userEvent.click(gap(1));
    const second = document.querySelector('[data-burst]');

    expect(bursts()).toEqual([['slot:0', 'insert']]);
    expect(second).not.toBe(first);
  });

  // Half a tie picked up remounts the position it leaves, and the burst that
  // tie got would play a second time.
  it('lets go of the last burst once something is picked up', async () => {
    renderScreen();

    await userEvent.click(gap(1));
    expect(bursts()).toHaveLength(1);
    const [placed] = started().rankedSlots[0].itemIds;
    pickUp(`placed:${placed}`);

    expect(bursts()).toEqual([]);
  });

  it('settles the position an item landed in', async () => {
    renderScreen();

    await userEvent.click(gap(2));

    expect(animated()).toEqual([['slot:1', ['scale']]]);
  });

  it('shakes a position that turns a tap away', async () => {
    const { drop } = usePlacement.getState();
    drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    renderScreen();

    const pair = started().rankedSlots[0].itemIds.map(textOf).join(' and ');
    await userEvent.click(screen.getByRole('button', { name: `Tie it with ${pair}` }));

    expect(animated()).toEqual([['slot:0', ['x']]]);
  });

  it('shakes a position that turns a drag away', () => {
    const { drop } = usePlacement.getState();
    drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    renderScreen();

    pickUp('pool');
    letGo('pool', 'slot:0');

    expect(animated()).toEqual([['slot:0', ['x']]]);
  });

  it('lets go of the last burst once the move button picks something up', async () => {
    renderScreen();

    await userEvent.click(gap(1));
    expect(bursts()).toHaveLength(1);
    const [placed] = started().rankedSlots[0].itemIds;
    await userEvent.click(screen.getByRole('button', { name: `Move ${textOf(placed)}` }));

    expect(bursts()).toEqual([]);
  });

  it('flies a refused drop back and lets a landed one stay', () => {
    const { drop } = usePlacement.getState();
    drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    renderScreen();

    pickUp('pool');
    letGo('pool', 'slot:0');
    expect(dnd.overlay.dropAnimation).not.toBeNull();

    pickUp('pool');
    letGo('pool', 'gap:0');
    expect(dnd.overlay.dropAnimation).toBeNull();
  });

  it('flies the item back when it is let go outside the list or the drag is cancelled', () => {
    renderScreen();

    pickUp('pool');
    letGo('pool', null);
    expect(dnd.overlay.dropAnimation).not.toBeNull();

    pickUp('pool');
    letGo('pool', 'gap:0');
    pickUp('pool');
    cancel('pool');
    expect(dnd.overlay.dropAnimation).not.toBeNull();
  });
});

describe('what it sounds like', () => {
  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
    sounds.play.mockClear();
    sounds.preload.mockClear();
  });

  const played = () => sounds.play.mock.calls.map(([name]) => name);

  it('fetches the sounds on arrival, before anything asks for one', () => {
    renderScreen();

    expect(sounds.preload).toHaveBeenCalledTimes(1);
    expect(played()).toEqual([]);
  });

  const gap = (position: number) =>
    screen.getByRole('button', { name: `Put it at position ${position}` });

  const pairUp = () => {
    usePlacement.getState().drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    return started().rankedSlots[0].itemIds.map(textOf).join(' and ');
  };

  it('picks up with a sound, by drag and by the move button', async () => {
    renderScreen();

    pickUp('pool');
    letGo('pool', 'gap:0');
    const [placed] = started().rankedSlots[0].itemIds;
    await userEvent.click(screen.getByRole('button', { name: `Move ${textOf(placed)}` }));

    expect(played()).toEqual(['pickup', 'drop', 'pickup']);
  });

  it('plays the drop sound for a drop and for a tap into a gap', async () => {
    renderScreen();

    pickUp('pool');
    letGo('pool', 'gap:1');
    await userEvent.click(gap(1));

    expect(played()).toEqual(['pickup', 'drop', 'drop']);
  });

  it('sounds a tie apart from a placement, by drag and by tap', async () => {
    renderScreen();

    pickUp('pool');
    letGo('pool', 'slot:0');
    await userEvent.click(gap(2));
    const [single] = started().rankedSlots[1].itemIds;
    await userEvent.click(screen.getByRole('button', { name: `Tie it with ${textOf(single)}` }));

    expect(played()).toEqual(['pickup', 'tie', 'drop', 'tie']);
  });

  it('plays the error sound when a pair turns the item away', async () => {
    const pair = pairUp();
    renderScreen();

    await userEvent.click(screen.getByRole('button', { name: `Tie it with ${pair}` }));
    pickUp('pool');
    letGo('pool', 'slot:0');

    expect(played()).toEqual(['error', 'pickup', 'error']);
  });

  it('counts a drop over nothing as an error', () => {
    renderScreen();

    pickUp('pool');
    letGo('pool', null);

    expect(played()).toEqual(['pickup', 'error']);
  });

  it('stays quiet when a held item is put back or a drag is cancelled', async () => {
    renderScreen();

    const [opener] = started().rankedSlots[0].itemIds;
    const move = screen.getByRole('button', { name: `Move ${textOf(opener)}` });
    await userEvent.click(move);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(move);
    await userEvent.click(move);
    pickUp('pool');
    cancel('pool');

    expect(played()).toEqual(['pickup', 'pickup', 'pickup']);
  });
});

describe('on a phone-wide screen', () => {
  // Stands in for the browser's media query, with a way to cross the
  // breakpoint while the screen is up. Only the width is ever asked about:
  // Framer Motion asks after reduced motion too, but once per file, and the
  // first test in here has long since answered it.
  const screenWidth = (mobile: boolean) => {
    const listeners = new Set<() => void>();
    let matches = mobile;
    window.matchMedia = (query: string) =>
      ({
        get matches() {
          return matches;
        },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList;

    return (next: boolean) => {
      matches = next;
      act(() => listeners.forEach((listener) => listener()));
    };
  };

  beforeEach(() => {
    usePlacement.getState().start(items, 'Which one do you like more?');
  });

  const gap = (position: number) =>
    screen.getByRole('button', { name: `Put it at position ${position}` });
  const handles = () => [...document.querySelectorAll('[data-drag-id]')];

  it('starts no drag and leaves every card free to scroll the page', () => {
    screenWidth(true);
    renderScreen();

    expect(dnd.props.sensors).toEqual([]);
    expect(handles()).toHaveLength(2);
    for (const handle of handles()) {
      expect(handle.className).not.toMatch(/draggable/);
    }
  });

  it('puts the pool above the list', () => {
    screenWidth(true);
    renderScreen();

    const pool = inPool() as HTMLElement;
    const list = screen.getByRole('list');

    expect(pool.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no preview under the mouse', async () => {
    screenWidth(true);
    renderScreen();

    await userEvent.hover(gap(1));

    expect(marked()).toEqual([]);
  });

  it('sorts the whole list by tapping alone', async () => {
    screenWidth(true);
    renderScreen();

    const [opener] = started().rankedSlots[0].itemIds;
    const [first, second, third] = started().pendingPool;

    await userEvent.click(gap(1));
    await userEvent.click(screen.getByText(textOf(opener)));
    await userEvent.click(gap(3));
    expect(listed()).toEqual([row(first), row(opener, second), row(third)]);

    // Half the pair goes to the top, and the rest closes up behind it.
    await userEvent.click(screen.getByRole('button', { name: `Move ${textOf(second)}` }));
    await userEvent.click(gap(1));

    expect(listed()).toEqual([row(second), row(first), row(opener), row(third)]);
    expect(screen.getByText('4 of 4 placed')).toBeInTheDocument();
  });

  it('refuses a tap on a position holding two and marks it until the next tap', async () => {
    screenWidth(true);
    const { drop } = usePlacement.getState();
    act(() => {
      drop({ from: 'pool' }, { kind: 'gap', index: 1 });
      drop({ from: 'pool' }, { kind: 'slot', index: 0 });
    });
    renderScreen();
    const before = listed();
    const [waiting] = started().pendingPool;
    const [a, c] = started().rankedSlots[0].itemIds.map(textOf);

    await userEvent.click(screen.getByRole('button', { name: `Tie it with ${a} and ${c}` }));

    expect(listed()).toEqual(before);
    expect(started().pendingPool[0]).toBe(waiting);
    expect(marked()).toEqual([['slot:0', 'rejected']]);

    await userEvent.click(gap(3));
    expect(marked()).toEqual([]);
  });

  it('puts a held item back with Escape or a tap on the pool', async () => {
    screenWidth(true);
    renderScreen();
    await userEvent.click(gap(1));
    const before = listed();
    const [first, second] = started().rankedSlots.map(({ itemIds }) => textOf(itemIds[0]));
    const pressed = () => screen.queryAllByRole('button', { pressed: true });

    await userEvent.click(screen.getByRole('button', { name: `Move ${first}` }));
    await userEvent.keyboard('{Escape}');
    expect(pressed()).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: `Move ${second}` }));
    await userEvent.click(inPool() as HTMLElement);
    expect(pressed()).toEqual([]);

    expect(listed()).toEqual(before);
    expect(started().pendingPool).toHaveLength(2);
  });

  it('keeps both methods on a desktop-wide screen', async () => {
    screenWidth(false);
    renderScreen();

    expect(dnd.props.sensors).toHaveLength(1);
    for (const handle of handles()) {
      expect(handle.className).toMatch(/draggable/);
    }

    await userEvent.hover(gap(1));
    expect(marked()).toEqual([['gap:0', 'insert']]);
  });

  it('switches mode when the screen crosses the breakpoint', () => {
    const resize = screenWidth(false);
    renderScreen();

    resize(true);
    expect(dnd.props.sensors).toEqual([]);
    expect(inPool()?.className).not.toMatch(/draggable/);

    resize(false);
    expect(dnd.props.sensors).toHaveLength(1);
    expect(inPool()?.className).toMatch(/draggable/);
  });
});
