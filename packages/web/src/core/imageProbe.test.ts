import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeImage } from './imageProbe.ts';

// The answers are kept per address for the life of the module, so each test
// asks about an address of its own.
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('probeImage', () => {
  it('passes on what the server says about the address', async () => {
    const fetcher = vi.fn(() => reply({ ok: true }));
    vi.stubGlobal('fetch', fetcher);

    expect(await probeImage('https://example.com/says-yes.png')).toBe(true);

    vi.stubGlobal('fetch', () => reply({ ok: false }));
    expect(await probeImage('https://example.com/says-no.png')).toBe(false);
  });

  it('sends the address as one encoded query value', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      return reply({ ok: true });
    });

    await probeImage('https://example.com/a.png?size=200&x=1');

    expect(asked).toEqual([
      '/api/validate-image?url=https%3A%2F%2Fexample.com%2Fa.png%3Fsize%3D200%26x%3D1',
    ]);
  });

  it('cannot say when the endpoint is not there', async () => {
    vi.stubGlobal('fetch', () => reply({ error: 'not found' }, 404));

    expect(await probeImage('https://example.com/no-endpoint.png')).toBeNull();
  });

  it('cannot say when the reply is not what the endpoint sends', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('<!doctype html>', { status: 200 })));
    expect(await probeImage('https://example.com/html-reply.png')).toBeNull();

    vi.stubGlobal('fetch', () => reply({ ok: 'yes' }));
    expect(await probeImage('https://example.com/odd-reply.png')).toBeNull();

    vi.stubGlobal('fetch', () => reply(null));
    expect(await probeImage('https://example.com/null-reply.png')).toBeNull();
  });

  it('cannot say when the request fails outright', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));

    expect(await probeImage('https://example.com/offline.png')).toBeNull();
  });

  it('asks once per address', async () => {
    const fetcher = vi.fn(() => reply({ ok: false }));
    vi.stubGlobal('fetch', fetcher);

    const first = probeImage('https://example.com/asked-once.png');
    const second = probeImage('https://example.com/asked-once.png');
    await Promise.all([first, second]);
    await probeImage('https://example.com/asked-once.png');

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('asks again after an answer it could not use', async () => {
    const fetcher = vi.fn(() => reply({ ok: true }));
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await probeImage('https://example.com/second-try.png');

    vi.stubGlobal('fetch', fetcher);

    expect(await probeImage('https://example.com/second-try.png')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
