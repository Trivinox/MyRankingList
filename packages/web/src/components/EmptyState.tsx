import { NothingFound } from './Illustration.tsx';
import styles from './EmptyState.module.css';

// Where a screen has nothing to list, and a bare line of text would read as
// something that failed to load.
export function EmptyState({ message }: { message: string }) {
  return (
    <div className={styles.empty}>
      <NothingFound className={styles.art} />
      <p className={styles.message}>{message}</p>
    </div>
  );
}
