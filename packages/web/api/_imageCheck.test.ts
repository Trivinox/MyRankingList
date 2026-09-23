import { describe, expect, it, vi } from 'vitest';
import { isImageContentType, isPrivateAddress, publicLookup, verifyImage } from './_imageCheck.ts';
import type { Probe, ProbeResult } from './_imageCheck.ts';

const png: ProbeResult = { status: 200, contentType: 'image/png' };

// Answers each URL from a table, so a test can set up a whole redirect chain.
const serving =
  (pages: Record<string, ProbeResult>): Probe =>
  async (url) => {
    const page = pages[url.href];
    if (!page) throw new Error(`nothing at ${url.href}`);
    return page;
  };

describe('isPrivateAddress', () => {
  it('refuses the IPv4 ranges the spec names', () => {
    for (const address of [
      '127.0.0.1',
      '127.255.255.254',
      '169.254.169.254',
      '10.0.0.1',
      '10.255.255.255',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '192.168.255.255',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('refuses the neighbours a server also keeps to itself', () => {
    for (const address of ['0.0.0.0', '100.64.0.1', '100.127.255.255', '198.18.0.1', '224.0.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('stops exactly at the edge of each range', () => {
    for (const address of ['172.15.255.255', '172.32.0.1', '100.63.255.255', '169.253.0.1']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('takes public addresses', () => {
    for (const address of ['8.8.8.8', '151.101.1.69', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('refuses IPv6 loopback, unspecified, unique local, link-local and multicast', () => {
    for (const address of [
      '::1',
      '::',
      '0:0:0:0:0:0:0:1',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('sees through IPv4 wrapped in IPv6, in dotted and hex form', () => {
    for (const address of [
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::ffff:169.254.169.254',
      '::ffff:a00:1',
      '::127.0.0.1',
      '64:ff9b::7f00:1',
      '2002:7f00:1::',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
    expect(isPrivateAddress('64:ff9b::808:808')).toBe(false);
  });

  it('refuses what is not an address', () => {
    expect(isPrivateAddress('localhost')).toBe(true);
    expect(isPrivateAddress('')).toBe(true);
  });
});

describe('isImageContentType', () => {
  it('takes the image types the extension list stands for', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      expect(isImageContentType(type), type).toBe(true);
    }
  });

  it('ignores parameters and case', () => {
    expect(isImageContentType('Image/PNG; charset=binary')).toBe(true);
  });

  it('turns down svg, html and the rest', () => {
    for (const type of ['image/svg+xml', 'text/html', 'application/octet-stream', 'image/']) {
      expect(isImageContentType(type), type).toBe(false);
    }
  });

  it('turns down a response with no type', () => {
    expect(isImageContentType(undefined)).toBe(false);
  });
});

describe('verifyImage', () => {
  it('accepts an image on a public host', async () => {
    const probe = serving({ 'https://example.com/a.png': png });

    expect(await verifyImage('https://example.com/a.png', probe)).toEqual({ ok: true });
  });

  it('never calls out for a link the client rule already turns down', async () => {
    const probe = vi.fn<Probe>();

    for (const url of ['http://example.com/a.png', 'https://example.com/a.svg', 'not a url']) {
      expect(await verifyImage(url, probe)).toEqual({ ok: false, reason: 'url' });
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it('turns down a very long link', async () => {
    const probe = vi.fn<Probe>();
    const url = `https://example.com/${'a'.repeat(2100)}.png`;

    expect(await verifyImage(url, probe)).toEqual({ ok: false, reason: 'url' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('refuses a private address typed into the link before any request goes out', async () => {
    const probe = vi.fn<Probe>();

    for (const host of ['127.0.0.1', '169.254.169.254', '10.1.2.3', '[::1]', '[::ffff:7f00:1]']) {
      const verdict = await verifyImage(`https://${host}/a.png`, probe);
      expect(verdict, host).toEqual({ ok: false, reason: 'private' });
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it('refuses the alternative spellings of loopback', async () => {
    const probe = vi.fn<Probe>();

    // The URL parser turns both into 127.0.0.1.
    for (const host of ['2130706433', '0x7f.1']) {
      const verdict = await verifyImage(`https://${host}/a.png`, probe);
      expect(verdict, host).toEqual({ ok: false, reason: 'private' });
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it('refuses html served under a png path', async () => {
    const probe = serving({
      'https://example.com/a.png': { status: 200, contentType: 'text/html; charset=utf-8' },
    });

    expect(await verifyImage('https://example.com/a.png', probe)).toEqual({
      ok: false,
      reason: 'not-image',
    });
  });

  it('refuses svg served under a png path', async () => {
    const probe = serving({
      'https://example.com/a.png': { status: 200, contentType: 'image/svg+xml' },
    });

    expect((await verifyImage('https://example.com/a.png', probe)).ok).toBe(false);
  });

  it('refuses a response with no Content-Type', async () => {
    const probe = serving({ 'https://example.com/a.png': { status: 200 } });

    expect((await verifyImage('https://example.com/a.png', probe)).ok).toBe(false);
  });

  it('refuses an error page that happens to say image/png', async () => {
    const probe = serving({
      'https://example.com/a.png': { status: 404, contentType: 'image/png' },
    });

    expect((await verifyImage('https://example.com/a.png', probe)).ok).toBe(false);
  });

  it('reports a host that cannot be reached', async () => {
    expect(await verifyImage('https://example.com/a.png', serving({}))).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('falls back to a GET when the server will not answer a HEAD', async () => {
    const methods: string[] = [];
    const probe: Probe = async (_url, method) => {
      methods.push(method);
      return method === 'HEAD' ? { status: 405 } : { status: 206, contentType: 'image/jpeg' };
    };

    expect(await verifyImage('https://example.com/a.jpg', probe)).toEqual({ ok: true });
    expect(methods).toEqual(['HEAD', 'GET']);
  });

  it('follows a redirect and judges the last response', async () => {
    const probe = serving({
      'https://example.com/a.png': { status: 302, location: 'https://cdn.example.net/photo' },
      'https://cdn.example.net/photo': png,
    });

    expect(await verifyImage('https://example.com/a.png', probe)).toEqual({ ok: true });
  });

  it('resolves a relative redirect against the address that sent it', async () => {
    const probe = serving({
      'https://example.com/a.png': { status: 301, location: '/img/a.png' },
      'https://example.com/img/a.png': png,
    });

    expect(await verifyImage('https://example.com/a.png', probe)).toEqual({ ok: true });
  });

  it('refuses a redirect into a private address, and never requests it', async () => {
    const probe = vi.fn<Probe>(
      serving({
        'https://example.com/a.png': {
          status: 302,
          location: 'https://169.254.169.254/latest/meta-data.png',
        },
      }),
    );

    expect(await verifyImage('https://example.com/a.png', probe)).toEqual({
      ok: false,
      reason: 'private',
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect down to plain http', async () => {
    const probe = serving({
      'https://example.com/a.png': { status: 302, location: 'http://example.com/a.png' },
    });

    expect(await verifyImage('https://example.com/a.png', probe)).toEqual({
      ok: false,
      reason: 'private',
    });
  });

  it('gives up on a chain of redirects that does not end', async () => {
    const probe: Probe = async () => ({ status: 302, location: 'https://example.com/again' });

    expect(await verifyImage('https://example.com/a.png', probe)).toEqual({
      ok: false,
      reason: 'redirects',
    });
  });
});

describe('publicLookup', () => {
  const answering = (...addresses: string[]) =>
    vi.fn(
      (
        _hostname: string,
        done: (error: null, found: { address: string; family: number }[]) => void,
      ) =>
        done(
          null,
          addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
        ),
    );

  it('hands back the addresses of a public host', () => {
    const done = vi.fn();
    publicLookup(answering('93.184.216.34'))('example.com', { all: true }, done);

    expect(done).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
  });

  it('hands back a single address when that is what was asked for', () => {
    const done = vi.fn();
    publicLookup(answering('93.184.216.34'))('example.com', {}, done);

    expect(done).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  });

  it('refuses a name that resolves to a private address', () => {
    const done = vi.fn();
    publicLookup(answering('127.0.0.1'))('localhost', { all: true }, done);

    expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('refuses a name when even one of its addresses is private', () => {
    const done = vi.fn();
    publicLookup(answering('93.184.216.34', '10.0.0.5'))('mixed.example', { all: true }, done);

    expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('passes a failed lookup on as it came', () => {
    const failure = new Error('ENOTFOUND') as NodeJS.ErrnoException;
    const done = vi.fn();
    publicLookup((_hostname, callback) => callback(failure, []))('nowhere.example', {}, done);

    expect(done.mock.calls[0][0]).toBe(failure);
  });
});
