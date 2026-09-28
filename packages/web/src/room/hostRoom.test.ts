import { describe, expect, it } from 'vitest';
import type { RankedSlot } from '../core/types.ts';
import {
  ROOM_LIMIT,
  admit,
  coversItems,
  exclude,
  leave,
  markFinished,
  setConnected,
  setProgress,
  startAll,
} from './hostRoom.ts';
import type { Participant } from './hostRoom.ts';

function seat(participants: Participant[], nickname: string, isCreator = false) {
  const admission = admit(participants, nickname, isCreator);
  if (!admission.ok) throw new Error(`${nickname} was refused: ${admission.reason}`);
  return admission;
}

// The creator plus as many guests as it takes to fill the room.
function fullRoom() {
  let participants = seat([], 'Ana', true).participants;
  for (let i = 1; i < ROOM_LIMIT; i++) {
    participants = seat(participants, `Guest ${i}`).participants;
  }
  return participants;
}

describe('admit', () => {
  it('seats the creator first, marked as such', () => {
    const { participant, participants } = seat([], 'Ana', true);

    expect(participant).toMatchObject({
      nickname: 'Ana',
      isCreator: true,
      progress: 0,
      connected: true,
      finished: false,
    });
    expect(participants).toEqual([participant]);
  });

  it('adds a guest after the ones already in, leaving the old list alone', () => {
    const before = seat([], 'Ana', true).participants;

    const { participant, participants } = seat(before, 'Juan');

    expect(participant).toMatchObject({ nickname: 'Juan', isCreator: false });
    expect(participants.map((p) => p.nickname)).toEqual(['Ana', 'Juan']);
    expect(before).toHaveLength(1);
  });

  it('admits the creator and 19 more, then turns the next one away', () => {
    const participants = fullRoom();

    expect(participants).toHaveLength(ROOM_LIMIT);
    expect(admit(participants, 'Late')).toEqual({ ok: false, reason: 'full' });
  });

  it('has space again once someone leaves', () => {
    const participants = fullRoom();

    const after = leave(participants, participants[5].id);

    expect(admit(after, 'Late').ok).toBe(true);
  });

  it('never gives two participants the same id or the same nickname', () => {
    let current = seat([], 'Ana', true).participants;
    for (let i = 0; i < 5; i++) current = seat(current, 'Juan').participants;

    expect(new Set(current.map((p) => p.id)).size).toBe(current.length);
    expect(current.map((p) => p.nickname)).toEqual([
      'Ana',
      'Juan',
      'Juan (2)',
      'Juan (3)',
      'Juan (4)',
      'Juan (5)',
    ]);
  });

  it('refuses a nickname that cannot be used', () => {
    expect(admit([], '  ')).toEqual({ ok: false, reason: 'nickname' });
  });
});

describe('leave', () => {
  it('drops only the one who left', () => {
    const ana = seat([], 'Ana', true);
    const juan = seat(ana.participants, 'Juan');
    const luis = seat(juan.participants, 'Luis');

    expect(leave(luis.participants, juan.participant.id).map((p) => p.nickname)).toEqual([
      'Ana',
      'Luis',
    ]);
  });

  it('changes nothing for an id that is not in the room', () => {
    const { participants } = seat([], 'Ana', true);

    expect(leave(participants, 'someone-else')).toEqual(participants);
  });
});

describe('exclude', () => {
  it('drops the one removed and leaves the rest as they were', () => {
    const ana = seat([], 'Ana', true);
    const juan = seat(ana.participants, 'Juan');
    const started = startAll(seat(juan.participants, 'Luis').participants);

    const after = exclude(started, juan.participant.id);

    expect(after.map((p) => p.nickname)).toEqual(['Ana', 'Luis']);
    expect(after[0]).toBe(started[0]);
    expect(after[1]).toBe(started[2]);
  });

  it('never takes out the creator', () => {
    const ana = seat([], 'Ana', true);
    const { participants } = seat(ana.participants, 'Juan');

    expect(exclude(participants, ana.participant.id)).toEqual(participants);
  });

  it('frees the place of whoever it takes out of a full room', () => {
    const participants = fullRoom();

    expect(admit(exclude(participants, participants[5].id), 'Late').ok).toBe(true);
  });
});

describe('startAll', () => {
  it('puts everyone at 1, the item their list opens with', () => {
    const ana = seat([], 'Ana', true);
    const { participants } = seat(ana.participants, 'Juan');

    expect(startAll(participants).map((p) => [p.nickname, p.progress])).toEqual([
      ['Ana', 1],
      ['Juan', 1],
    ]);
    expect(participants.map((p) => p.progress)).toEqual([0, 0]);
  });

  it('leaves nobody finished, whatever the round before them left', () => {
    const ana = seat([], 'Ana', true);
    const done = markFinished(ana.participants, ana.participant.id);

    expect(startAll(done)[0].finished).toBe(false);
  });
});

describe('setProgress', () => {
  it('changes only the one named, and leaves the others as they were', () => {
    const ana = seat([], 'Ana', true);
    const juan = seat(ana.participants, 'Juan');
    const started = startAll(juan.participants);

    const after = setProgress(started, juan.participant.id, 3);

    expect(after.map((p) => p.progress)).toEqual([1, 3]);
    expect(after[0]).toBe(started[0]);
  });

  it('changes nothing for an id that is not in the room', () => {
    const started = startAll(seat([], 'Ana', true).participants);

    expect(setProgress(started, 'someone-else', 2)).toEqual(started);
  });
});

describe('setConnected', () => {
  it('marks only the one named, keeping their count', () => {
    const ana = seat([], 'Ana', true);
    const juan = seat(ana.participants, 'Juan');
    const placed = setProgress(startAll(juan.participants), juan.participant.id, 3);

    const away = setConnected(placed, juan.participant.id, false);

    expect(away[1]).toMatchObject({ connected: false, progress: 3 });
    expect(away[0]).toBe(placed[0]);
    expect(setConnected(away, juan.participant.id, true)[1]).toEqual(placed[1]);
  });
});

describe('markFinished', () => {
  it('marks only the one named, keeping everything else about them', () => {
    const ana = seat([], 'Ana', true);
    const juan = seat(ana.participants, 'Juan');
    const placed = setProgress(startAll(juan.participants), juan.participant.id, 3);

    const after = markFinished(placed, juan.participant.id);

    expect(after[1]).toEqual({ ...placed[1], finished: true });
    expect(after[0]).toBe(placed[0]);
  });
});

describe('coversItems', () => {
  const items = [
    { id: 'a', text: 'Udon' },
    { id: 'b', text: 'Soba' },
    { id: 'c', text: 'Ramen' },
  ];

  it('takes every item once, ties included, in any order', () => {
    expect(coversItems([{ itemIds: ['c'] }, { itemIds: ['a', 'b'] }], items)).toBe(true);
  });

  it.each<[string, RankedSlot[]]>([
    ['one missing', [{ itemIds: ['a'] }, { itemIds: ['b'] }]],
    ['one extra', [{ itemIds: ['a'] }, { itemIds: ['b'] }, { itemIds: ['c', 'd'] }]],
    ['one repeated', [{ itemIds: ['a', 'b'] }, { itemIds: ['b'] }]],
    [
      'one repeated in place of another',
      [{ itemIds: ['a'] }, { itemIds: ['a'] }, { itemIds: ['c'] }],
    ],
    ['nothing at all', []],
  ])('refuses a list with %s', (_, slots) => {
    expect(coversItems(slots, items)).toBe(false);
  });
});
