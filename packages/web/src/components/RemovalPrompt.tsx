import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './RemovalPrompt.module.css';

interface RemovalPromptProps {
  nickname: string;
  // Worded for someone away too long instead of for a plain removal.
  finishing?: boolean;
  onRemove: () => void;
  onCancel: () => void;
}

// Asked under the whole list rather than next to the person, since in the
// sorting strip each person is a column too narrow to hold it. The focus comes
// here on its own, landing on the choice that removes nobody, and goes back to
// whichever button opened it when that is the choice made.
export function RemovalPrompt({ nickname, finishing, onRemove, onCancel }: RemovalPromptProps) {
  const { t } = useTranslation();
  const words = finishing ? 'room.overdue' : 'room.remove';
  const promptId = useId();
  const cancelButton = useRef<HTMLButtonElement>(null);
  // Read on the first render, while the button that opened the prompt still
  // has the focus. An effect would run twice in development and find Cancel
  // there the second time.
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  const cancel = () => {
    onCancel();
    if (opener instanceof HTMLElement) opener.focus();
  };

  return (
    <div className={styles.prompt} role="group" aria-labelledby={promptId}>
      <p id={promptId} className={styles.question}>
        {t(`${words}.confirm`, { nickname })}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.remove} onClick={onRemove}>
          {t(`${words}.yes`)}
        </button>
        <button ref={cancelButton} type="button" className={styles.cancel} onClick={cancel}>
          {t('room.remove.no')}
        </button>
      </div>
    </div>
  );
}
