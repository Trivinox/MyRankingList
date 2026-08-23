import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../i18n/index.ts';
import styles from './LanguageSelector.module.css';

export function LanguageSelector() {
  const { t, i18n } = useTranslation();

  return (
    <div className={styles.selector} role="group" aria-label={t('language.group')}>
      {supportedLanguages.map((code) => (
        <button
          key={code}
          type="button"
          className={styles.option}
          aria-label={t(`language.${code}`)}
          aria-pressed={i18n.resolvedLanguage === code}
          onClick={() => void i18n.changeLanguage(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
