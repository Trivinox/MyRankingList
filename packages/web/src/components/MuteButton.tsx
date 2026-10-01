import { SpeakerHighIcon, SpeakerSlashIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useSound } from '../state/soundStore.ts';
import styles from './MuteButton.module.css';

// One name in both states: a toggle button that renamed itself would be read
// out as "Unmute sounds, pressed", which says the opposite of what it does.
// The pressed state carries the setting, and the icon shows it.
export function MuteButton() {
  const { t } = useTranslation();
  const { muted, toggleMuted } = useSound();
  const Speaker = muted ? SpeakerSlashIcon : SpeakerHighIcon;

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={t('sound.mute')}
      aria-pressed={muted}
      onClick={toggleMuted}
    >
      <Speaker className={styles.icon} aria-hidden="true" />
    </button>
  );
}
