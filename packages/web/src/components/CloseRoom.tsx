import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './CloseRoom.module.css';

interface CloseRoomProps {
  onClose: () => void;
  // Once anyone has handed a list in, closing also throws those away.
  listsIn?: boolean;
  // After the reveal nobody is sent out: the others keep the result on
  // screen, and what closing takes away is another round.
  revealed?: boolean;
}

// The creator's way out, in the waiting room, while sorting and on the result.
// Leaving takes the room with them, and everyone in it, so it asks first. Like
// the removal prompt, the question opens on the choice that keeps the room,
// and declining puts the focus back on the button.
export function CloseRoom({ onClose, listsIn = false, revealed = false }: CloseRoomProps) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const promptId = useId();
  const warningId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const stayButton = useRef<HTMLButtonElement>(null);
  // Only after a Stay: on the first render nothing was declined, and the
  // button taking the focus would pull the page down to it.
  const declined = useRef(false);

  useEffect(() => {
    if (asking) stayButton.current?.focus();
    else if (declined.current) closeButton.current?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <button
        ref={closeButton}
        type="button"
        className={styles.close}
        onClick={() => setAsking(true)}
      >
        {t('room.lobby.close')}
      </button>
    );
  }

  const stay = () => {
    declined.current = true;
    setAsking(false);
  };

  return (
    <div
      className={styles.prompt}
      role="group"
      aria-labelledby={promptId}
      aria-describedby={listsIn ? warningId : undefined}
    >
      <p id={promptId} className={styles.question}>
        {t(revealed ? 'room.lobby.confirmCloseRevealed' : 'room.lobby.confirmClose')}
      </p>
      {listsIn && (
        <p id={warningId} className={styles.question}>
          {t('room.lobby.confirmCloseLists')}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.confirm} onClick={onClose}>
          {t('room.lobby.confirmYes')}
        </button>
        <button ref={stayButton} type="button" className={styles.close} onClick={stay}>
          {t('room.lobby.confirmNo')}
        </button>
      </div>
    </div>
  );
}
