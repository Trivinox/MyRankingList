import { useTranslation } from 'react-i18next';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import { ParticipantAvatar } from './ParticipantAvatar.tsx';
import { RemovalPrompt } from './RemovalPrompt.tsx';
import { useRemoval } from './useRemoval.ts';
import styles from './RoomProgress.module.css';

// How far along everyone in the room is. Counts only: what anyone else has put
// where never reaches this browser.
export function RoomProgress() {
  const { t } = useTranslation();
  const { role, participants, you, status } = useRoom();
  const total = usePlacement((state) => state.items.length);
  const removal = useRemoval(participants);

  if (status !== 'sorting') return null;

  return (
    <div className={styles.progress}>
      <ul ref={removal.list} className={styles.strip} aria-label={t('room.everyone')} tabIndex={-1}>
        {participants.map((participant, place) => (
          <li key={participant.id} className={styles.person}>
            <ParticipantAvatar
              participant={participant}
              place={place}
              isYou={participant.id === you}
              total={total}
              stacked
            />
            {/* A cross on the circle's corner. The word would add a line
                under every name and make the row taller on a phone. */}
            {role === 'host' && !participant.isCreator && (
              <button
                ref={removal.buttonRef(participant.id)}
                type="button"
                className={styles.remove}
                aria-label={t('room.remove.label', { nickname: participant.nickname })}
                title={t('room.remove.label', { nickname: participant.nickname })}
                onClick={() => removal.ask(participant.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {removal.target && (
        <RemovalPrompt
          key={removal.target.id}
          nickname={removal.target.nickname}
          onRemove={removal.confirm}
          onCancel={removal.cancel}
        />
      )}
    </div>
  );
}
