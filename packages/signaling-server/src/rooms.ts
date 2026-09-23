import { generateRoomCode } from './roomCode.ts';
import type { Pick } from './roomCode.ts';

// Room code to host peer ID and back. The reverse map is what lets a host ask
// twice and get the same code, and lets its disconnect find the code to free.
export class RoomRegistry {
  private readonly hosts = new Map<string, string>();
  private readonly codes = new Map<string, string>();
  private readonly pick: Pick | undefined;

  constructor(pick?: Pick) {
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

  release(peerId: string) {
    const code = this.codes.get(peerId);
    if (code === undefined) return;
    this.codes.delete(peerId);
    this.hosts.delete(code);
  }
}
