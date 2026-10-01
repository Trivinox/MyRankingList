import { expect, expectNoViolations, test, watchPolicy } from './fixtures.ts';
import { sortInto } from './sorting.ts';
import type { Browser, Page, TestInfo } from '@playwright/test';

const criterion = 'Which fruit do you like more?';
const fruits = ['Mango', 'Kiwi', 'Peach'];
// For the tests that only need a list handed in, whatever it says.
const asTyped = fruits.map((fruit) => [fruit]);

// Each person in the room is a context of their own, as good as a separate
// browser. The fixture's page only covers the first, so the others are opened
// here with the same device and watched for the same policy.
async function openPerson(browser: Browser, testInfo: TestInfo) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } =
    testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
  });
  const page = await context.newPage();
  await watchPolicy(page);
  return page;
}

async function createRoom(page: Page, nickname: string, items = fruits) {
  await page.goto('/');
  await page.getByLabel('What are you comparing them by?').fill(criterion);
  // The form arrives with three rows.
  for (let i = 3; i < items.length; i++) {
    await page.getByRole('button', { name: 'Add item' }).click();
  }
  for (const [index, name] of items.entries()) {
    await page.getByLabel(`Item ${index + 1}`, { exact: true }).fill(name);
  }
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByLabel('Your nickname').fill(nickname);
  await page.getByRole('button', { name: 'Open the room' }).click();
  await expect(page.getByRole('heading', { name: 'In the room' })).toBeVisible();
}

async function join(page: Page, nickname: string) {
  await page.getByLabel('Your nickname').fill(nickname);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'In the room' })).toBeVisible();
}

// Exact, so "Juan" does not also find "juan (2)".
const person = (page: Page, nickname: string) => page.getByText(nickname, { exact: true });

async function handIn(
  page: Page,
  intended: string[][],
  isMobile: boolean,
  { dragFirst = false } = {},
) {
  await sortInto(page, intended, isMobile, { dragFirst });
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('button', { name: 'Yes, hand it in' }).click();
}

const waiting = (page: Page) =>
  page.getByText('Your list is in. Waiting for the others to finish.', { exact: false });

