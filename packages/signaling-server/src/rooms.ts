import { generateRoomCode } from './roomCode.ts';
import type { Pick } from './roomCode.ts';

// Room code to host peer ID and back. The reverse map is what lets a host ask
// twice and get the same code, and lets its disconnect find the code to hold.
export class RoomRegistry {
  private readonly hosts = new Map<string, string>();
  private readonly codes = new Map<string, string>();
  private readonly holds = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly graceMs: number;
  private readonly pick: Pick | undefined;

  constructor({ graceMs, pick }: { graceMs: number; pick?: Pick }) {
    this.graceMs = graceMs;
    this.pick = pick;
  }

  open(peerId: string): string | null {
    const existing = this.codes.get(peerId);
    if (existing !== undefined) return existing;

    const code = generateRoomCode((candidate) => this.hosts.has(candidate), this.pick);
    if (code === null) return null;

    this.hosts.set(code, peerId);
    this.codes.set(peerId, code);
    return code;
  }

  resolve(code: string): string | undefined {
    return this.hosts.get(code);
  }

  // A host's socket drops for reasons that have nothing to do with leaving: a
  // phone freezing the tab in the background, a change of network. Its guests
  // may still be connected to it, so the code keeps resolving for a while in
  // case the same ID comes back.
  hold(peerId: string) {
    if (!this.codes.has(peerId) || this.holds.has(peerId)) return;
    this.holds.set(
      peerId,
      setTimeout(() => this.release(peerId), this.graceMs),
    );
  }

  cancelHold(peerId: string) {
    clearTimeout(this.holds.get(peerId));
    this.holds.delete(peerId);
  }

  clearHolds() {
    for (const timer of this.holds.values()) clearTimeout(timer);
    this.holds.clear();
  }

  private release(peerId: string) {
    this.holds.delete(peerId);
    const code = this.codes.get(peerId);
    if (code === undefined) return;
    this.codes.delete(peerId);
    this.hosts.delete(code);
  }
}
