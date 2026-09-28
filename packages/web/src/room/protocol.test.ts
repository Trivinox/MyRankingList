import { describe, expect, it } from 'vitest';
import { NICKNAME_LIMIT } from './nicknames.ts';
import { parseGuestMessage, parseHostMessage } from './protocol.ts';

const ana = {
  id: 'p1',
  nickname: 'Ana',
  isCreator: true,
  progress: 0,
  connected: true,
  finished: false,
};
const juan = { ...ana, id: 'p2', nickname: 'Juan', isCreator: false };

const items = [
  { id: 'a', text: 'Mango' },
  { id: 'b', text: 'Kiwi', imageUrl: 'https://example.com/kiwi.jpg' },
  { id: 'c', text: 'Peach' },
];

describe('parseGuestMessage', () => {
  it('reads a join', () => {
    expect(parseGuestMessage({ type: 'join', nickname: 'Juan' })).toEqual({
      type: 'join',
      nickname: 'Juan',
    });
  });

  it('keeps nothing but the nickname', () => {
    expect(parseGuestMessage({ type: 'join', nickname: 'Juan', isCreator: true })).toEqual({
      type: 'join',
      nickname: 'Juan',
    });
  });

  it('reads the seat of someone coming back', () => {
    expect(parseGuestMessage({ type: 'join', nickname: 'Juan', seat: 's1' })).toEqual({
      type: 'join',
      nickname: 'Juan',
      seat: 's1',
    });
  });

  it('refuses a nickname longer than the form allows', () => {
    const longest = 'a'.repeat(NICKNAME_LIMIT);

    expect(parseGuestMessage({ type: 'join', nickname: ` ${longest} ` })).not.toBeNull();
    expect(parseGuestMessage({ type: 'join', nickname: `${longest}a` })).toBeNull();
  });

  it('refuses a blank nickname', () => {
    expect(parseGuestMessage({ type: 'join', nickname: '' })).toBeNull();
    expect(parseGuestMessage({ type: 'join', nickname: ' \t ' })).toBeNull();
  });

  it('reads the progress of a guest', () => {
    expect(parseGuestMessage({ type: 'progress', placed: 3 })).toEqual({
      type: 'progress',
      placed: 3,
    });
  });

  it('reads a finished list, ties included', () => {
    const slots = [{ itemIds: ['c'] }, { itemIds: ['a', 'b'] }];

    expect(parseGuestMessage({ type: 'finish', slots })).toEqual({ type: 'finish', slots });
  });

  it('keeps nothing a finished list was not supposed to carry', () => {
    const parsed = parseGuestMessage({
      type: 'finish',
      slots: [{ itemIds: ['a'], rank: 1 }, { itemIds: ['b', 'c'] }],
      placement: {},
    });

    expect(parsed).toEqual({
      type: 'finish',
      slots: [{ itemIds: ['a'] }, { itemIds: ['b', 'c'] }],
    });
  });

  it.each([
    ['a join with no nickname', { type: 'join' }],
    ['a nickname that is not text', { type: 'join', nickname: 7 }],
    ['a seat that is not text', { type: 'join', nickname: 'Juan', seat: 7 }],
    ['a message the host sends', { type: 'full' }],
    ['no items placed', { type: 'progress', placed: 0 }],
    ['part of an item placed', { type: 'progress', placed: 1.5 }],
    ['a negative count', { type: 'progress', placed: -2 }],
    ['a count that is text', { type: 'progress', placed: '3' }],
    ['a progress with no count', { type: 'progress' }],
    ['a finish with no list', { type: 'finish' }],
    ['a finish whose list is not an array', { type: 'finish', slots: { 0: { itemIds: ['a'] } } }],
    ['a finish with a group of three', { type: 'finish', slots: [{ itemIds: ['a', 'b', 'c'] }] }],
    ['a finish with an empty group', { type: 'finish', slots: [{ itemIds: [] }] }],
    ['a finish with an id that is a number', { type: 'finish', slots: [{ itemIds: [1] }] }],
    ['a finish with a group that is a bare id', { type: 'finish', slots: ['a'] }],
    ['a finish with a group that is a bare array', { type: 'finish', slots: [['a']] }],
    ['an unknown type', { type: 'shout', nickname: 'Juan' }],
    ['a string', 'join'],
    ['a number', 42],
    ['null', null],
    ['an array', [{ type: 'join', nickname: 'Juan' }]],
  ])('drops %s', (_, data) => {
    expect(parseGuestMessage(data)).toBeNull();
  });
});

