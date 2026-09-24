import { create } from 'zustand';
import type { Item } from '../core/types.ts';
import type { Participant } from '../room/hostRoom.ts';

export type Role = 'host' | 'guest';

// Idle is no room at all, the state before creating or joining and after
// leaving. Sorting starts for everyone at once, when the creator says so.
// Closed is a room that ended under a guest, who still has to see it happened
// before going back.
export type RoomStatus = 'idle' | 'connecting' | 'lobby' | 'sorting' | 'closed';

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
  connect: (role: Role) => void;
  enterLobby: (room: {
    code: string;
    you: string;
    criterion: string;
    participants: Participant[];
    items?: Item[];
  }) => void;
  setParticipants: (participants: Participant[]) => void;
  startSorting: (items: Item[]) => void;
  fail: (error: RoomError) => void;
  close: () => void;
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
} satisfies Partial<Room>;

// The session writes here straight from its PeerJS callbacks, which run
// outside React, and the screens only read.
export const useRoom = create<Room>((set) => ({
  ...empty,

  // A second try starts clean, without the error that sent the user back.
  connect: (role) => set({ ...empty, role, status: 'connecting' }),

  enterLobby: (room) => set({ ...room, status: 'lobby', error: null }),

  setParticipants: (participants) => set({ participants }),

  startSorting: (items) => set({ items, status: 'sorting' }),

  // A failed attempt leaves no room behind, only the reason on the entry screen.
  fail: (error) => set({ ...empty, error }),

  close: () => set({ status: 'closed' }),

  leave: () => set(empty),
}));
