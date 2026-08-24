import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './components/LanguageSelector.tsx';
import { ListInputForm } from './components/ListInputForm.tsx';
import { useListDraft } from './state/listDraftStore.ts';
import styles from './App.module.css';

function App() {
  const { t } = useTranslation();
  const screen = useListDraft((state) => state.screen);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('app.title')}</h1>
        <LanguageSelector />
      </header>
      <p>{t('app.tagline')}</p>
      {screen === 'list-input' && <ListInputForm />}
    </div>
  );
}

export default App;
