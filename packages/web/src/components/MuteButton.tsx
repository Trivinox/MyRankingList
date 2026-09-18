import { useTranslation } from 'react-i18next';
import { useSound } from '../state/soundStore.ts';
import styles from './MuteButton.module.css';

// One name in both states: a toggle button that renamed itself would be read
// out as "Unmute sounds, pressed", which says the opposite of what it does.
// The pressed state carries the setting, and the icon shows it.
export function MuteButton() {
  const { t } = useTranslation();
  const { muted, toggleMuted } = useSound();

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={t('sound.mute')}
      aria-pressed={muted}
      onClick={toggleMuted}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10a1.5 1.5 0 0 1 1.5-1.5H7l4.4-3.6c.7-.5 1.6 0 1.6.8v12.6c0 .8-.9 1.3-1.6.8L7 15.5H4.5A1.5 1.5 0 0 1 3 14z" />
        {muted ? (
          <path className={styles.stroke} d="m16.5 9.5 5 5m0-5-5 5" />
        ) : (
          <path className={styles.stroke} d="M16 9a4.2 4.2 0 0 1 0 6m2.8-8.8a8 8 0 0 1 0 11.6" />
        )}
      </svg>
    </button>
  );
}
