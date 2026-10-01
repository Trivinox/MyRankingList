import { expect, test } from './fixtures.ts';
import { sortInto } from './sorting.ts';
import type { Page } from '@playwright/test';

const criterion = 'Which fruit do you like more?';

// The order the list should end in, favorite first. Kiwi and peach share a
// position, so the numbers come out as 1, 2, 2, 4, 5.
const intended = [['Mango'], ['Kiwi', 'Peach'], ['Banana'], ['Apple']];
// Typed in an order that matches neither the intended one nor its reverse.
const typed = ['Banana', 'Peach', 'Apple', 'Mango', 'Kiwi'];

async function fillForm(page: Page) {
  await page.getByLabel('What are you comparing them by?').fill(criterion);
  // The form arrives with three rows.
  for (let i = 3; i < typed.length; i++) {
    await page.getByRole('button', { name: 'Add item' }).click();
  }
  for (const [index, name] of typed.entries()) {
    await page.getByLabel(`Item ${index + 1}`, { exact: true }).fill(name);
  }
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('sorts a list with a tie and sorts it again', async ({ page, isMobile }) => {
  await page.goto('/');
  await fillForm(page);

  await expect(page.getByRole('heading', { name: criterion })).toBeFocused();
  await sortInto(page, intended, isMobile, { dragFirst: true });
  await page.getByRole('button', { name: 'See result' }).click();

  await expect(page.getByRole('heading', { name: criterion })).toBeFocused();
  const positions = page.getByRole('list').getByRole('listitem');
  // Inside the tie card the rows keep the order the two were placed in, which
  // the shuffle decides, so either one may come first.
  await expect(positions).toHaveText([
    /^1\s*Mango$/,
    /^Tied\s*2\s*(Kiwi\s*2\s*Peach|Peach\s*2\s*Kiwi)$/,
    /^4\s*Banana$/,
    /^5\s*Apple$/,
  ]);

  await page.getByRole('button', { name: 'Sort again' }).click();
  await expect(page.getByRole('heading', { name: criterion })).toBeFocused();
  const progress = page.getByRole('progressbar');
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(progress).toHaveAttribute('aria-valuemax', String(typed.length));
});
