import { useEffect, useRef, useState } from 'react';
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
import { Loader } from './Loader.tsx';
import { Popup } from './Popup.tsx';
import type { Severity } from './Popup.tsx';
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
  const codeField = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);

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

  // Back to the code, the likeliest thing to correct, or to the button that
  // sent the form when there is no code to type.
  const dismiss = () => {
    useRoom.getState().dismiss();
    (joining ? codeField : submitButton).current?.focus();
  };

  return (
    <form className={styles.screen} onSubmit={submit}>
      <h2 className={styles.heading}>{t(joining ? 'room.joinHeading' : 'room.createHeading')}</h2>

      {joining && (
        <div className={styles.field}>
          <label className={styles.field}>
            <span className={styles.label}>{t('room.codeLabel')}</span>
            <input
              ref={codeField}
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
        <button ref={submitButton} type="submit" className={styles.submit} disabled={!ready}>
          {t(joining ? 'room.enter' : 'room.open')}
        </button>
        <button type="button" className={styles.back} onClick={back}>
          {t('room.back')}
        </button>
      </div>

      {/* Stays in the tree, empty, so the text lands in a region a screen
          reader already knows about. */}
      <p className={styles.status} role="status">
        {connecting && (
          <>
            <Loader />
            {t('room.connecting')}
          </>
        )}
      </p>

      {error && (
        <Popup
          severity={severityOf(error)}
          message={describe(error, joining, t)}
          action={t('room.dismiss')}
          onClose={dismiss}
        />
      )}
    </form>
  );
}

// No room behind the code, or none that could be reached or opened, is an
// error. A room that is there but takes nobody else, and an address that has
// to wait before trying again, are warnings.
function severityOf(error: RoomError): Severity {
  return error.kind === 'not-found' || error.kind === 'unreachable' ? 'error' : 'warning';
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
    case 'started':
      return t('room.started');
    case 'unreachable':
      return t(joining ? 'room.unreachable' : 'room.notOpened');
  }
}
