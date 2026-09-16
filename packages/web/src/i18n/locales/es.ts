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
  form: {
    criterionLabel: '¿Con qué criterio los comparas?',
    criterionPlaceholder: '¿Cuál te gusta más?',
    itemsHeading: 'Elementos',
    itemCount_one: '{{count}} elemento',
    itemCount_other: '{{count}} elementos',
    itemLabel: 'Elemento {{number}}',
    itemPlaceholder: 'Escribe un elemento',
    imageUrlLabel: 'URL de imagen del elemento {{number}}',
    imageUrlPlaceholder: 'https://ejemplo.com/foto.jpg',
    imageUrlRejected: 'Este enlace no se mostrará como imagen.',
    addItem: 'Añadir elemento',
    removeItem: 'Quitar el elemento {{number}}',
    duplicateFlag: 'Repetido',
    duplicateNotice: 'Hay elementos que dicen lo mismo. Edítalos, bórralos o déjalos así.',
    longListWarning:
      'Con una lista así de larga cuesta más afinar: hay más scroll y los huecos donde apuntar son más pequeños.',
    minimumNotice: 'Escribe al menos {{count}} elementos para empezar a ordenar.',
    criterionNotice: 'Di con qué criterio los comparas para empezar a ordenar.',
    continue: 'Continuar',
  },
  sorting: {
    listLabel: 'Tu lista por ahora',
    poolHint: 'Añádelo a la lista',
    allPlaced: 'Todos los elementos están colocados',
    progress: '{{placed}} de {{total}} colocados',
    tied: 'Empatado',
    announce: {
      lifted: 'Arrastrando {{item}}.',
      liftedFromTie: 'Arrastrando {{item}}. Queda solo {{partner}} en esa posición.',
      placed: 'Colocado en la posición {{position}}.',
      moved: 'Movido a la posición {{position}}.',
      tied: 'Empatado con {{item}}.',
      overInsert: 'Suéltalo para dejarlo en la posición {{position}}.',
      overTie: 'Suéltalo para empatarlo con {{item}}.',
      overRejected: 'Aquí no se puede soltar.',
      refused: 'Ahí no se puede soltar. La lista sigue igual.',
      outside: 'Lo has soltado fuera de la lista. La lista sigue igual.',
      cancelled: 'Arrastre cancelado. La lista sigue igual.',
    },
  },
};