describe('parseHostMessage', () => {
  it('reads a welcome', () => {
    const welcome = {
      type: 'welcome',
      you: 'p2',
      seat: 's2',
      criterion: 'Best fruit',
      participants: [ana, juan],
    };

    expect(parseHostMessage(welcome)).toEqual(welcome);
  });

  it('reads a resume, with the list to sort', () => {
    const resume = {
      type: 'resume',
      you: 'p2',
      seat: 's2',
      criterion: 'Best fruit',
      participants: [
        { ...ana, progress: 2 },
        { ...juan, progress: 1 },
      ],
      items,
    };

    expect(parseHostMessage(resume)).toEqual(resume);
  });

  it('reads someone away, with their count kept', () => {
    const away = { ...juan, progress: 2, connected: false };

    expect(parseHostMessage({ type: 'participants', participants: [ana, away] })).toEqual({
      type: 'participants',
      participants: [ana, away],
    });
  });

  it('reads someone finished, away or not', () => {
    const done = { ...juan, progress: 3, finished: true };
    const participants = [done, { ...done, id: 'p3', connected: false }];

    expect(parseHostMessage({ type: 'participants', participants })).toEqual({
      type: 'participants',
      participants,
    });
  });

  it('reads a new participant list, empty or not', () => {
    expect(parseHostMessage({ type: 'participants', participants: [ana] })).toEqual({
      type: 'participants',
      participants: [ana],
    });
    expect(parseHostMessage({ type: 'participants', participants: [] })).toEqual({
      type: 'participants',
      participants: [],
    });
  });

  it('reads a full room, one that has already started, a removal and a replaced tab', () => {
    expect(parseHostMessage({ type: 'full' })).toEqual({ type: 'full' });
    expect(parseHostMessage({ type: 'started' })).toEqual({ type: 'started' });
    expect(parseHostMessage({ type: 'removed', why: 'x' })).toEqual({ type: 'removed' });
    expect(parseHostMessage({ type: 'replaced', by: 'x' })).toEqual({ type: 'replaced' });
  });

  it('reads the creator closing the room', () => {
    expect(parseHostMessage({ type: 'closed', by: 'x' })).toEqual({ type: 'closed' });
  });

  it('reads a new room code, and only one the server could have handed out', () => {
    expect(parseHostMessage({ type: 'code', code: 'XY7Q', extra: 1 })).toEqual({
      type: 'code',
      code: 'XY7Q',
    });
    expect(parseHostMessage({ type: 'code' })).toBeNull();
    expect(parseHostMessage({ type: 'code', code: 42 })).toBeNull();
    expect(parseHostMessage({ type: 'code', code: 'XY7' })).toBeNull();
    expect(parseHostMessage({ type: 'code', code: 'XY0Q' })).toBeNull();
    expect(parseHostMessage({ type: 'code', code: 'xy7q' })).toBeNull();
    expect(parseHostMessage({ type: 'code', code: ' XY7Q' })).toBeNull();
    expect(parseHostMessage({ type: 'code', code: 'XY7Q&x=1' })).toBeNull();
  });

  it('reads the start of sorting, with the list and the criterion', () => {
    const start = { type: 'start', items, criterion: 'Best fruit' };

    expect(parseHostMessage(start)).toEqual(start);
  });

  it('reads the progress of everyone in the room', () => {
    const participants = [
      { ...ana, progress: 4 },
      { ...juan, progress: 1 },
    ];

    expect(parseHostMessage({ type: 'participants', participants })).toEqual({
      type: 'participants',
      participants,
    });
  });

  // The form only flags a link like these, and the item goes ahead without
  // its picture. The same happens here.
  it.each([
    ['plain http', 'http://example.com/kiwi.jpg'],
    ['an SVG', 'https://example.com/kiwi.svg'],
    ['something that is not a link', 'kiwi'],
  ])('keeps an item whose image is %s, without the image', (_, imageUrl) => {
    const parsed = parseHostMessage({
      type: 'start',
      items: [items[0], { id: 'b', text: 'Kiwi', imageUrl }, items[2]],
      criterion: 'Best fruit',
    });

    expect(parsed).toEqual({
      type: 'start',
      items: [items[0], { id: 'b', text: 'Kiwi' }, items[2]],
      criterion: 'Best fruit',
    });
  });

  it('keeps nothing an item was not supposed to carry', () => {
    const parsed = parseHostMessage({
      type: 'start',
      items: items.map((item) => ({ ...item, html: '<b>x</b>' })),
      criterion: 'Best fruit',
    });

    expect(parsed).toEqual({ type: 'start', items, criterion: 'Best fruit' });
  });

  it('takes an item text of 80 characters and no more', () => {
    const start = (text: string) => ({
      type: 'start',
      items: [{ id: 'a', text }, ...items.slice(1)],
      criterion: 'x',
    });

    expect(parseHostMessage(start('x'.repeat(80)))).not.toBeNull();
    expect(parseHostMessage(start('x'.repeat(81)))).toBeNull();
  });

  it('keeps nothing a participant was not supposed to carry', () => {
    const parsed = parseHostMessage({
      type: 'participants',
      participants: [{ ...juan, peerId: 'b6f1c3d2' }],
    });

    expect(parsed).toEqual({ type: 'participants', participants: [juan] });
  });

  it.each([
    [
      'a welcome with no criterion',
      { type: 'welcome', you: 'p2', seat: 's2', participants: [ana] },
    ],
    [
      'a welcome with no id for the guest',
      { type: 'welcome', seat: 's2', criterion: 'x', participants: [ana] },
    ],
    [
      'a welcome whose id is a number',
      { type: 'welcome', you: 2, seat: 's2', criterion: 'x', participants: [] },
    ],
    ['a welcome with no seat', { type: 'welcome', you: 'p2', criterion: 'x', participants: [ana] }],
    [
      'a resume with no items',
      { type: 'resume', you: 'p2', seat: 's2', criterion: 'x', participants: [ana] },
    ],
    [
      'a resume whose list the form would refuse',
      {
        type: 'resume',
        you: 'p2',
        seat: 's2',
        criterion: 'x',
        participants: [ana],
        items: items.slice(0, 2),
      },
    ],
    [
      'a participant with no connection state',
      {
        type: 'participants',
        participants: [{ id: 'p1', nickname: 'Ana', isCreator: true, progress: 0 }],
      },
    ],
    [
      'a connection state that is text',
      { type: 'participants', participants: [{ ...ana, connected: 'yes' }] },
    ],
    [
      'a participant with no finished state',
      {
        type: 'participants',
        participants: [
          { id: 'p1', nickname: 'Ana', isCreator: true, progress: 0, connected: true },
        ],
      },
    ],
    [
      'a finished state that is text',
      { type: 'participants', participants: [{ ...ana, finished: 'no' }] },
    ],
    ['a list that is not an array', { type: 'participants', participants: { 0: ana } }],
    [
      'a participant with no nickname',
      { type: 'participants', participants: [{ id: 'p1', isCreator: true }] },
    ],
    [
      'a creator flag that is text',
      { type: 'participants', participants: [{ ...ana, isCreator: 'yes' }] },
    ],
    ['a participant that is a string', { type: 'participants', participants: ['Ana'] }],
    [
      'a participant with no progress',
      { type: 'participants', participants: [{ id: 'p1', nickname: 'Ana', isCreator: true }] },
    ],
    [
      'a progress that is not a whole number',
      { type: 'participants', participants: [{ ...ana, progress: 0.5 }] },
    ],
    ['a start with two items', { type: 'start', items: items.slice(0, 2), criterion: 'x' }],
    [
      'a start with a repeated id',
      { type: 'start', items: [...items, { id: 'a', text: 'Plum' }], criterion: 'x' },
    ],
    [
      'a start with a blank item',
      { type: 'start', items: [...items, { id: 'd', text: '  ' }], criterion: 'x' },
    ],
    [
      'a start with an image link that is not text',
      { type: 'start', items: [...items, { id: 'd', text: 'Plum', imageUrl: 7 }], criterion: 'x' },
    ],
    [
      'a start with an item id that is a number',
      { type: 'start', items: [...items, { id: 4, text: 'Plum' }], criterion: 'x' },
    ],
    ['a start with no criterion', { type: 'start', items }],
    ['a start whose items are not an array', { type: 'start', items: { 0: items[0] } }],
    ['a message the guest sends', { type: 'join', nickname: 'Juan' }],
    ['an unknown type', { type: 'kick' }],
    ['no type at all', { participants: [ana] }],
    ['a string', 'full'],
    ['a number', 0],
    ['undefined', undefined],
  ])('drops %s', (_, data) => {
    expect(parseHostMessage(data)).toBeNull();
  });
});

