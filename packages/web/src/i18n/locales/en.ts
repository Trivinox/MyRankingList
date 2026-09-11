export const en = {
  app: {
    title: 'MyRankingList',
    tagline: 'Sort a list by dragging each item where you think it belongs.',
  },
  language: {
    group: 'Language',
    en: 'English',
    es: 'Spanish',
  },
  form: {
    criterionLabel: 'What are you comparing them by?',
    criterionPlaceholder: 'Which one do you like more?',
    itemsHeading: 'Items',
    itemCount_one: '{{count}} item',
    itemCount_other: '{{count}} items',
    itemLabel: 'Item {{number}}',
    itemPlaceholder: 'Write an item',
    imageUrlLabel: 'Image URL for item {{number}}',
    imageUrlPlaceholder: 'https://example.com/photo.jpg',
    imageUrlRejected: 'This link will not be shown as an image.',
    addItem: 'Add item',
    removeItem: 'Remove item {{number}}',
    duplicateFlag: 'Repeated',
    duplicateNotice: 'Some items say the same thing. Edit them, remove them, or leave them.',
    longListWarning:
      'A list this long is harder to place precisely: more scrolling, and smaller gaps to aim at.',
    minimumNotice: 'Write at least {{count}} items to start sorting.',
    criterionNotice: 'Say what you are comparing them by to start sorting.',
    continue: 'Continue',
  },
  sorting: {
    listLabel: 'Your list so far',
    poolHint: 'Add it to the list',
    allPlaced: 'All items placed',
    progress: '{{placed}} of {{total}} placed',
    announce: {
      lifted: 'Picked up {{item}}.',
      placed: 'Placed at position {{position}}.',
      outside: 'Dropped outside the list. Nothing was placed.',
      cancelled: 'Drag cancelled. The list is unchanged.',
    },
  },
};
