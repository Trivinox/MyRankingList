import { describe, expect, it } from 'vitest';
import { ROOM_LIMIT, admit, leave } from './hostRoom.ts';
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

    expect(participant).toMatchObject({ nickname: 'Ana', isCreator: true });
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
