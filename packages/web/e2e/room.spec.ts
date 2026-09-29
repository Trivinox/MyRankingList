import { expect, expectNoViolations, test, watchPolicy } from './fixtures.ts';
import type { Browser, Page, TestInfo } from '@playwright/test';

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

async function createRoom(page: Page, nickname: string) {
  await page.goto('/');
  await page.getByLabel('What are you comparing them by?').fill('Which fruit do you like more?');
  for (const [index, name] of ['Mango', 'Kiwi', 'Peach'].entries()) {
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
    await expect(page.getByText('Which fruit do you like more?')).toBeVisible();
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
    await expect(
      page.getByRole('heading', { name: 'Which fruit do you like more?' }),
    ).toBeVisible();
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

  const top = juan.getByRole('button', { name: 'Put it at position 1', exact: true });
  for (let placed = 2; placed <= 3; placed++) {
    if (isMobile) {
      await top.tap();
    } else {
      await top.click();
    }
    await expect(juan.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(placed));
  }
  await juan.getByRole('button', { name: 'Finish' }).click();
  await juan.getByRole('button', { name: 'Yes, hand it in' }).click();

  const waiting = juan.getByText('Your list is in. Waiting for the others to finish.', {
    exact: false,
  });
  await expect(waiting).toBeVisible();
  await expect(juan.getByRole('button', { name: /^Move / })).toHaveCount(0);
  await expect(ana.getByRole('img', { name: 'Juan, finished' })).toBeVisible();
  await expect(ana.getByRole('img', { name: 'Ana, 1 of 3 placed' })).toBeVisible();
  const list = juan.getByRole('region', { name: 'Your list so far' });
  const before = (await list.textContent()) ?? '';

  // Leaving now asks first. Staying is what the question is for, but a
  // reload has to go through for the tab record to be put to the test.
  juan.on('dialog', (dialog) => void dialog.accept());
  await juan.reload();

  await expect(waiting).toBeVisible();
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

  const handIn = async (page: Page) => {
    const top = page.getByRole('button', { name: 'Put it at position 1', exact: true });
    for (let placed = 2; placed <= 3; placed++) {
      if (isMobile) {
        await top.tap();
      } else {
        await top.click();
      }
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(placed));
    }
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByRole('button', { name: 'Yes, hand it in' }).click();
  };

  await handIn(juan);
  await expect(ana.getByRole('img', { name: 'Juan, finished' })).toBeVisible();
  await expect(juan.getByRole('table', { name: 'How alike the lists are' })).toHaveCount(0);
  await handIn(ana);

  for (const page of [ana, juan]) {
    await expect(
      page.getByRole('heading', { name: 'Which fruit do you like more?' }),
    ).toBeFocused();
    const consensus = page.getByRole('region', { name: 'All the lists together' });
    for (const fruit of ['Mango', 'Kiwi', 'Peach']) {
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

  const place = async (page: Page) => {
    const top = page.getByRole('button', { name: 'Put it at position 1', exact: true });
    for (let placed = 2; placed <= 3; placed++) {
      if (isMobile) {
        await top.tap();
      } else {
        await top.click();
      }
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(placed));
    }
  };
  const handIn = async (page: Page) => {
    await place(page);
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByRole('button', { name: 'Yes, hand it in' }).click();
  };

  await handIn(juan);
  await handIn(ana);
  await expect(
    juan.getByText('Whether there is another round is up to the creator.'),
  ).toBeVisible();
  await expect(juan.getByRole('button', { name: 'Same items' })).toHaveCount(0);

  const next = ana.getByLabel('What is the next round comparing them by?');
  await expect(next).toHaveValue('Which fruit do you like more?');
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

  await handIn(juan);
  await handIn(ana);
  await expect(juan.getByRole('table', { name: 'How alike the lists are' })).toBeVisible();

  await ana.getByRole('button', { name: 'Change the list' }).click();
  await expect(juan.getByText('The creator is preparing another list.')).toBeFocused();
  await expect(ana.getByLabel('What are you comparing them by?')).toHaveValue(
    'Which fruit is easiest to peel?',
  );
  await ana.getByLabel('Item 3', { exact: true }).fill('Plum');
  await ana.getByRole('button', { name: 'Start the new round' }).click();

  await expect(ana.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await place(juan);
  const list = juan.getByRole('region', { name: 'Your list so far' });
  await expect(list.getByText('Plum', { exact: true })).toBeVisible();
  await expect(list.getByText('Peach', { exact: true })).toHaveCount(0);
  await expect(ana.getByRole('img', { name: 'Juan, 3 of 3 placed' })).toBeVisible();

  await expectNoViolations(juan);
  await juan.context().close();
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
