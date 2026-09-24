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
