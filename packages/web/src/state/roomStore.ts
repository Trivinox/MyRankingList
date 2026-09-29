import { create } from 'zustand';
import type { Item } from '../core/types.ts';
import type { Participant } from '../room/hostRoom.ts';
import type { RoomResult } from '../room/result.ts';

export type Role = 'host' | 'guest';

// Idle is no room at all, the state before creating or joining and after
// leaving. Sorting starts for everyone at once, when the creator says so, and
// reconnecting is a guest still sorting while their way back to the host is
// found again. Revealed is everyone's lists in and the result out, and
// preparing a guest waiting after it while the creator writes the list for
// another round. The creator stays revealed meanwhile: the room is still the
// one that result belongs to until the next round starts.
//
// The rest is a room over for a guest, who still has to see why before going
// back: closed by the creator, ended with the host gone without a word,
// removed by the creator, replaced by another tab that took over the place, or
// missed, the room having started another round while they were away.
export type RoomStatus =
  | 'idle'
  | 'connecting'
  | 'lobby'
  | 'sorting'
  | 'reconnecting'
  | 'revealed'
  | 'preparing'
  | 'closed'
  | 'ended'
  | 'removed'
  | 'replaced'
  | 'missed';

export const isOver = (status: RoomStatus) =>
  status === 'closed' ||
  status === 'ended' ||
  status === 'removed' ||
  status === 'replaced' ||
  status === 'missed';

export type RoomError =
  | { kind: 'not-found' }
  | { kind: 'rate-limited'; retryAfter: number }
  | { kind: 'full' }
  | { kind: 'started' }
  | { kind: 'unreachable' };

interface Room {
  role: Role | null;
  code: string | null;
  you: string | null;
  participants: Participant[];
  criterion: string;
  // The host's copy of the list, taken when the room opened. Guests have none
  // until sorting starts.
  items: Item[];
  status: RoomStatus;
  error: RoomError | null;
  // Only ever filled on the host: ids of those away long enough to be
  // finished without.
  overdue: string[];
  // Kept once revealed, whatever happens to the room after it: a room that
  // closes then takes nothing away from what everyone is looking at.
  result: RoomResult | null;
  connect: (role: Role) => void;
  enterLobby: (room: {
    code: string;
    you: string;
    criterion: string;
    participants: Participant[];
    items?: Item[];
  }) => void;
  setParticipants: (participants: Participant[]) => void;
  setCode: (code: string) => void;
  setOverdue: (overdue: string[]) => void;
  startSorting: (items: Item[], criterion: string) => void;
  reveal: (result: RoomResult) => void;
  prepare: () => void;
  reconnect: (room?: { code: string; you: string; items: Item[] }) => void;
  resume: (room: {
    you: string;
    criterion: string;
    participants: Participant[];
    items: Item[];
  }) => void;
  fail: (error: RoomError) => void;
  close: () => void;
  end: () => void;
  remove: () => void;
  replace: () => void;
  miss: () => void;
  leave: () => void;
}

const empty = {
  role: null,
  code: null,
  you: null,
  participants: [],
  criterion: '',
  items: [],
  status: 'idle',
  error: null,
  overdue: [],
  result: null,
} satisfies Partial<Room>;

// The session writes here straight from its PeerJS callbacks, which run
// outside React, and the screens only read.
export const useRoom = create<Room>((set) => ({
  ...empty,

  // A second try starts clean, without the error that sent the user back.
  connect: (role) => set({ ...empty, role, status: 'connecting' }),

  enterLobby: (room) => set({ ...room, status: 'lobby', error: null }),

  setParticipants: (participants) => set({ participants }),

  setCode: (code) => set({ code }),

  setOverdue: (overdue) => set({ overdue }),

  // Every round, the first one too. The result of the one before goes: it
  // belongs to a list nobody is sorting any more.
  startSorting: (items, criterion) => set({ items, criterion, status: 'sorting', result: null }),

  reveal: (result) => set({ result, status: 'revealed' }),

  prepare: () => set({ status: 'preparing' }),

  // Mid-sort everything else stays as it was. After a reload there is nothing
  // yet but what the tab kept, until the host answers.
  reconnect: (room) => set({ ...room, status: 'reconnecting' }),

  resume: (room) => set({ ...room, status: 'sorting', error: null }),

  // A failed attempt leaves no room behind, only the reason on the entry screen.
  fail: (error) => set({ ...empty, error }),

  close: () => set({ status: 'closed' }),

  end: () => set({ status: 'ended' }),

  remove: () => set({ status: 'removed' }),

  replace: () => set({ status: 'replaced' }),

  miss: () => set({ status: 'missed' }),

  leave: () => set(empty),
}));
