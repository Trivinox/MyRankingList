import { useCallback, useEffect, useRef, useState } from 'react';

// A screen reader reads whatever the live region holds at the moment it is told
// the region changed, so two messages landing in the same frame are heard as
// one, and dnd-kit sends exactly that: the pick-up, then the first drop hint
// once it has worked out what is under the cursor. Each message is held for a
// beat so the one before it stays its own notification. Long enough to separate
// them, short enough that the hints keep up with the pointer.
const beat = 250;

export function useAnnouncer(hold: number = beat) {
  const [announcement, setAnnouncement] = useState('');
  // Only ever one message waiting. A region that has fallen behind should say
  // where the drag is now, not read out every position it crossed on the way.
  const waiting = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const next = useCallback(() => {
    const message = waiting.current;
    waiting.current = undefined;
    if (message === undefined) {
      timer.current = undefined;
      return;
    }
    setAnnouncement(message);
    timer.current = setTimeout(next, hold);
  }, [hold]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const say = useCallback(
    (message: string | undefined) => {
      if (!message) {
        return;
      }
      waiting.current = message;
      if (!timer.current) {
        next();
      }
    },
    [next],
  );

  return { announcement, say };
}
