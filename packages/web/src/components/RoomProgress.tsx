import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { removeParticipant } from '../room/session.ts';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import { ParticipantAvatar } from './ParticipantAvatar.tsx';
import { RemovalPrompt } from './RemovalPrompt.tsx';
import styles from './RoomProgress.module.css';

// How far along everyone in the room is. Counts only: what anyone else has put
// where never reaches this browser.
export function RoomProgress() {
  const { t } = useTranslation();
  const { role, participants, you, status } = useRoom();
  const total = usePlacement((state) => state.items.length);
  const [removing, setRemoving] = useState<string | null>(null);

  if (status !== 'sorting') return null;

  const target = participants.find((p) => p.id === removing);

  return (
    <div className={styles.progress}>
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
            {/* A cross on the circle's corner. The word would add a line
                under every name and make the row taller on a phone. */}
            {role === 'host' && !participant.isCreator && (
              <button
                type="button"
                className={styles.remove}
                aria-label={t('room.remove.label', { nickname: participant.nickname })}
                title={t('room.remove.label', { nickname: participant.nickname })}
                onClick={() => setRemoving(participant.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {target && (
        <RemovalPrompt
          key={target.id}
          nickname={target.nickname}
          onRemove={() => {
            removeParticipant(target.id);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
