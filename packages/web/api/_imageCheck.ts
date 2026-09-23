import { lookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { isAllowedImageUrl } from '../src/core/images.ts';

// The underscore keeps Vercel from publishing this file, and its test, as
// endpoints of their own: every other file under api/ becomes a route.

// Same list as the extensions in core/images.ts, as the types a server sends
// for them. SVG stays out for the same reason it does there.
const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

export type ProbeResult = {
  status: number;
  location?: string;
  contentType?: string;
};

// One request, headers only. The handler supplies the real one and the tests a
// fake, so the redirect and fallback rules run without a network.
export type Probe = (url: URL, method: 'HEAD' | 'GET') => Promise<ProbeResult>;

export type Verdict =
  | { ok: true }
  | { ok: false; reason: 'url' | 'private' | 'unreachable' | 'redirects' | 'not-image' };

export function isImageContentType(header: string | undefined): boolean {
  if (header === undefined) return false;
  // "image/png; charset=binary" is still a png.
  const type = header.split(';')[0].trim().toLowerCase();
  return imageTypes.includes(type);
}

function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    // Carrier-grade NAT, which cloud networks use internally.
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    // Multicast and the reserved block above it.
    a >= 224
  );
}

// Eight 16-bit groups, whatever shorthand the address came in.
function ipv6Groups(address: string): number[] {
  let text = address.split('%')[0];

  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [, a, b, c, d] = dotted.map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [head, tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const gap = text.includes('::') ? 8 - left.length - right.length : 0;
  return [...left, ...Array<string>(gap).fill('0'), ...right].map((group) => parseInt(group, 16));
}

function isPrivateIPv6(address: string): boolean {
  const groups = ipv6Groups(address);
  const [first] = groups;
  const embedded = (high: number, low: number) =>
    isPrivateIPv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);

  // :: and ::1.
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] <= 1) return true;
  // Unique local, link-local and multicast.
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || first >> 8 === 0xff) {
    return true;
  }
  // An IPv4 address wearing an IPv6 one, which reaches the same machine:
  // ::ffff:127.0.0.1, the deprecated ::127.0.0.1 and the 64:ff9b:: gateways.
  const zeros = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);
  if (zeros(0, 5) && (groups[5] === 0xffff || groups[5] === 0))
    return embedded(groups[6], groups[7]);
  if (first === 0x64 && groups[1] === 0xff9b && zeros(2, 6)) return embedded(groups[6], groups[7]);
  // 6to4 carries its IPv4 address in the second and third groups.
  if (first === 0x2002) return embedded(groups[1], groups[2]);
  return false;
}

// Anything that is not an address at all is treated as private: the callers
// only ever have a valid one, so this is the answer that fails closed.
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIPv4(address.split('.').map(Number));
  if (version === 6) return isPrivateIPv6(address);
  return true;
}

// A hostname is not an address, so a name is left to publicLookup. An address
// typed straight into the URL never reaches a lookup and is judged here.
function isPrivateLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  return isIP(host) !== 0 && isPrivateAddress(host);
}

type Resolve = (
  hostname: string,
  done: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

const resolveAll: Resolve = (hostname, done) => lookup(hostname, { all: true }, done);

// The lookup the request itself connects through. Checking a name first and
// letting fetch resolve it again would leave a gap for a DNS answer that
// changes in between, so the refusal happens on the very answer that is used.
export function publicLookup(resolve: Resolve = resolveAll): LookupFunction {
  return (hostname, options, done) => {
    resolve(hostname, (error, addresses) => {
      if (error) return done(error, '', 4);
      if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
        return done(new Error(`${hostname} does not resolve to a public address`), '', 4);
      }
      if (options.all) return done(null, addresses);
      done(null, addresses[0].address, addresses[0].family);
    });
  };
}

export async function verifyImage(rawUrl: string, probe: Probe): Promise<Verdict> {
  if (rawUrl.length > MAX_URL_LENGTH || !isAllowedImageUrl(rawUrl)) {
    return { ok: false, reason: 'url' };
  }

  let url = new URL(rawUrl);
  // The extension is only asked of the address the user typed. A CDN may
  // redirect to a path with none, and the Content-Type is what decides.
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    if (url.protocol !== 'https:' || isPrivateLiteral(url.hostname)) {
      return { ok: false, reason: 'private' };
    }

    let response: ProbeResult;
    try {
      response = await probe(url, 'HEAD');
      // Some servers answer HEAD with a 405 or worse and are fine with a GET.
      if (response.status >= 400) response = await probe(url, 'GET');
    } catch {
      return { ok: false, reason: 'unreachable' };
    }

    if (REDIRECT_STATUSES.includes(response.status) && response.location) {
      try {
        url = new URL(response.location, url);
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      continue;
    }

    const isImage =
      response.status >= 200 && response.status < 300 && isImageContentType(response.contentType);
    return isImage ? { ok: true } : { ok: false, reason: 'not-image' };
  }

  return { ok: false, reason: 'redirects' };
}
