import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE_MS, GOOGLE_STUN, createIceServers } from './iceServers.ts';

const metered = { domain: 'example.metered.live', apiKey: 'key/with+symbols' };

// Metered's answer as its documentation shows it, STUN entry included.
const METERED_ANSWER = [
  { urls: 'stun:example.relay.metered.ca:80' },
  { urls: 'turn:example.relay.metered.ca:80', username: 'user', credential: 'pass' },
  { urls: 'turn:example.relay.metered.ca:80?transport=tcp', username: 'user', credential: 'pass' },
  { urls: 'turn:example.relay.metered.ca:443', username: 'user', credential: 'pass' },
];

const TURN = METERED_ANSWER.slice(1);

function answering(...responses: (Response | Error)[]) {
  return vi.fn(async () => {
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    if (next instanceof Error) throw next;
    return next.clone();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createIceServers', () => {
  it('gives STUN alone without Metered, and asks no one', async () => {
    const fetcher = answering(Response.json(METERED_ANSWER));
    const iceServers = createIceServers({ metered: null, fetcher });

    expect(await iceServers()).toEqual([GOOGLE_STUN]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("adds Metered's TURN entries after Google's STUN, and leaves out its STUN", async () => {
    const fetcher = answering(Response.json(METERED_ANSWER));
    const iceServers = createIceServers({ metered, fetcher });

    expect(await iceServers()).toEqual([GOOGLE_STUN, ...TURN]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.metered.live/api/v1/turn/credentials?apiKey=key%2Fwith%2Bsymbols',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('keeps an answer for ten minutes', async () => {
    let time = 0;
    const fetcher = answering(Response.json(METERED_ANSWER));
    const iceServers = createIceServers({ metered, fetcher, now: () => time });

    await iceServers();
    time = CACHE_MS - 1;
    await iceServers();
    expect(fetcher).toHaveBeenCalledTimes(1);

    time = CACHE_MS;
    await iceServers();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('sends one request for rooms that open while it is out', async () => {
    const fetcher = answering(Response.json(METERED_ANSWER));
    const iceServers = createIceServers({ metered, fetcher });

    const [first, second] = await Promise.all([iceServers(), iceServers()]);
    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a failed request', new TypeError('fetch failed')],
    ['a wrong key', Response.json({ error: 'Invalid API Key' }, { status: 401 })],
    ['an answer that is not a list', Response.json({ iceServers: [] })],
    ['a list with no TURN entry', Response.json([{ urls: 'stun:example.relay.metered.ca:80' }])],
    ['a page that is not JSON', new Response('<!doctype html>')],
  ])('falls back to STUN on %s, and asks again next time', async (_, failure) => {
    const fetcher = answering(failure, Response.json(METERED_ANSWER));
    const iceServers = createIceServers({ metered, fetcher });

    expect(await iceServers()).toEqual([GOOGLE_STUN]);
    expect(await iceServers()).toEqual([GOOGLE_STUN, ...TURN]);
  });

  // Waiting out the real 5 seconds would slow the suite, so the timeout's
  // signal is one the test fires itself.
  it('gives up on a Metered that hangs after 5 seconds, and falls back to STUN', async () => {
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const fetcher = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const iceServers = createIceServers({ metered, fetcher });

    const servers = iceServers();
    expect(AbortSignal.timeout).toHaveBeenCalledWith(5000);
    timeout.abort(new DOMException('The operation timed out', 'TimeoutError'));

    expect(await servers).toEqual([GOOGLE_STUN]);
  });

  it('drops an entry without its credentials', async () => {
    const fetcher = answering(
      Response.json([
        { urls: 'turn:example.relay.metered.ca:80', username: 'user' },
        { urls: 'turn:example.relay.metered.ca:443', username: 'user', credential: 'pass', x: 1 },
      ]),
    );
    const iceServers = createIceServers({ metered, fetcher });

    expect(await iceServers()).toEqual([
      GOOGLE_STUN,
      { urls: 'turn:example.relay.metered.ca:443', username: 'user', credential: 'pass' },
    ]);
  });
});
