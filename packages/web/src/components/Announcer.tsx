import type { Announcement } from './useAnnouncer.ts';
import hidden from './visuallyHidden.module.css';

export function Announcer({ announcement }: { announcement: Announcement }) {
  return (
    <div
      className={hidden.text}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      data-announcer
    >
      {/* Keyed so a repeated message replaces the node rather than leaving it
          alone, which is the change a screen reader listens for. */}
      <span key={announcement.count}>{announcement.text}</span>
    </div>
  );
}
