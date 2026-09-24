export type OpenedRoom =
  { kind: 'opened'; code: string } | { kind: 'refused' } | { kind: 'unreachable' };

export type FoundRoom =
  | { kind: 'found'; peerId: string }
  | { kind: 'not-found' }
  | { kind: 'rate-limited'; retryAfter: number }
  | { kind: 'unreachable' };

export const GOOGLE_STUN: RTCIceServer = { urls: 'stun:stun.l.google.com:19302' };

function isIceServer(entry: unknown): entry is RTCIceServer {
  if (typeof entry !== 'object' || entry === null) return false;
  const { urls, username, credential } = entry as Record<string, unknown>;
  return (
    typeof urls === 'string' &&
    (username === undefined || typeof username === 'string') &&
    (credential === undefined || typeof credential === 'string')
  );
}

// Anything that is not an answer this server gives counts as not reaching it:
// a failed request, a proxy's error page, Vite's index.html for a path it does
// not know.
async function stringField(response: Response, field: string): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !(field in body)) return null;
    const value = (body as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

// The tests pass their own `fetch` and answer for the server.
export function createSignaling(baseUrl: string, fetcher: typeof fetch = fetch) {
  async function request(path: string, init?: RequestInit) {
    try {
      return await fetcher(`${baseUrl}${path}`, init);
    } catch {
      return null;
    }
  }

  return {
    // The server only gives a code to a peer it has connected: the Peer has to
    // be open before this is asked. A 409 or a 503 is the server saying no,
    // which is not the same as the server being gone.
    async openRoom(peerId: string): Promise<OpenedRoom> {
      const response = await request('/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId }),
      });
      if (response?.status === 409 || response?.status === 503) return { kind: 'refused' };
      if (response?.status !== 201) return { kind: 'unreachable' };
      const code = await stringField(response, 'code');
      return code === null ? { kind: 'unreachable' } : { kind: 'opened', code };
    },

    async findRoom(code: string): Promise<FoundRoom> {
      const response = await request(`/rooms/${encodeURIComponent(code)}`);
      if (response?.status === 404) return { kind: 'not-found' };
      if (response?.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        return retryAfter > 0 ? { kind: 'rate-limited', retryAfter } : { kind: 'unreachable' };
      }
      if (response?.status !== 200) return { kind: 'unreachable' };
      const peerId = await stringField(response, 'peerId');
      return peerId === null ? { kind: 'unreachable' } : { kind: 'found', peerId };
    },

    // Fails open. A room with STUN alone still connects most people, and the
    // Peer that comes next says for itself whether the server is there.
    async iceServers(): Promise<RTCIceServer[]> {
      const response = await request('/ice-servers');
      if (response?.status !== 200) return [GOOGLE_STUN];
      try {
        const body: unknown = await response.json();
        const list = (body as { iceServers?: unknown } | null)?.iceServers;
        if (Array.isArray(list) && list.length > 0 && list.every(isIceServer)) return list;
      } catch {
        // Not JSON: the same as no list at all.
      }
      return [GOOGLE_STUN];
    },
  };
}
