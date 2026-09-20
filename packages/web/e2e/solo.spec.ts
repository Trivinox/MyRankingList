import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const criterion = 'Which fruit do you like more?';

// The order the list should end in, favorite first. Kiwi and peach share a
// position, so the numbers come out as 1, 2, 2, 4, 5.
const intended = [['Mango'], ['Kiwi', 'Peach'], ['Banana'], ['Apple']];
// Typed in an order that matches neither the intended one nor its reverse.
const typed = ['Banana', 'Peach', 'Apple', 'Mango', 'Kiwi'];

const groupOf = (name: string) => intended.findIndex((group) => group.includes(name));

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

// Which item is in hand is never known in advance, so it is read back from
// wherever it is on screen.
async function nameIn(locator: Locator) {
  const text = await locator.innerText();
  const name = typed.find((candidate) => text.includes(candidate));
  expect(name, `no item name in "${text}"`).toBeDefined();
  return name!;
}

// The shuffle picks both the opening item and the order of the pool, so the
// test keeps its own copy of the list and works out, for each pool item it
// reads, the target that keeps the list in the intended order: the rank of
// the position holding its tie partner, or else the gap after every group
// that comes before its own.
function targetFor(page: Page, list: string[][], name: string) {
  const partner = list.findIndex((slot) => groupOf(slot[0]) === groupOf(name));
  if (partner !== -1) {
    return { slot: partner, tie: true, button: rankButton(page, list[partner]) };
  }
  const gap = list.filter((slot) => groupOf(slot[0]) < groupOf(name)).length;
  const button = page.getByRole('button', { name: `Put it at position ${gap + 1}`, exact: true });
  return { slot: gap, tie: false, button };
}

// The rank reads out every name in its position, and at most one is ever
// there when something is tied with it.
function rankButton(page: Page, slot: string[]) {
  return page.getByRole('button', { name: `Tie it with ${slot[0]}`, exact: true });
}

// A real pointer drag, the way most people on a computer will place things.
// dnd-kit starts the drag only past 4px of travel, hence the steps, and the
// release waits for the target to show the preview so it cannot land on the
// way there.
async function drag(page: Page, target: Locator, outcome: 'insert' | 'tie') {
  const handle = page.locator('aside [data-drag-id="pool"]');
  const from = await handle.boundingBox();
  const droppable = target.locator('xpath=ancestor-or-self::li[1]');
  const to = await droppable.boundingBox();
  if (!from || !to) {
    throw new Error('The pool card or the target is not on screen');
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await expect(droppable).toHaveAttribute('data-outcome', outcome);
  await page.mouse.up();
}

test('sorts a list with a tie and sorts it again', async ({ page, isMobile }) => {
  await page.goto('/');
  await fillForm(page);

  await expect(page.getByRole('heading', { name: criterion })).toBeFocused();
  const progress = page.getByRole('progressbar');
  const listRegion = page.getByRole('region', { name: 'Your list so far' });

  // The opening item is already down when the screen appears.
  const list = [[await nameIn(listRegion)]];

  for (let placed = 1; placed < typed.length; placed++) {
    await expect(progress).toHaveAttribute('aria-valuenow', String(placed));
    const name = await nameIn(page.locator('aside'));
    const target = targetFor(page, list, name);

    // Dragging is off below 768px, so the phone only ever taps. It has to be
    // tap() and not click(): a click on a touch profile still arrives as a
    // mouse event, and the touch path would go untested.
    if (isMobile) {
      await target.button.tap();
    } else if (placed === 1) {
      await drag(page, target.button, target.tie ? 'tie' : 'insert');
    } else {
      await target.button.click();
    }

    if (target.tie) {
      list[target.slot].push(name);
    } else {
      list.splice(target.slot, 0, [name]);
    }
  }

  await expect(progress).toHaveAttribute('aria-valuenow', String(typed.length));
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
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(progress).toHaveAttribute('aria-valuemax', String(typed.length));
});
