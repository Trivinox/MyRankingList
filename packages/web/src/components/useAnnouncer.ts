import { useCallback, useEffect, useRef, useState } from 'react';

// A screen reader reads whatever the live region holds at the moment it is told
// the region changed, so two messages landing in the same frame are heard as
// one, and dnd-kit sends exactly that: the pick-up, then the first drop hint
// once it has worked out what is under the cursor. Each message is held for a
// beat so the one before it stays its own notification. Long enough to separate
// them, short enough that the hints keep up with the pointer.
const beat = 250;

// The count is there to change even when the text does not. Two clicks on the
// same gap say the same thing twice, and a region whose content never changed
// is not read again.
export interface Announcement {
  text: string;
  count: number;
}

export function useAnnouncer() {
  const [announcement, setAnnouncement] = useState<Announcement>({ text: '', count: 0 });
  const shown = useRef('');
  // Only ever one message waiting. A region that has fallen behind should say
  // where the drag is now, not read out every position it crossed on the way.
  const waiting = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A queued message that matches the one still up is a drag that wandered
  // off a target and came back, and hearing it twice says nothing new. One
  // said with the region idle is a fresh event and is always read.
  const next = useCallback((queued = true) => {
    const message = waiting.current;
    waiting.current = undefined;
    if (message === undefined || (queued && message === shown.current)) {
      timer.current = undefined;
      return;
    }
    shown.current = message;
    setAnnouncement(({ count }) => ({ text: message, count: count + 1 }));
    timer.current = setTimeout(() => next(), beat);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const say = useCallback(
    (message: string | undefined) => {
      if (!message) {
        return;
      }
      waiting.current = message;
      if (!timer.current) {
        next(false);
      }
    },
    [next],
  );

  return { announcement, say };
}
