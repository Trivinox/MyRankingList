import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Participant } from '../room/hostRoom.ts';
import styles from './ParticipantAvatar.module.css';

// Literal pastels until the design system gives them names. Handed out by
// place in the room, so two people next to each other never share one.
const tints = ['#b7a8e8', '#f6b8c4', '#ffd6a5', '#a8dcc8', '#a9c8ee', '#f3d98b'];

interface ParticipantAvatarProps {
  participant: Participant;
  // Where they sit in the room, for the tint.
  place: number;
  isYou: boolean;
  // The length of the list. Unknown in the lobby, where nobody has one yet and
  // the ring stays empty.
  total?: number;
  // Circle above the name, for a row of avatars side by side.
  stacked?: boolean;
}

export function ParticipantAvatar({
  participant,
  place,
  isYou,
  total,
  stacked = false,
}: ParticipantAvatarProps) {
  const { t } = useTranslation();
  const { nickname, progress, isCreator } = participant;
  const fill = total ? Math.min(progress / total, 1) : 0;
  // Array.from so an initial made of two UTF-16 units, an emoji say, is not
  // cut in half.
  const initial = Array.from(nickname.trim())[0]?.toUpperCase() ?? '?';

  // With a total the circle says everything about the person in one label,
  // and the name next to it would only read the same thing a second time.
  const labelled = total !== undefined;
  // A second tag under a stacked name made the whole row twice as tall, and
  // who opened the room matters less once everyone is sorting.
  const markCreator = isCreator && !stacked;

  return (
    <span className={stacked ? `${styles.avatar} ${styles.stacked}` : styles.avatar}>
      <span
        className={styles.badge}
        style={{ '--tint': tints[place % tints.length] } as CSSProperties}
        role={labelled ? 'img' : undefined}
        aria-label={labelled ? t('room.placed', { nickname, placed: progress, total }) : undefined}
        aria-hidden={labelled ? undefined : true}
      >
        <svg className={styles.ring} viewBox="0 0 36 36" aria-hidden="true">
          <circle className={styles.track} cx="18" cy="18" r="16" />
          <circle
            className={styles.fill}
            cx="18"
            cy="18"
            r="16"
            pathLength={1}
            strokeDasharray={`${fill} 1`}
          />
        </svg>
        <span className={styles.initial}>{initial}</span>
      </span>
      <span className={styles.nickname} aria-hidden={labelled || undefined}>
        {nickname}
      </span>
      {(isYou || markCreator) && (
        <span className={styles.tags}>
          {isYou && <span className={styles.tag}>{t('room.lobby.you')}</span>}
          {markCreator && <span className={styles.tag}>{t('room.lobby.creator')}</span>}
        </span>
      )}
    </span>
  );
}
