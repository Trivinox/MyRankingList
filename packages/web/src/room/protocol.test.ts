import { describe, expect, it } from 'vitest';
import { NICKNAME_LIMIT } from './nicknames.ts';
import { parseGuestMessage, parseHostMessage } from './protocol.ts';

const ana = { id: 'p1', nickname: 'Ana', isCreator: true, progress: 0, connected: true };
const juan = { id: 'p2', nickname: 'Juan', isCreator: false, progress: 0, connected: true };

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
