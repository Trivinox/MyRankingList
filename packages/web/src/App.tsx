import { MotionConfig } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CatalogScreen } from './components/CatalogScreen.tsx';
import { LanguageSelector } from './components/LanguageSelector.tsx';
import { ListInputForm } from './components/ListInputForm.tsx';
import { MuteButton } from './components/MuteButton.tsx';
import { ResultScreen } from './components/ResultScreen.tsx';
import { SortingScreen } from './components/SortingScreen.tsx';
import { useListDraft } from './state/listDraftStore.ts';
import type { Screen } from './state/listDraftStore.ts';
import styles from './App.module.css';

// The sorting screen needs the room the form does not: a pool taking close to
// half the width reads as nothing inside a reading-width column. Everything
// else is a single column of text and belongs at reading width.
const widths: Record<Screen, string> = {
  'list-input': styles.page,
  catalog: styles.page,
  sorting: `${styles.page} ${styles.wide}`,
  result: styles.page,
};

function App() {
  const { t } = useTranslation();
  const screen = useListDraft((state) => state.screen);

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
            <p>{t('app.tagline')}</p>
            <ListInputForm />
          </>
        )}
        {screen === 'catalog' && <CatalogScreen />}
        {screen === 'sorting' && <SortingScreen />}
        {screen === 'result' && <ResultScreen />}
      </MotionConfig>
    </div>
  );
}

export default App;
