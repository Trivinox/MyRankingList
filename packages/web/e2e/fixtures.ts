import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

type Watched = { __policyViolations: string[] };

// Every spec runs under the policy vite preview sends, but a blocked request
// is only a console error and the page carries on without it. These turn each
// one into a failure at the end of the test that caused it. A spec that opens
// pages of its own watches them with the same two calls.
export async function watchPolicy(page: Page) {
  await page.addInitScript(() => {
    const watched = window as unknown as Watched;
    watched.__policyViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      watched.__policyViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

export async function expectNoViolations(page: Page) {
  const violations = await page.evaluate(() => (window as unknown as Watched).__policyViolations);
  expect(violations, 'blocked by the Content Security Policy').toEqual([]);
}

export const test = base.extend({
  page: async ({ page }, run) => {
    await watchPolicy(page);
    await run(page);
    await expectNoViolations(page);
  },
});

export { expect };
