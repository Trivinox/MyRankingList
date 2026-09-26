import { useTranslation } from 'react-i18next';
import { INACTIVITY_TIMEOUT_MS } from '../room/hostRoom.ts';
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
  const { role, participants, you, status, overdue } = useRoom();
  const total = usePlacement((state) => state.items.length);
  const removal = useRemoval(participants, overdue);
  const late = participants.filter((p) => role === 'host' && overdue.includes(p.id));

  if (status !== 'sorting' && status !== 'reconnecting') return null;
  // A reloaded tab knows nobody until the host answers, and an empty list
  // would still be read out under its name.
  if (participants.length === 0) return null;

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
      {/* There from the first render, so a notice turning up in it is read
          out: it comes while the creator is busy with their own list. */}
      <div aria-live="polite" className={styles.overdue}>
        {late.map((participant) => (
          <div key={participant.id} className={styles.late}>
            <p className={styles.notice}>
              {t('room.overdue.notice', {
                nickname: participant.nickname,
                count: INACTIVITY_TIMEOUT_MS / 60_000,
              })}
            </p>
            <button
              type="button"
              className={styles.finish}
              onClick={() => removal.ask(participant.id, true)}
            >
              {t('room.overdue.finish', { nickname: participant.nickname })}
            </button>
          </div>
        ))}
      </div>
      {removal.target && (
        <RemovalPrompt
          key={removal.target.id}
          nickname={removal.target.nickname}
          finishing={removal.finishing}
          onRemove={removal.confirm}
          onCancel={removal.cancel}
        />
      )}
    </div>
  );
}
