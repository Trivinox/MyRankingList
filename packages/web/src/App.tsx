import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Announcer } from './components/Announcer.tsx';
import { CatalogScreen } from './components/CatalogScreen.tsx';
import { LanguageSelector } from './components/LanguageSelector.tsx';
import { ListInputForm } from './components/ListInputForm.tsx';
import { LobbyScreen } from './components/LobbyScreen.tsx';
import { MuteButton } from './components/MuteButton.tsx';
import { ResultScreen } from './components/ResultScreen.tsx';
import { RoomEntryScreen } from './components/RoomEntryScreen.tsx';
import { SortingScreen } from './components/SortingScreen.tsx';
import { useAnnouncer } from './components/useAnnouncer.ts';
import { useScreen } from './state/screenStore.ts';
import type { Screen } from './state/screenStore.ts';
import styles from './App.module.css';

// The sorting screen needs the room the form does not: a pool taking close to
// half the width reads as nothing inside a reading-width column. Everything
// else is a single column of text and belongs at reading width.
const widths: Record<Screen, string> = {
  'list-input': styles.page,
  catalog: styles.page,
  sorting: `${styles.page} ${styles.wide}`,
  result: styles.page,
  'room-create': styles.page,
  'room-join': styles.page,
  lobby: styles.page,
};

function App() {
  const { t } = useTranslation();
  const { screen, setScreen } = useScreen();
  // For a message sent as the screen changes under it. A region that arrives
  // with the new screen is already holding its text when it shows up, and a
  // screen reader only reads a region it has seen change.
  const { announcement, say, clear } = useAnnouncer();
  // What it says is about the catalog and the form, the only two screens it
  // is kept on. The sorting screen has a region of its own, and a stale "copied"
  // there would be one more thing to trip over while reading the page.
  const announcing = screen === 'catalog' || screen === 'list-input';

  useEffect(() => {
    if (!announcing) {
      clear();
    }
  }, [announcing, clear]);

  return (
    <div className={widths[screen]}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('app.title')}</h1>
        <div className={styles.controls}>
          <MuteButton />
          <LanguageSelector />
        </div>
      </header>
      {/* With reduce motion on in the OS, anything that moves or scales jumps
          straight to where it ends, and fades still play. */}
      <MotionConfig reducedMotion="user">
        {screen === 'list-input' && (
          <>
            <div className={styles.intro}>
              <p>{t('app.tagline')}</p>
              {/* Up here because a guest has no list to write. */}
              <button type="button" className={styles.join} onClick={() => setScreen('room-join')}>
                {t('room.join')}
              </button>
            </div>
            <ListInputForm />
          </>
        )}
        {screen === 'catalog' && <CatalogScreen announce={say} />}
        {screen === 'sorting' && <SortingScreen />}
        {screen === 'result' && <ResultScreen />}
        {screen === 'room-create' && <RoomEntryScreen mode="create" />}
        {screen === 'room-join' && <RoomEntryScreen mode="join" />}
        {screen === 'lobby' && <LobbyScreen />}
      </MotionConfig>
      {announcing && <Announcer announcement={announcement} />}
    </div>
  );
}

export default App;
