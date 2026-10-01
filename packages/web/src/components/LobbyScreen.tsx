import { useEffect, useId, useRef, useState } from 'react';
import { LinkIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { ROOM_LIMIT, START_MINIMUM } from '../room/hostRoom.ts';
import { forgetRoomLink, roomLink } from '../room/link.ts';
import { leaveRoom, startRoom } from '../room/session.ts';
import { isOver, useRoom } from '../state/roomStore.ts';
import { useScreen } from '../state/screenStore.ts';
import { Announcer } from './Announcer.tsx';
import { CloseRoom } from './CloseRoom.tsx';
import { ParticipantAvatar } from './ParticipantAvatar.tsx';
import { Popup } from './Popup.tsx';
import { RemovalPrompt } from './RemovalPrompt.tsx';
import { useAnnouncer } from './useAnnouncer.ts';
import { useRemoval } from './useRemoval.ts';
import styles from './LobbyScreen.module.css';

export function LobbyScreen() {
  const { t } = useTranslation();
  const setScreen = useScreen((state) => state.setScreen);
  const { role, code, you, participants, criterion, status, result } = useRoom();
  const [copied, setCopied] = useState(false);
  const removal = useRemoval(participants);
  const headingId = useId();
  const { announcement, say } = useAnnouncer();
  const seen = useRef(participants);
  const preparingLine = useRef<HTMLParagraphElement>(null);
  // Between rounds, while the creator writes the next list. Nobody can join
  // any more, so the code has nothing left to do here, and the criterion on
  // show would be last round's.
  const preparing = status === 'preparing';

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
  // session sets the room sorting. Between rounds the result is still this
  // guest's to keep: the creator going back to it brings them back too, and
  // a room that ends meanwhile shows why on top of it.
  useEffect(() => {
    if (status === 'sorting') setScreen('sorting');
    else if (result && (status === 'revealed' || isOver(status))) setScreen('room-result');
  }, [status, result, setScreen]);

  // Nothing was pressed to get here: the result was simply taken away.
  useEffect(() => {
    if (preparing) preparingLine.current?.focus();
  }, [preparing]);

  const backToForm = () => {
    leaveRoom();
    forgetRoomLink();
    setScreen('list-input');
  };

  if (isOver(status)) {
    // The effect above is on its way to the result, which says it there.
    if (result) return null;
    // Nothing is left behind it, so closing it in any way is going back.
    // Being put out, or a room ending without a word from the creator, is a
    // warning. The rest is how a room ordinarily comes to an end.
    return (
      <Popup
        severity={status === 'removed' || status === 'ended' ? 'warning' : 'info'}
        message={t(`room.lobby.${status}`)}
        action={t('room.back')}
        onClose={backToForm}
      />
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
      {preparing ? (
        <p ref={preparingLine} className={styles.preparing} tabIndex={-1}>
          {t('room.lobby.preparing')}
        </p>
      ) : (
        <>
          <div className={styles.bar}>
            <span className={styles.codeLabel}>{t('room.lobby.code')}</span>
            <strong className={styles.code}>{code}</strong>
            {canCopy && (
              <button type="button" className={styles.copy} onClick={copy}>
                <LinkIcon aria-hidden="true" />
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
        </>
      )}

      <div className={styles.listHeader}>
        <h2 id={headingId} className={styles.heading}>
          {t('room.lobby.heading')}
        </h2>
        <span className={styles.count}>
          {t('room.lobby.count', { count: participants.length, limit: ROOM_LIMIT })}
        </span>
      </div>
      <ul
        ref={removal.list}
        className={styles.participants}
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        {participants.map((participant, place) => (
          <li key={participant.id} className={styles.participant}>
            <ParticipantAvatar
              participant={participant}
              place={place}
              isYou={participant.id === you}
            />
            {role === 'host' && !participant.isCreator && (
              <button
                ref={removal.buttonRef(participant.id)}
                type="button"
                className={styles.remove}
                aria-label={t('room.remove.label', { nickname: participant.nickname })}
                onClick={() => removal.ask(participant.id)}
              >
                {t('room.remove.button')}
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
        !preparing && <p className={styles.notice}>{t('room.lobby.waiting')}</p>
      )}

      {role === 'host' ? (
        <CloseRoom onClose={backToForm} />
      ) : (
        <button type="button" className={styles.secondary} onClick={backToForm}>
          {t('room.lobby.leave')}
        </button>
      )}

      <Announcer announcement={announcement} />
    </div>
  );
}
