import type { Metered } from './config.ts';

export type IceServer = { urls: string; username?: string; credential?: string };

export const GOOGLE_STUN: IceServer = { urls: 'stun:stun.l.google.com:19302' };

// The credentials an app lists on Metered do not expire, so a room created
// ten minutes after the last request can reuse its answer.
export const CACHE_MS = 10 * 60 * 1000;

// The client waits for this list before it creates its Peer. A Metered that
// hangs should cost a room its TURN servers, not the room itself.
const METERED_TIMEOUT_MS = 5000;

function isTurn(entry: unknown): entry is Required<IceServer> {
  if (typeof entry !== 'object' || entry === null) return false;
  const { urls, username, credential } = entry as Record<string, unknown>;
  return (
    typeof urls === 'string' &&
    /^turns?:/.test(urls) &&
    typeof username === 'string' &&
    typeof credential === 'string'
  );
}

// Metered's answer carries a STUN server of its own as well. Only its TURN
// entries are kept: Google's STUN already does that job, and Firefox warns
// once a page passes five or more STUN and TURN servers.
async function fetchTurn(metered: Metered, fetcher: typeof fetch) {
  const url = `https://${metered.domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(metered.apiKey)}`;
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(METERED_TIMEOUT_MS) });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return null;
    const turn = body.filter(isTurn).map(({ urls, username, credential }) => ({
      urls,
      username,
      credential,
    }));
    return turn.length > 0 ? turn : null;
  } catch {
    return null;
  }
}

// Never rejects. Without Metered, or when it fails, rooms get STUN alone, and
// a failure is not kept, so the next room asks again.
export function createIceServers({
  metered,
  fetcher = fetch,
  now = Date.now,
}: {
  metered: Metered | null;
  fetcher?: typeof fetch;
  now?: () => number;
}): () => Promise<IceServer[]> {
  let cached: { until: number; servers: Promise<IceServer[]> } | null = null;

  return () => {
    if (metered === null) return Promise.resolve([GOOGLE_STUN]);
    const time = now();
    if (cached && time < cached.until) return cached.servers;

    // Rooms that open while the request is out share it.
    const servers = fetchTurn(metered, fetcher).then((turn) => {
      if (turn === null && cached?.servers === servers) cached = null;
      return [GOOGLE_STUN, ...(turn ?? [])];
    });
    cached = { until: time + CACHE_MS, servers };
    return servers;
  };
}
