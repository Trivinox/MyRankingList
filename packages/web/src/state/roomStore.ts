import { create } from 'zustand';
import type { Item } from '../core/types.ts';
import type { Participant } from '../room/hostRoom.ts';

export type Role = 'host' | 'guest';

// Idle is no room at all, the state before creating or joining and after
// leaving. Sorting starts for everyone at once, when the creator says so, and
// reconnecting is a guest still sorting while their way back to the host is
// found again. Closed is a room that ended under a guest, removed a guest the
// creator took out, and replaced a tab whose place another tab took over.
// Whichever it was, they still have to see it happened before going back.
export type RoomStatus =
  'idle' | 'connecting' | 'lobby' | 'sorting' | 'reconnecting' | 'closed' | 'removed' | 'replaced';

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
  // The host's alone: ids of those away long enough to be finished without.
  overdue: string[];
  connect: (role: Role) => void;
  enterLobby: (room: {
    code: string;
    you: string;
    criterion: string;
    participants: Participant[];
    items?: Item[];
  }) => void;
  setParticipants: (participants: Participant[]) => void;
  setOverdue: (overdue: string[]) => void;
  startSorting: (items: Item[]) => void;
  reconnect: (room?: { code: string; you: string }) => void;
  resume: (room: {
    you: string;
    criterion: string;
    participants: Participant[];
    items: Item[];
  }) => void;
  fail: (error: RoomError) => void;
  close: () => void;
  remove: () => void;
  replace: () => void;
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
} satisfies Partial<Room>;

// The session writes here straight from its PeerJS callbacks, which run
// outside React, and the screens only read.
export const useRoom = create<Room>((set) => ({
  ...empty,

  // A second try starts clean, without the error that sent the user back.
  connect: (role) => set({ ...empty, role, status: 'connecting' }),

  enterLobby: (room) => set({ ...room, status: 'lobby', error: null }),

  setParticipants: (participants) => set({ participants }),

  setOverdue: (overdue) => set({ overdue }),

  startSorting: (items) => set({ items, status: 'sorting' }),

  // Mid-sort everything else stays as it was. After a reload there is nothing
  // yet but what the tab kept, until the host answers.
  reconnect: (room) => set({ ...room, status: 'reconnecting' }),

  resume: (room) => set({ ...room, status: 'sorting', error: null }),

  // A failed attempt leaves no room behind, only the reason on the entry screen.
  fail: (error) => set({ ...empty, error }),

  close: () => set({ status: 'closed' }),

  remove: () => set({ status: 'removed' }),

  replace: () => set({ status: 'replaced' }),

  leave: () => set(empty),
}));
