// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const positions = () =>
  screen
    .getAllByRole('listitem')
    .filter((row) => parseDropTarget(row.getAttribute('data-drop-target') ?? '')?.kind === 'slot');

// A position row opens with its rank and ends with the container holding its
// cards, so neither of these has to match on what is in between.
const listed = () => positions().map((row) => row.lastElementChild?.textContent);
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
