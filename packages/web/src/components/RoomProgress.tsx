import { useTranslation } from 'react-i18next';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import { ParticipantAvatar } from './ParticipantAvatar.tsx';
import styles from './RoomProgress.module.css';

// How far along everyone in the room is. Counts only: what anyone else has put
// where never reaches this browser.
export function RoomProgress() {
  const { t } = useTranslation();
  const { participants, you, status } = useRoom();
  const total = usePlacement((state) => state.items.length);

  if (status !== 'sorting') return null;

  return (
    <ul className={styles.strip} aria-label={t('room.everyone')}>
      {participants.map((participant, place) => (
        <li key={participant.id} className={styles.person}>
          <ParticipantAvatar
            participant={participant}
            place={place}
            isYou={participant.id === you}
            total={total}
            stacked
          />
        </li>
      ))}
    </ul>
  );
}
