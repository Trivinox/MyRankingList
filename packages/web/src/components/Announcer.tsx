import hidden from './visuallyHidden.module.css';

export function Announcer({ announcement }: { announcement: string }) {
  return (
    <div
      className={hidden.text}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      data-announcer
    >
      {announcement}
    </div>
  );
}
