import styles from './Announcer.module.css';

export function Announcer({ announcement }: { announcement: string }) {
  return (
    <div
      className={styles.region}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      data-announcer
    >
      {announcement}
    </div>
  );
}
