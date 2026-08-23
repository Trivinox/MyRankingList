import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en.ts';
import { es } from './locales/es.ts';

export const supportedLanguages = ['en', 'es'] as const;

export type Language = (typeof supportedLanguages)[number];

const resources = {
  en: { translation: en },
  es: { translation: es },
};

// A factory instead of a shared singleton: every component test gets its own
// instance, so a language change in one test cannot leak into the next.
// No language detection here, the app always opens in English.
export function createI18n() {
  const instance = i18next.createInstance();

  instance.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: false,
    interpolation: { escapeValue: false },
  });

  return instance;
}
