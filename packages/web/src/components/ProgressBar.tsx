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
      >
        <div className={styles.fill} style={{ width: `${(placed / total) * 100}%` }} />
      </div>
      <span className={styles.count}>{label}</span>
    </div>
  );
}
