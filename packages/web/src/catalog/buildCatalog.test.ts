import { describe, expect, it } from 'vitest';
import { buildCatalog } from './buildCatalog.ts';
import type { CatalogFiles } from './types.ts';

const categories: CatalogFiles = {
  '/src/lists/en/categories.json': { food: 'Food', movies: 'Movies' },
  '/src/lists/es/categories.json': { food: 'Comida', movies: 'Películas' },
};

const lists: CatalogFiles = {
  '/src/lists/en/food/fruits.json': { title: 'Fruits', items: [{ text: 'Apple' }] },
  '/src/lists/en/food/desserts.json': { title: 'Desserts', items: [{ text: 'Tiramisu' }] },
  '/src/lists/en/movies/classics.json': { title: 'Classics', items: [{ text: 'Psycho' }] },
  '/src/lists/es/food/fruits.json': { title: 'Frutas', items: [{ text: 'Manzana' }] },
  '/src/lists/es/food/tapas.json': { title: 'Tapas', items: [{ text: 'Croquetas' }] },
  '/src/lists/es/movies/classics.json': { title: 'Clásicas', items: [{ text: 'Psicosis' }] },
};

const titlesOf = (categoryLists: { title: string }[]) => categoryLists.map((list) => list.title);

describe('buildCatalog', () => {
  it('groups the lists of one language under their category', () => {
    const catalog = buildCatalog(lists, categories, 'en');

    expect(catalog.map((category) => category.id)).toEqual(['food', 'movies']);
    expect(titlesOf(catalog[0].lists)).toEqual(['Desserts', 'Fruits']);
    expect(titlesOf(catalog[1].lists)).toEqual(['Classics']);
  });

  it('orders the lists by title in the language on screen', () => {
    const spanish = {
      '/src/lists/es/movies/animated.json': {
        title: 'Películas de animación',
        items: [{ text: 'Shrek' }],
      },
      '/src/lists/es/movies/classics.json': {
        title: 'Películas clásicas',
        items: [{ text: 'Psicosis' }],
      },
    };

    // The file names would put animated first; the accented title sorts before
    // it, which is the order a Spanish reader expects.
    expect(titlesOf(buildCatalog(spanish, categories, 'es')[0].lists)).toEqual([
      'Películas clásicas',
      'Películas de animación',
    ]);
  });

  it('names the categories in the language asked for', () => {
    expect(buildCatalog(lists, categories, 'es').map((category) => category.name)).toEqual([
      'Comida',
      'Películas',
    ]);
  });

  it('leaves out a list that has no file in this language', () => {
    expect(titlesOf(buildCatalog(lists, categories, 'es')[0].lists)).toContain('Tapas');
    expect(titlesOf(buildCatalog(lists, categories, 'en')[0].lists)).toHaveLength(2);
  });

  it('hides a category that categories.json does not name', () => {
    const untranslated = {
      ...categories,
      '/src/lists/en/categories.json': { food: 'Food' },
    };

    expect(buildCatalog(lists, untranslated, 'en').map((category) => category.id)).toEqual([
      'food',
    ]);
  });

  it('hides a category left with no lists', () => {
    const onlyFood = {
      '/src/lists/en/food/fruits.json': lists['/src/lists/en/food/fruits.json'],
    };

    expect(buildCatalog(onlyFood, categories, 'en').map((category) => category.id)).toEqual([
      'food',
    ]);
  });

  it('carries the file name through as the list id', () => {
    expect(buildCatalog(lists, categories, 'en')[1].lists[0].id).toBe('classics');
  });

  it('renames image_url to the imageUrl the app uses', () => {
    const withImage = {
      '/src/lists/en/food/fruits.json': {
        title: 'Fruits',
        items: [{ text: 'Apple', image_url: 'https://example.com/apple.jpg' }, { text: 'Banana' }],
      },
    };

    expect(buildCatalog(withImage, categories, 'en')[0].lists[0].items).toEqual([
      { text: 'Apple', imageUrl: 'https://example.com/apple.jpg' },
      { text: 'Banana' },
    ]);
  });

  it('skips a broken file and keeps the rest of the catalog', () => {
    const broken = {
      ...lists,
      '/src/lists/en/food/noTitle.json': { items: [{ text: 'Apple' }] },
      '/src/lists/en/food/noItems.json': { title: 'Empty' },
      '/src/lists/en/food/emptyItems.json': { title: 'Empty', items: [] },
      '/src/lists/en/food/tooLong.json': {
        title: 'Long',
        items: [{ text: 'Apple' }, { text: 'x'.repeat(81) }],
      },
      '/src/lists/en/food/notAnObject.json': 'nonsense',
    };

    expect(titlesOf(buildCatalog(broken, categories, 'en')[0].lists)).toEqual([
      'Desserts',
      'Fruits',
    ]);
  });

  it('takes an item of exactly eighty characters', () => {
    const atTheLimit = {
      '/src/lists/en/food/fruits.json': {
        title: 'Fruits',
        items: [{ text: 'x'.repeat(80) }],
      },
    };

    expect(buildCatalog(atTheLimit, categories, 'en')[0].lists).toHaveLength(1);
  });

  it('drops a file whose image_url is not text', () => {
    const odd = {
      '/src/lists/en/food/fruits.json': {
        title: 'Fruits',
        items: [{ text: 'Apple', image_url: 42 }],
      },
    };

    expect(buildCatalog(odd, categories, 'en')).toEqual([]);
  });
});
