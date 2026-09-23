import { describe, expect, it } from 'vitest';
import { NICKNAME_LIMIT } from './nicknames.ts';
import { parseGuestMessage, parseHostMessage } from './protocol.ts';

const ana = { id: 'p1', nickname: 'Ana', isCreator: true };
const juan = { id: 'p2', nickname: 'Juan', isCreator: false };

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

  it('refuses a nickname longer than the form allows', () => {
    const longest = 'a'.repeat(NICKNAME_LIMIT);

    expect(parseGuestMessage({ type: 'join', nickname: ` ${longest} ` })).not.toBeNull();
    expect(parseGuestMessage({ type: 'join', nickname: `${longest}a` })).toBeNull();
  });

  it('refuses a blank nickname', () => {
    expect(parseGuestMessage({ type: 'join', nickname: '' })).toBeNull();
    expect(parseGuestMessage({ type: 'join', nickname: ' \t ' })).toBeNull();
  });

  it.each([
    ['a join with no nickname', { type: 'join' }],
    ['a nickname that is not text', { type: 'join', nickname: 7 }],
    ['a message the host sends', { type: 'full' }],
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
      criterion: 'Best fruit',
      participants: [ana, juan],
    };

    expect(parseHostMessage(welcome)).toEqual(welcome);
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

  it('reads a full room', () => {
    expect(parseHostMessage({ type: 'full' })).toEqual({ type: 'full' });
  });

  it('keeps nothing a participant was not supposed to carry', () => {
    const parsed = parseHostMessage({
      type: 'participants',
      participants: [{ ...juan, peerId: 'b6f1c3d2' }],
    });

    expect(parsed).toEqual({ type: 'participants', participants: [juan] });
  });

  it.each([
    ['a welcome with no criterion', { type: 'welcome', you: 'p2', participants: [ana] }],
    [
      'a welcome with no id for the guest',
      { type: 'welcome', criterion: 'x', participants: [ana] },
    ],
    [
      'a welcome whose id is a number',
      { type: 'welcome', you: 2, criterion: 'x', participants: [] },
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
