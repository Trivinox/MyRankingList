import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  placed: number;
  total: number;
}

export function ProgressBar({ placed, total }: ProgressBarProps) {
  const { t } = useTranslation();
  const label = t('sorting.progress', { placed, total });

  return (
    <div className={styles.progress}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={placed}
        // Counted from zero so the announced percentage matches the fill. The
        // opener is already down, so a run opens at 1 rather than empty.
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuetext={label}
        // The rocket and the fill both work their position out from this in
        // CSS, since the rocket's own width has to come off the distance.
        style={{ '--progress': placed / total } as CSSProperties}
      >
        <div className={styles.rail}>
          <div className={styles.fill} />
        </div>
        <svg className={styles.flag} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="2" width="2.6" height="20" rx="1.3" />
          <path d="M8.5 3.5h10.3c.9 0 1.4 1 .8 1.7L16.8 8.5l2.8 3.3c.6.7.1 1.7-.8 1.7H8.5z" />
        </svg>
        <svg className={styles.rocket} viewBox="0 0 24 24" aria-hidden="true">
          <path
            className={styles.flame}
            d="M5 9.6 1.6 11c-.8.4-.8 1.6 0 2L5 14.4c.6.2 1-.2 1-.8V10.4c0-.6-.4-1-1-.8z"
          />
          <path d="M8 8.8 5.8 3.9c-.3-.7.3-1.4 1-1.1l5.9 3zM8 15.2l-2.2 4.9c-.3.7.3 1.4 1 1.1l5.9-3z" />
          <path d="M5.5 12c0-2.8 3.9-6.3 10.2-6.3 3.3 0 5.9 3.1 7 5.5.3.5.3 1.1 0 1.6-1.1 2.4-3.7 5.5-7 5.5C9.4 18.3 5.5 14.8 5.5 12z" />
          <circle className={styles.window} cx="15.5" cy="12" r="2.3" />
        </svg>
      </div>
      <span className={styles.count}>{label}</span>
    </div>
  );
}
