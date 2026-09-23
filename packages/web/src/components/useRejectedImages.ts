import { useEffect, useState } from 'react';
import { probeImage } from '../core/imageProbe.ts';

// A photo pasted in one go and one typed key by key should cost the same, and
// every keystroke is a different address.
export const PROBE_DELAY = 600;

// The addresses the server says are not images, out of the ones passed in.
// It is keyed by address rather than by row, so editing a link drops its flag
// with no bookkeeping and a row that lands back on a rejected link gets it
// again at once.
export function useRejectedImages(urls: string[]): ReadonlySet<string> {
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set());
  const key = [...new Set(urls)].join('\n');

  useEffect(() => {
    if (key === '') return;
    let stale = false;
    const timer = setTimeout(() => {
      for (const url of key.split('\n')) {
        void probeImage(url).then((ok) => {
          if (ok === false && !stale) {
            setRejected((known) => (known.has(url) ? known : new Set(known).add(url)));
          }
        });
      }
    }, PROBE_DELAY);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [key]);

  return rejected;
}
