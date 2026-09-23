import { request } from 'node:https';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { publicLookup, verifyImage } from './_imageCheck.ts';
import type { Probe } from './_imageCheck.ts';

// One deadline for the whole check, redirects included. It is shorter than the
// eight seconds the form waits for the function, so a slow image host comes
// back as not an image instead of as a function that never answered.
const TIMEOUT_MS = 6000;

const lookup = publicLookup();

function probeWith(signal: AbortSignal): Probe {
  return (url, method) =>
    new Promise((resolve, reject) => {
      const outgoing = request(
        url,
        { method, lookup, signal, headers: method === 'GET' ? { Range: 'bytes=0-0' } : {} },
        (response) => {
          // The headers say all there is to know, and the body may be large.
          response.destroy();
          resolve({
            status: response.statusCode ?? 0,
            location: response.headers.location,
            contentType: response.headers['content-type'],
          });
        },
      );
      outgoing.on('error', reject);
      outgoing.end();
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const url = typeof req.query.url === 'string' ? req.query.url : '';
  const verdict = await verifyImage(url, probeWith(AbortSignal.timeout(TIMEOUT_MS)));

  // Why it failed stays here: telling a private address from a dead host would
  // let anyone map the network behind the function.
  res.status(200).json({ ok: verdict.ok });
}
