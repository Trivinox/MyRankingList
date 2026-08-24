import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './components/LanguageSelector.tsx';
import styles from './App.module.css';

function App() {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('app.title')}</h1>
        <LanguageSelector />
      </header>
      <p>{t('app.tagline')}</p>
    </div>
  );
}

export default App;
