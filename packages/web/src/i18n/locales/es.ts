import type { en } from './en.ts';

// Typed against the English bundle so a missing key breaks the type-check
// instead of quietly falling back to English at runtime.
export const es: typeof en = {
  app: {
    title: 'MyRankingList',
    tagline: 'Ordena una lista arrastrando cada elemento al puesto que le des.',
  },
  language: {
    group: 'Idioma',
    en: 'Inglés',
    es: 'Español',
  },
};
