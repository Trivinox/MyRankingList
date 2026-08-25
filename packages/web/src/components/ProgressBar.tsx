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
        // The opener is already down when the screen appears, so a run never
        // starts from zero.
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuetext={label}
      >
        <div className={styles.fill} style={{ width: `${(placed / total) * 100}%` }} />
      </div>
      <span className={styles.count}>{label}</span>
    </div>
  );
}