test('people join a room by code and by link and see each other come and go', async ({
  page: ana,
  browser,
  context,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await createRoom(ana, 'Ana');

  await ana.getByRole('button', { name: 'Copy link' }).click();
  await expect(ana.getByText('Link copied.')).toBeVisible();
  const link = await ana.evaluate(() => navigator.clipboard.readText());
  const code = new URL(link).searchParams.get('room');
  expect(code).toMatch(/^[A-Z2-9]{4}$/);

  const juan = await openPerson(browser, testInfo);
  await juan.goto('/');
  await juan.getByRole('button', { name: 'Join a room' }).click();
  await juan.getByLabel('Room code').fill(code!.toLowerCase());
  await join(juan, 'Juan');
  await expect(juan).toHaveURL(`/?room=${code}`);

  for (const page of [ana, juan]) {
    await expect(person(page, 'Ana')).toBeVisible();
    await expect(person(page, 'Juan')).toBeVisible();
    await expect(page.getByText(criterion)).toBeVisible();
  }

  const other = await openPerson(browser, testInfo);
  await other.goto(link);
  await expect(other.getByLabel('Room code')).toHaveValue(code!);
  await join(other, 'juan');

  for (const page of [ana, juan, other]) {
    await expect(person(page, 'juan (2)')).toBeVisible();
    await expect(page.getByText('3 of 20')).toBeVisible();
  }

  await expectNoViolations(juan);
  // The tab, not the context: closing a context is closer to a crash, with no
  // pagehide, and the host would only see the guest go once ICE gives up.
  await juan.close();

  for (const page of [ana, other]) {
    await expect(person(page, 'Juan')).toHaveCount(0);
    await expect(person(page, 'juan (2)')).toBeVisible();
    await expect(page.getByText('2 of 20')).toBeVisible();
  }

  await expectNoViolations(other);
  await other.context().close();
});

test('the creator starts the room and everyone sees how far along the others are', async ({
  page: ana,
  browser,
  isMobile,
}, testInfo) => {
  await createRoom(ana, 'Ana');
  const start = ana.getByRole('button', { name: 'Start' });
  await expect(start).toBeDisabled();

  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();
  const juan = await openPerson(browser, testInfo);
  await juan.goto(`/?room=${code}`);
  await join(juan, 'Juan');
  await expect(juan.getByText('Waiting for the creator to start.')).toBeVisible();
  await expect(juan.getByRole('button', { name: 'Start' })).toHaveCount(0);

  await start.click();

  for (const page of [ana, juan]) {
    await expect(page.getByRole('heading', { name: criterion })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3');
  }

  // Wherever the item lands, it is placed, and that is all the others hear.
  const top = juan.getByRole('button', { name: 'Put it at position 1', exact: true });
  if (isMobile) {
    await top.tap();
  } else {
    await top.click();
  }
  await expect(juan.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');

  await expect(ana.getByRole('img', { name: 'Juan, 2 of 3 placed' })).toBeVisible();
  await expect(ana.getByRole('img', { name: 'Ana, 1 of 3 placed' })).toBeVisible();
  await expect(juan.getByRole('img', { name: 'Ana, 1 of 3 placed' })).toBeVisible();

  const late = await openPerson(browser, testInfo);
  await late.goto(`/?room=${code}`);
  await late.getByLabel('Your nickname').fill('Lucía');
  await late.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(late.getByRole('alert')).toHaveText(
    'That room has already started sorting. Nobody else can join it now.',
  );

  for (const page of [juan, late]) {
    await expectNoViolations(page);
    await page.context().close();
  }
});

test('the creator removes someone mid-sort, who is told so and drops out of the strip', async ({
  page: ana,
  browser,
  isMobile,
}, testInfo) => {
  await createRoom(ana, 'Ana');
  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();
  const juan = await openPerson(browser, testInfo);
  await juan.goto(`/?room=${code}`);
  await join(juan, 'Juan');
  const lucia = await openPerson(browser, testInfo);
  await lucia.goto(`/?room=${code}`);
  await join(lucia, 'Lucía');

  await ana.getByRole('button', { name: 'Start' }).click();
  for (const page of [ana, lucia]) {
    await expect(page.getByRole('img', { name: 'Juan, 1 of 3 placed' })).toBeVisible();
  }
  // Only the creator gets the crosses.
  await expect(lucia.getByRole('button', { name: 'Remove Juan' })).toHaveCount(0);

  const remove = ana.getByRole('button', { name: 'Remove Juan' });
  if (isMobile) {
    await remove.tap();
  } else {
    await remove.click();
  }
  await ana.getByRole('button', { name: 'Yes, remove' }).click();

  await expect(juan.getByRole('alert')).toHaveText('The creator removed you from the room.');
  for (const page of [ana, lucia]) {
    await expect(page.getByRole('img', { name: /^Juan,/ })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Lucía, 1 of 3 placed' })).toBeVisible();
  }

  await expectNoViolations(juan);
  await juan.getByRole('button', { name: 'Back to my list' }).click();
  await expect(juan).toHaveURL('/');

  for (const page of [juan, lucia]) await page.context().close();
});

test('a guest who reloads mid-sort is back on their own list, and away until then', async ({
  page: ana,
  browser,
  isMobile,
}, testInfo) => {
  await createRoom(ana, 'Ana');
  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();
  const juan = await openPerson(browser, testInfo);
  await juan.goto(`/?room=${code}`);
  await join(juan, 'Juan');
  await ana.getByRole('button', { name: 'Start' }).click();

  const top = juan.getByRole('button', { name: 'Put it at position 1', exact: true });
  if (isMobile) {
    await top.tap();
  } else {
    await top.click();
  }
  await expect(ana.getByRole('img', { name: 'Juan, 2 of 3 placed' })).toBeVisible();
  const list = juan.getByRole('region', { name: 'Your list so far' });
  const before = (await list.textContent()) ?? '';

  // The reloaded tab's lookup waits here, so the creator's strip has time to
  // show them gone before they are back.
  let letThrough = () => {};
  const held = new Promise<void>((resolve) => (letThrough = resolve));
  await juan.route('**/rooms/*', async (route) => {
    await held;
    await route.continue();
  });
  await juan.reload();

  await expect(ana.getByRole('img', { name: 'Juan, away, 2 of 3 placed' })).toBeVisible();
  await expect(juan.getByText('Reconnecting... You can keep sorting.')).toBeVisible();
  await expect(list).toHaveText(before);
  letThrough();

  await expect(ana.getByRole('img', { name: 'Juan, 2 of 3 placed' })).toBeVisible();
  await expect(juan.getByText('Reconnecting... You can keep sorting.')).toHaveCount(0);
  await expect(juan.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  await expect(juan.getByRole('img', { name: 'Ana, 1 of 3 placed' })).toBeVisible();
  await expect(list).toHaveText(before);

  await expectNoViolations(juan);
  await juan.context().close();
});

test('a guest who finishes waits with the list locked, and is still waiting after a reload', async ({
  page: ana,
  browser,
  isMobile,
}, testInfo) => {
  await createRoom(ana, 'Ana');
  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();
  const juan = await openPerson(browser, testInfo);
  await juan.goto(`/?room=${code}`);
  await join(juan, 'Juan');
  await ana.getByRole('button', { name: 'Start' }).click();

  await handIn(juan, asTyped, isMobile);

  await expect(waiting(juan)).toBeVisible();
  await expect(juan.getByRole('button', { name: /^Move / })).toHaveCount(0);
  await expect(ana.getByRole('img', { name: 'Juan, finished' })).toBeVisible();
  await expect(ana.getByRole('img', { name: 'Ana, 1 of 3 placed' })).toBeVisible();
  const list = juan.getByRole('region', { name: 'Your list so far' });
  const before = (await list.textContent()) ?? '';

  // Leaving now asks first. Staying is what the question is for, but a
  // reload has to go through for the tab record to be put to the test.
  juan.on('dialog', (dialog) => void dialog.accept());
  await juan.reload();

  await expect(waiting(juan)).toBeVisible();
  await expect(juan.getByText('Reconnecting... You can keep sorting.')).toHaveCount(0);
  await expect(juan.getByRole('img', { name: 'Juan, finished' })).toBeVisible();
  await expect(juan.getByRole('button', { name: /^Move / })).toHaveCount(0);
  await expect(list).toHaveText(before);
  await expect(ana.getByRole('img', { name: 'Juan, finished' })).toBeVisible();

  await expectNoViolations(juan);
  await juan.context().close();
});

test('the reveal reaches everyone once the last list is in, and a reload keeps it', async ({
  page: ana,
  browser,
  isMobile,
}, testInfo) => {
  await createRoom(ana, 'Ana');
  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();
  const juan = await openPerson(browser, testInfo);
  await juan.goto(`/?room=${code}`);
  await join(juan, 'Juan');
  await ana.getByRole('button', { name: 'Start' }).click();

  await handIn(juan, asTyped, isMobile);
  await expect(ana.getByRole('img', { name: 'Juan, finished' })).toBeVisible();
  await expect(juan.getByRole('table', { name: 'How alike the lists are' })).toHaveCount(0);
  await handIn(ana, asTyped, isMobile);

  for (const page of [ana, juan]) {
    await expect(page.getByRole('heading', { name: criterion })).toBeFocused();
    const consensus = page.getByRole('region', { name: 'All the lists together' });
    for (const fruit of fruits) {
      await expect(consensus.getByText(fruit, { exact: true })).toBeVisible();
    }
    const grid = page.getByRole('table', { name: 'How alike the lists are' });
    await expect(grid.getByRole('columnheader')).toHaveText(['Ana', 'Juan']);
    await expect(grid.getByRole('rowheader')).toHaveText(['Ana', 'Juan']);
    await expect(page.getByRole('combobox', { name: 'Compare your list with' })).toBeVisible();
  }
  await expect(ana.getByRole('button', { name: 'Close the room' })).toBeVisible();
  await expect(juan.getByRole('button', { name: 'Leave the room' })).toBeVisible();

  // Nothing is left to wait for, so the tab goes without asking.
  let asked = false;
  juan.on('dialog', (dialog) => {
    asked = true;
    void dialog.accept();
  });
  await juan.reload();

  await expect(juan.getByRole('table', { name: 'How alike the lists are' })).toBeVisible();
  await expect(juan.getByRole('option', { name: 'Ana' })).toBeAttached();
  expect(asked).toBe(false);

  await expectNoViolations(juan);
  await juan.context().close();
});

test('the creator plays again with the same items, and then with a list of their own', async ({
  page: ana,
  browser,
  isMobile,
}, testInfo) => {
  await createRoom(ana, 'Ana');
  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();
  const juan = await openPerson(browser, testInfo);
  await juan.goto(`/?room=${code}`);
  await join(juan, 'Juan');
  await ana.getByRole('button', { name: 'Start' }).click();

  await handIn(juan, asTyped, isMobile);
  await handIn(ana, asTyped, isMobile);
  await expect(
    juan.getByText('Whether there is another round is up to the creator.'),
  ).toBeVisible();
  await expect(juan.getByRole('button', { name: 'Same items' })).toHaveCount(0);
  const everyone = ana.getByRole('list', { name: 'Everyone in the room' });
  await expect(everyone.getByRole('img', { name: 'Juan, finished' })).toBeVisible();

  const next = ana.getByLabel('What is the next round comparing them by?');
  await expect(next).toHaveValue(criterion);
  await next.fill('Which fruit is easiest to peel?');
  await ana.getByRole('button', { name: 'Same items' }).click();

  // Back at the start, each with a list of one and a shuffle of their own.
  for (const page of [ana, juan]) {
    await expect(
      page.getByRole('heading', { name: 'Which fruit is easiest to peel?' }),
    ).toBeFocused();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await expect(page.getByRole('img', { name: 'Ana, 1 of 3 placed' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Juan, 1 of 3 placed' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0);
  }

  await handIn(juan, asTyped, isMobile);
  await handIn(ana, asTyped, isMobile);
  await expect(juan.getByRole('table', { name: 'How alike the lists are' })).toBeVisible();

  await ana.getByRole('button', { name: 'Change the list' }).click();
  await expect(juan.getByText('The creator is preparing another list.')).toBeFocused();
  await expect(ana.getByLabel('What are you comparing them by?')).toHaveValue(
    'Which fruit is easiest to peel?',
  );
  await ana.getByLabel('Item 3', { exact: true }).fill('Plum');
  await ana.getByRole('button', { name: 'Start the new round' }).click();

  await expect(ana.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await sortInto(juan, [['Mango'], ['Kiwi'], ['Plum']], isMobile);
  const list = juan.getByRole('region', { name: 'Your list so far' });
  await expect(list.getByText('Plum', { exact: true })).toBeVisible();
  await expect(list.getByText('Peach', { exact: true })).toHaveCount(0);
  await expect(ana.getByRole('img', { name: 'Juan, 3 of 3 placed' })).toBeVisible();

  await expectNoViolations(juan);
  await juan.context().close();
});

// Four fruits and three lists known in advance, Lucía's with a tie. Worked out
// by hand over average positions, where her tie counts as 3.5 for both:
//
// - Mango averages (1 + 2 + 3.5) / 3 and Kiwi (2 + 1 + 3.5) / 3, level at the
//   top, so there is no second: Peach is third at 8 / 3 and Plum fourth at 3.
// - Spearman over the same positions: 3 / 5 = 0.60 for Ana and Juan,
//   -3.5 / sqrt(22.5) = -0.74 for Ana and Lucía, -4.5 / sqrt(22.5) = -0.95 for
//   Juan and Lucía.
// - Peach is the one placed furthest apart, at 3, 4 and 1. Mango (1, 2, 3) and
//   Kiwi (2, 1, 3) come next, spread exactly as wide, and Plum (4, 3, 2) is
//   left out of the three shown. These are the lists' own numbers, so her tie
//   reads 3.
//
// Literals on purpose: worked out by the app's own code they would only check
// it against itself.
const bowl = ['Mango', 'Kiwi', 'Peach', 'Plum'];
const lists = {
  ana: [['Mango'], ['Kiwi'], ['Peach'], ['Plum']],
  juan: [['Kiwi'], ['Mango'], ['Plum'], ['Peach']],
  lucia: [['Peach'], ['Plum'], ['Mango', 'Kiwi']],
};

test('three people sort lists known in advance and every screen reveals what they add up to', async ({
  page: ana,
  browser,
  isMobile,
}, testInfo) => {
  test.slow();
  await createRoom(ana, 'Ana', bowl);
  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();

  const juan = await openPerson(browser, testInfo);
  await juan.goto('/');
  await juan.getByRole('button', { name: 'Join a room' }).click();
  await juan.getByLabel('Room code').fill(code);
  await join(juan, 'Juan');
  const lucia = await openPerson(browser, testInfo);
  await lucia.goto(`/?room=${code}`);
  await join(lucia, 'Lucía');

  const everyone = [ana, juan, lucia];
  for (const page of everyone) {
    for (const nickname of ['Ana', 'Juan', 'Lucía']) {
      await expect(person(page, nickname)).toBeVisible();
    }
    await expect(page.getByText('3 of 20')).toBeVisible();
  }
  await ana.getByRole('button', { name: 'Start' }).click();

  // A whole list handed in leaves Lucía's as it was, with the one item she
  // started with.
  await handIn(juan, lists.juan, isMobile);
  await expect(ana.getByRole('img', { name: 'Juan, finished' })).toBeVisible();
  await expect(ana.getByRole('img', { name: 'Lucía, 1 of 4 placed' })).toBeVisible();
  await expect(lucia.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  const luciaList = lucia.getByRole('region', { name: 'Your list so far' });
  await expect(luciaList.getByRole('button', { name: /^Move / })).toHaveCount(1);

  // On a computer her first item goes in with a real drag, which no other room
  // test makes.
  await handIn(ana, lists.ana, isMobile, { dragFirst: true });
  await expect(juan.getByRole('img', { name: 'Ana, finished' })).toBeVisible();
  for (const page of [ana, juan]) {
    await expect(waiting(page)).toBeVisible();
    await expect(page.getByRole('table', { name: 'How alike the lists are' })).toHaveCount(0);
  }

  // The last list in is a guest's, and it reveals the room to all three.
  await handIn(lucia, lists.lucia, isMobile);

  for (const page of everyone) {
    await expect(page.getByRole('heading', { name: criterion })).toBeFocused();

    // Which of the two comes first inside the shared place is the app's
    // business, so either passes.
    const consensus = page.getByRole('region', { name: 'All the lists together' });
    await expect(consensus.getByRole('listitem')).toHaveText([
      /^Tied\s*1\s*(Mango\s*1\s*Kiwi|Kiwi\s*1\s*Mango)$/,
      /^3\s*Peach$/,
      /^4\s*Plum$/,
    ]);

    const grid = page.getByRole('table', { name: 'How alike the lists are' });
    await expect(grid.getByRole('columnheader')).toHaveText(['Ana', 'Juan', 'Lucía']);
    await expect(grid.getByRole('rowheader')).toHaveText(['Ana', 'Juan', 'Lucía']);
    // After the header row, one row per list. Each pair shows up from both
    // sides, and a list against itself is left blank.
    const rows = grid.getByRole('row');
    await expect(rows.nth(1).getByRole('cell')).toHaveText(['', '0.60', '-0.74']);
    await expect(rows.nth(2).getByRole('cell')).toHaveText(['0.60', '', '-0.95']);
    await expect(rows.nth(3).getByRole('cell')).toHaveText(['-0.74', '-0.95', '']);

    // Mango and Kiwi tie here too, in whichever order.
    const divisive = page.getByRole('region', { name: 'Where the room disagreed most' });
    const split = divisive.getByRole('listitem');
    await expect(split).toHaveCount(3);
    await expect(split.first()).toHaveText(/^Peach\s*Placed anywhere from 1 to 4$/);
    for (const fruit of ['Mango', 'Kiwi']) {
      await expect(split.filter({ hasText: fruit })).toHaveText(/Placed anywhere from 1 to 3$/);
    }
  }

  // Ana's own order down the side, with her place and Lucía's for each item.
  const picker = ana.getByRole('combobox', { name: 'Compare your list with' });
  await picker.selectOption({ label: 'Lucía' });
  const yours = ana.getByRole('region', { name: 'Your list', exact: true });
  await expect(yours.getByText('Affinity: -0.74')).toBeVisible();
  const sideBySide = yours.getByRole('table');
  await expect(sideBySide.getByRole('columnheader')).toHaveText(['Item', 'You', 'Lucía']);
  await expect(sideBySide.getByRole('rowheader')).toHaveText(['Mango', 'Kiwi', 'Peach', 'Plum']);
  await expect(sideBySide.getByRole('cell')).toHaveText(['1', '3', '2', '3', '3', '1', '4', '2']);

  await juan
    .getByRole('combobox', { name: 'Compare your list with' })
    .selectOption({ label: 'Lucía' });
  await expect(juan.getByText('Affinity: -0.95')).toBeVisible();

  for (const page of [juan, lucia]) {
    await expectNoViolations(page);
    await page.context().close();
  }
});

// Ana sorts the three as typed and Juan does the same; Lucía turns it round.
// The six others take the four orders left, two of them twice, and each of
// those sits at 0.50 or -0.50 from Ana's list and Juan's. So for both of them
// the nearest list is the other's and the furthest is Lucía's, with nobody
// level.
const crowd = {
  Juan: ['Mango', 'Kiwi', 'Peach'],
  Lucía: ['Peach', 'Kiwi', 'Mango'],
  Bruno: ['Mango', 'Peach', 'Kiwi'],
  Carla: ['Kiwi', 'Mango', 'Peach'],
  Diego: ['Kiwi', 'Peach', 'Mango'],
  Elena: ['Peach', 'Mango', 'Kiwi'],
  Félix: ['Mango', 'Peach', 'Kiwi'],
  Gala: ['Kiwi', 'Peach', 'Mango'],
};

test('a room of nine shows each person who is most and least like them instead of the grid', async ({
  page: ana,
  browser,
  isMobile,
}, testInfo) => {
  test.slow();
  await createRoom(ana, 'Ana');
  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();

  const guests = await Promise.all(
    Object.entries(crowd).map(async ([nickname, order]) => ({
      nickname,
      intended: order.map((fruit) => [fruit]),
      page: await openPerson(browser, testInfo),
    })),
  );
  await Promise.all(
    guests.map(async ({ nickname, page }) => {
      await page.goto(`/?room=${code}`);
      await join(page, nickname);
    }),
  );
  await expect(ana.getByText('9 of 20')).toBeVisible();
  await ana.getByRole('button', { name: 'Start' }).click();

  await Promise.all(guests.map(({ page, intended }) => handIn(page, intended, isMobile)));
  for (const { nickname, page } of guests) {
    await expect(ana.getByRole('img', { name: `${nickname}, finished` })).toBeVisible();
    await expect(waiting(page)).toBeVisible();
    await expect(page.getByRole('term')).toHaveCount(0);
  }

  await handIn(ana, [['Mango'], ['Kiwi'], ['Peach']], isMobile);

  const juan = guests[0].page;
  for (const page of [ana, ...guests.map((guest) => guest.page)]) {
    await expect(page.getByRole('heading', { name: criterion })).toBeFocused();
    await expect(page.getByRole('term')).toHaveText(['Most like you', 'Least like you']);
    await expect(page.getByRole('table', { name: 'How alike the lists are' })).toHaveCount(0);
  }
  await expect(ana.getByRole('definition')).toHaveText(['Juan 1.00', 'Lucía -1.00']);
  await expect(juan.getByRole('definition')).toHaveText(['Ana 1.00', 'Lucía -1.00']);

  // The room's order is the order they got in, and joining all at once leaves
  // that to chance.
  const others = ana.getByRole('combobox', { name: 'Compare your list with' }).getByRole('option');
  expect((await others.allTextContents()).sort()).toEqual(Object.keys(crowd).sort());

  for (const { page } of guests) {
    await expectNoViolations(page);
    await page.context().close();
  }
});

test('the creator closes the room mid-sort and the guest is told so at once', async ({
  page: ana,
  browser,
}, testInfo) => {
  await createRoom(ana, 'Ana');
  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();
  const juan = await openPerson(browser, testInfo);
  await juan.goto(`/?room=${code}`);
  await join(juan, 'Juan');
  await ana.getByRole('button', { name: 'Start' }).click();
  await expect(juan.getByRole('img', { name: 'Ana, 1 of 3 placed' })).toBeVisible();
  await expect(juan.getByRole('button', { name: 'Close the room' })).toHaveCount(0);

  await ana.getByRole('button', { name: 'Close the room' }).click();
  await ana.getByRole('button', { name: 'Close it' }).click();

  await expect(ana.getByLabel('What are you comparing them by?')).toBeVisible();
  await expect(juan.getByRole('alert')).toHaveText('The creator closed the room.');
  await expectNoViolations(juan);
  await juan.context().close();
});

// Without the goodbye the guest would think the host had only dropped, and
// keep trying for as long as the server holds the code.
// The creator is the one opened by hand here, since the fixture checks its own
// page once the test is over.
test('the creator closes their tab mid-sort and the guest is told so at once', async ({
  page: juan,
  browser,
}, testInfo) => {
  const ana = await openPerson(browser, testInfo);
  await createRoom(ana, 'Ana');
  const code = await ana.locator('strong', { hasText: /^[A-Z2-9]{4}$/ }).innerText();
  await juan.goto(`/?room=${code}`);
  await join(juan, 'Juan');
  await ana.getByRole('button', { name: 'Start' }).click();
  await expect(juan.getByRole('img', { name: 'Ana, 1 of 3 placed' })).toBeVisible();

  await ana.close();

  await expect(juan.getByRole('alert')).toHaveText('The creator closed the room.');
  await expect(juan.getByText('Reconnecting... You can keep sorting.')).toHaveCount(0);
  await juan.getByRole('button', { name: 'Back to my list' }).click();
  await expect(juan).toHaveURL('/');
  await ana.context().close();
});
