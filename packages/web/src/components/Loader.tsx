import styles from './Loader.module.css';

// Hidden from screen readers: it always sits beside a line that already says
// what is being waited for.
export function Loader() {
  return (
    <span className={styles.loader} aria-hidden="true">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </span>
  );
}
