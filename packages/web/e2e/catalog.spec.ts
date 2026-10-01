import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures.ts';
import { sortInto } from './sorting.ts';

// Read from the file the catalog ships, so the test follows the content when
// it is rewritten. Desserts because it carries no images: nothing here should
// wait on a photo coming over the network.
const desserts: { title: string; items: { text: string }[] } = JSON.parse(
  readFileSync(new URL('../src/lists/en/food/desserts.json', import.meta.url), 'utf8'),
);

const criterion = 'Which dessert would you order first?';
const edited = 'Carrot cake';
// The file order with the second row rewritten, and the order the list is
// meant to end in.
const intended = desserts.items.map((item, index) => (index === 1 ? edited : item.text));

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('picks a preset list, edits it and sorts it', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse preset lists' }).click();

  await page.getByRole('searchbox', { name: 'Search the catalog' }).fill(desserts.title);
  const results = page.getByRole('list', { name: 'Lists that match' });
  await results.getByRole('button', { name: 'Use this list', description: desserts.title }).click();

  const criterionField = page.getByLabel('What are you comparing them by?');
  await expect(criterionField).toBeFocused();
  await expect(criterionField).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  for (const [index, item] of desserts.items.entries()) {
    await expect(page.getByLabel(`Item ${index + 1}`, { exact: true })).toHaveValue(item.text);
  }

  await page.getByLabel('Item 2', { exact: true }).fill(edited);
  await criterionField.fill(criterion);
  await page.getByRole('button', { name: 'Continue' }).click();

  // No ties: every dessert gets a position of its own.
  const positions = intended.map((name) => [name]);
  await sortInto(page, positions, isMobile);
  await page.getByRole('button', { name: 'See result' }).click();

  await expect(page.getByRole('heading', { name: criterion })).toBeFocused();
  await expect(page.getByRole('list').getByRole('listitem')).toHaveText(
    intended.map((name, index) => new RegExp(`^${index + 1}\\s*${escape(name)}$`)),
  );
});
