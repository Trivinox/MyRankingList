import { MotionConfig } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './components/LanguageSelector.tsx';
import { ListInputForm } from './components/ListInputForm.tsx';
import { SortingScreen } from './components/SortingScreen.tsx';
import { useListDraft } from './state/listDraftStore.ts';
import styles from './App.module.css';

function App() {
  const { t } = useTranslation();
  const screen = useListDraft((state) => state.screen);

  // The sorting screen needs the room the form does not: a pool taking close
  // to half the width reads as nothing inside a reading-width column.
  const wrapper = screen === 'sorting' ? `${styles.page} ${styles.wide}` : styles.page;

  return (
    <div className={wrapper}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('app.title')}</h1>
        <LanguageSelector />
      </header>
      {/* With reduce motion on in the OS, anything that moves or scales jumps
          straight to where it ends, and fades still play. */}
      <MotionConfig reducedMotion="user">
        {screen === 'list-input' ? (
          <>
            <p>{t('app.tagline')}</p>
            <ListInputForm />
          </>
        ) : (
          <SortingScreen />
        )}
      </MotionConfig>
    </div>
  );
}

export default App;
