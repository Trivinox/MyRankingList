const ENDPOINT = '/api/validate-image';
const TIMEOUT_MS = 8000;

const answers = new Map<string, Promise<boolean | null>>();

// True when the server saw an image at the address, false when it saw
// something else, and null when it could not say: no function behind the path
// (vite dev, offline), a cold start that ran out the clock, a reply that is not
// ours. The form treats null as no news, since the placeholder covers a broken
// image whatever the check thought of it.
async function ask(url: string): Promise<boolean | null> {
  try {
    const response = await fetch(`${ENDPOINT}?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    // Vite's preview answers an unknown path with index.html and a 200.
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'ok' in body && typeof body.ok === 'boolean') {
      return body.ok;
    }
    return null;
  } catch {
    return null;
  }
}

// One question per address for the life of the page. A rebuilt form or an
// edit that lands back on a link already checked costs nothing, though a
// null is not kept: the next try may find the endpoint awake.
export function probeImage(url: string): Promise<boolean | null> {
  let answer = answers.get(url);
  if (!answer) {
    answer = ask(url);
    answers.set(url, answer);
    void answer.then((result) => {
      if (result === null) answers.delete(url);
    });
  }
  return answer;
}
