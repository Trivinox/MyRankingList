import { useEffect, useRef, useState } from 'react';
import type { Participant } from '../room/hostRoom.ts';
import { removeParticipant } from '../room/session.ts';

// The creator's side of taking someone out: who the prompt is asking about,
// and where the focus goes once they are gone. Their row, their Remove button
// and the prompt all leave together, and the focus would be left on the page.
// Finishing without someone is the same removal, asked about someone away for
// too long, and `overdue` says who still is.
export function useRemoval(participants: Participant[], overdue: string[] = []) {
  const [removing, setRemoving] = useState<{ id: string; finishing: boolean } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const list = useRef<HTMLUListElement>(null);
  // Set on confirming, with no id when there is no Remove button left to land on.
  const landing = useRef<{ id?: string } | null>(null);

  // Gone already if they left while the creator was making up their mind, and
  // no longer someone to finish without if they came back meanwhile.
  const target = participants.find(
    (p) => p.id === removing?.id && (!removing.finishing || overdue.includes(p.id)),
  );
  // Kept for later, the question would pop back up by itself if they went
  // away again.
  if (removing && !target) setRemoving(null);

  useEffect(() => {
    if (landing.current === null) return;
    const { id } = landing.current;
    const button = id === undefined ? undefined : buttons.current.get(id);
    landing.current = null;
    (button ?? list.current)?.focus();
  }, [participants, removing]);

  const confirm = () => {
    if (!target) return;
    const place = participants.indexOf(target);
    const removable = (p: Participant) => !p.isCreator;
    const neighbour =
      participants.slice(place + 1).find(removable) ??
      participants.slice(0, place).reverse().find(removable);
    landing.current = { id: neighbour?.id };
    removeParticipant(target.id);
    setRemoving(null);
  };

  const buttonRef = (id: string) => (button: HTMLButtonElement | null) => {
    if (button) buttons.current.set(id, button);
    else buttons.current.delete(id);
  };

  return {
    target,
    finishing: removing?.finishing ?? false,
    ask: (id: string, finishing = false) => setRemoving({ id, finishing }),
    cancel: () => setRemoving(null),
    confirm,
    buttonRef,
    list,
  };
}
