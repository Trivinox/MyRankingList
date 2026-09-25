import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ROOM_LIMIT, START_MINIMUM } from '../room/hostRoom.ts';
import { forgetRoomLink, roomLink } from '../room/link.ts';
import { leaveRoom, startRoom } from '../room/session.ts';
import { useRoom } from '../state/roomStore.ts';
import { useScreen } from '../state/screenStore.ts';
import { Announcer } from './Announcer.tsx';
import { ParticipantAvatar } from './ParticipantAvatar.tsx';
import { useAnnouncer } from './useAnnouncer.ts';
import styles from './LobbyScreen.module.css';

export function LobbyScreen() {
  const { t } = useTranslation();
  const setScreen = useScreen((state) => state.setScreen);
  const { role, code, you, participants, criterion, status } = useRoom();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { announcement, say } = useAnnouncer();
  const seen = useRef(participants);

  // Comings and goings are said out loud; the list alone changes silently.
  useEffect(() => {
    const before = new Map(seen.current.map((p) => [p.id, p]));
    const now = new Set(participants.map((p) => p.id));
    for (const p of participants) {
      if (!before.has(p.id)) say(t('room.lobby.joined', { nickname: p.nickname }));
    }
    for (const p of before.values()) {
      if (!now.has(p.id)) say(t('room.lobby.left', { nickname: p.nickname }));
    }
    seen.current = participants;
  }, [participants, say, t]);

  // The host's own Start and a guest's start message both land here, as the
  // session sets the room sorting.
  useEffect(() => {
    if (status === 'sorting') setScreen('sorting');
  }, [status, setScreen]);

  const backToForm = () => {
    leaveRoom();
    forgetRoomLink();
    setScreen('list-input');
  };

  if (status === 'closed') {
    return (
      <div className={styles.screen}>
        <p className={styles.closed} role="alert">
          {t('room.lobby.closed')}
        </p>
        <button type="button" className={styles.secondary} onClick={backToForm}>
          {t('room.back')}
        </button>
      </div>
    );
  }

  if (code === null) return null;

  const canStart = participants.length >= START_MINIMUM;

  // The clipboard is missing over plain http, which is how a phone on the same
  // wifi reaches a dev machine, and it can refuse a page without focus. The
  // code is on screen to read out either way.
  const canCopy = typeof navigator.clipboard?.writeText === 'function';
  const copy = () => {
    navigator.clipboard.writeText(roomLink(code)).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <span className={styles.codeLabel}>{t('room.lobby.code')}</span>
        <strong className={styles.code}>{code}</strong>
        {canCopy && (
          <button type="button" className={styles.copy} onClick={copy}>
            {t('room.lobby.copyLink')}
          </button>
        )}
        <span className={styles.copied} role="status">
          {copied && t('room.lobby.copied')}
        </span>
      </div>

      <p className={styles.criterion}>
        <span className={styles.criterionLabel}>{t('room.lobby.criterion')}</span> {criterion}
      </p>

      <div className={styles.listHeader}>
        <h2 className={styles.heading}>{t('room.lobby.heading')}</h2>
        <span className={styles.count}>
          {t('room.lobby.count', { count: participants.length, limit: ROOM_LIMIT })}
        </span>
      </div>
      <ul className={styles.participants}>
        {participants.map((participant, place) => (
          <li key={participant.id} className={styles.participant}>
            <ParticipantAvatar
              participant={participant}
              place={place}
              isYou={participant.id === you}
            />
          </li>
        ))}
      </ul>

      {role === 'host' ? (
        <div className={styles.start}>
          <button
            type="button"
            className={styles.primary}
            disabled={!canStart}
            aria-describedby={canStart ? undefined : 'lobby-start-notice'}
            onClick={startRoom}
          >
            {t('room.lobby.start')}
          </button>
          {!canStart && (
            <p id="lobby-start-notice" className={styles.notice}>
              {t('room.lobby.needsSomeone')}
            </p>
          )}
        </div>
      ) : (
        <p className={styles.notice}>{t('room.lobby.waiting')}</p>
      )}

      {role === 'host' && confirming ? (
        <div className={styles.confirm}>
          <p className={styles.prompt}>{t('room.lobby.confirmClose')}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.danger} onClick={backToForm}>
              {t('room.lobby.confirmYes')}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setConfirming(false)}>
              {t('room.lobby.confirmNo')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.secondary}
          // The host leaving takes the room with them, and everyone in it.
          onClick={role === 'host' ? () => setConfirming(true) : backToForm}
        >
          {t(role === 'host' ? 'room.lobby.close' : 'room.lobby.leave')}
        </button>
      )}

      <Announcer announcement={announcement} />
    </div>
  );
}