describe('the result', () => {
  const result = {
    consensus: [
      { itemId: 'a', averagePosition: 1.5, rank: 1, tied: true },
      { itemId: 'b', averagePosition: 1.5, rank: 1, tied: true },
      { itemId: 'c', averagePosition: 3, rank: 3, tied: false },
    ],
    discrepancies: [
      { itemId: 'a', dispersion: 0.5 },
      { itemId: 'b', dispersion: 0.5 },
      { itemId: 'c', dispersion: 0 },
    ],
    lists: [
      {
        id: 'p1',
        nickname: 'Ana',
        left: false,
        slots: [{ itemIds: ['a'] }, { itemIds: ['b', 'c'] }],
      },
      {
        id: 'p2',
        nickname: 'Juan',
        left: true,
        slots: [{ itemIds: ['b'] }, { itemIds: ['a'] }, { itemIds: ['c'] }],
      },
    ],
    affinity: [{ a: 'p1', b: 'p2', coefficient: 0.5 }],
  };

  // The message with one part of the result swapped for something else.
  const changed = (part: Partial<Record<keyof typeof result, unknown>>) => ({
    type: 'result',
    result: { ...result, ...part },
  });

  it('reads a result, someone who left and a pair with no value included', () => {
    const noValue = { ...result, affinity: [{ a: 'p1', b: 'p2', coefficient: null }] };

    expect(parseHostMessage({ type: 'result', result })).toEqual({ type: 'result', result });
    expect(parseHostMessage({ type: 'result', result: noValue })).toEqual({
      type: 'result',
      result: noValue,
    });
  });

  it('keeps nothing a result was not supposed to carry', () => {
    const parsed = parseHostMessage({
      type: 'result',
      result: {
        ...result,
        seats: ['s1'],
        lists: result.lists.map((list) => ({ ...list, seat: 's1', progress: 3 })),
        affinity: [{ ...result.affinity[0], nicknames: ['Ana', 'Juan'] }],
      },
    });

    expect(parsed).toEqual({ type: 'result', result });
  });

  it.each([
    ['no consensus', { consensus: undefined }],
    ['a rank of 0', { consensus: [{ ...result.consensus[0], rank: 0 }] }],
    ['a rank that is not whole', { consensus: [{ ...result.consensus[0], rank: 1.5 }] }],
    ['an average that is text', { consensus: [{ ...result.consensus[0], averagePosition: '1' }] }],
    ['a tie that is not true or false', { consensus: [{ ...result.consensus[0], tied: 1 }] }],
    ['a negative dispersion', { discrepancies: [{ itemId: 'a', dispersion: -0.1 }] }],
    ['an endless dispersion', { discrepancies: [{ itemId: 'a', dispersion: Infinity }] }],
    [
      'a list with a group of three',
      { lists: [{ ...result.lists[0], slots: [{ itemIds: ['a', 'b', 'c'] }] }] },
    ],
    ['a list with no nickname', { lists: [{ ...result.lists[0], nickname: undefined }] }],
    ['a list with no mark for leaving', { lists: [{ ...result.lists[0], left: 'no' }] }],
    ['two lists with one id', { lists: [result.lists[0], { ...result.lists[1], id: 'p1' }] }],
    ['a coefficient past 1', { affinity: [{ a: 'p1', b: 'p2', coefficient: 1.2 }] }],
    ['a coefficient that is text', { affinity: [{ a: 'p1', b: 'p2', coefficient: '0.5' }] }],
    ['a pair naming someone with no list', { affinity: [{ a: 'p1', b: 'p9', coefficient: 0.5 }] }],
    ['a list paired with itself', { affinity: [{ a: 'p1', b: 'p1', coefficient: 1 }] }],
  ])('drops a result with %s', (_, part) => {
    expect(parseHostMessage(changed(part))).toBeNull();
  });

  it('drops a result message with no result in it', () => {
    expect(parseHostMessage({ type: 'result' })).toBeNull();
    expect(parseHostMessage({ type: 'result', result: [result] })).toBeNull();
  });
});
