import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { forgetRoomLink, linkedCode, rememberRoomLink } from '../room/link.ts';
import { NICKNAME_LIMIT } from '../room/nicknames.ts';
import { readRoomCode } from '../room/roomCode.ts';
import { createRoom, joinRoom, leaveRoom } from '../room/session.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import type { RoomError } from '../state/roomStore.ts';
import { useRoom } from '../state/roomStore.ts';
import { useScreen } from '../state/screenStore.ts';
import styles from './RoomEntryScreen.module.css';

interface Props {
  mode: 'create' | 'join';
}

export function RoomEntryScreen({ mode }: Props) {
  const { t } = useTranslation();
  const setScreen = useScreen((state) => state.setScreen);
  const { status, error, code: roomCode } = useRoom();
  const joining = mode === 'join';

  // A link with a code of the wrong shape leaves the field empty rather than
  // filling it with something bound to fail. The user pressed a button to get
  // here, so the keyboard is expected, and it opens on whatever is left to fill.
  const [linked] = useState(() => (joining ? (readRoomCode(linkedCode() ?? '') ?? '') : ''));
  const [code, setCode] = useState(linked);
  const [nickname, setNickname] = useState('');
  const [badCode, setBadCode] = useState(false);

  useEffect(() => {
    if (status !== 'lobby') return;
    if (joining && roomCode) rememberRoomLink(roomCode);
    setScreen('lobby');
  }, [status, joining, roomCode, setScreen]);

  const connecting = status === 'connecting';
  const ready = nickname.trim() !== '' && (!joining || code.trim() !== '') && !connecting;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!joining) {
      const { items, criterion } = useListDraft.getState();
      const filled = items.filter((item) => item.text.trim() !== '');
      void createRoom(nickname.trim(), filled, criterion.trim());
      return;
    }
    // Checked here so a typo never reaches the server, where it would count
    // as one of the few wrong codes an address gets.
    const valid = readRoomCode(code);
    setBadCode(valid === null);
    if (valid !== null) void joinRoom(valid, nickname.trim());
  };

  const back = () => {
    leaveRoom();
    forgetRoomLink();
    setScreen('list-input');
  };

  return (
    <form className={styles.screen} onSubmit={submit}>
      <h2 className={styles.heading}>{t(joining ? 'room.joinHeading' : 'room.createHeading')}</h2>

      {joining && (
        <div className={styles.field}>
          <label className={styles.field}>
            <span className={styles.label}>{t('room.codeLabel')}</span>
            <input
              type="text"
              className={styles.code}
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              autoFocus={linked === ''}
              spellCheck={false}
              aria-invalid={badCode}
              aria-describedby={badCode ? 'room-code-notice' : undefined}
              onChange={(event) => {
                setCode(event.target.value);
                setBadCode(false);
              }}
            />
          </label>
          {badCode && (
            <span id="room-code-notice" className={styles.flag}>
              {t('room.codeInvalid')}
            </span>
          )}
        </div>
      )}

      <label className={styles.field}>
        <span className={styles.label}>{t('room.nicknameLabel')}</span>
        <input
          type="text"
          value={nickname}
          maxLength={NICKNAME_LIMIT}
          autoComplete="nickname"
          autoFocus={linked !== '' || !joining}
          placeholder={t('room.nicknamePlaceholder')}
          onChange={(event) => setNickname(event.target.value)}
        />
      </label>

      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={!ready}>
          {t(joining ? 'room.enter' : 'room.open')}
        </button>
        <button type="button" className={styles.back} onClick={back}>
          {t('room.back')}
        </button>
      </div>

      {/* Both stay in the tree, empty, so the text lands in a region a screen
          reader already knows about. */}
      <div className={styles.messages}>
        <p className={styles.status} role="status">
          {connecting && t('room.connecting')}
        </p>
        <p className={styles.error} role="alert">
          {error && describe(error, joining, t)}
        </p>
      </div>
    </form>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

function describe(error: RoomError, joining: boolean, t: Translate) {
  switch (error.kind) {
    case 'not-found':
      return t('room.notFound');
    case 'rate-limited':
      return t('room.rateLimited', { count: Math.ceil(error.retryAfter / 60) });
    case 'full':
      return t('room.full');
    case 'unreachable':
      return t(joining ? 'room.unreachable' : 'room.notOpened');
  }
}
