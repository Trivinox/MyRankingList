import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

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

// The shuffle picks what is on screen, so it is read back rather than known.
// The longest name wins, in case one item's text sits inside another's.
async function nameIn(locator: Locator) {
  const text = await locator.innerText();
  const name = [...intended]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => text.includes(candidate));
  expect(name, `no item name in "${text}"`).toBeDefined();
  return name!;
}

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

  const progress = page.getByRole('progressbar');
  const listRegion = page.getByRole('region', { name: 'Your list so far' });
  // Every item goes into the gap after the ones placed so far that come before
  // it, which keeps the list in the intended order the whole way through.
  const placed = [await nameIn(listRegion)];

  for (let count = 1; count < intended.length; count++) {
    await expect(progress).toHaveAttribute('aria-valuenow', String(count));
    const name = await nameIn(page.locator('aside'));
    const gap = placed.filter((other) => intended.indexOf(other) < intended.indexOf(name)).length;
    const button = page.getByRole('button', { name: `Put it at position ${gap + 1}`, exact: true });

    // tap() on the phone, for the same reason the solo test gives.
    if (isMobile) {
      await button.tap();
    } else {
      await button.click();
    }
    placed.splice(gap, 0, name);
  }

  await page.getByRole('button', { name: 'See result' }).click();

  await expect(page.getByRole('heading', { name: criterion })).toBeFocused();
  await expect(page.getByRole('list').getByRole('listitem')).toHaveText(
    intended.map((name, index) => new RegExp(`^${index + 1}\\s*${escape(name)}$`)),
  );
});
