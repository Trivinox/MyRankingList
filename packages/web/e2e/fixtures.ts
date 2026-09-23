import { expect, test as base } from '@playwright/test';

type Watched = { __policyViolations: string[] };

// Every spec runs under the policy vite preview sends, but a blocked request
// is only a console error and the page carries on without it. This turns each
// one into a failure at the end of the test that caused it.
export const test = base.extend({
  page: async ({ page }, run) => {
    await page.addInitScript(() => {
      const watched = window as unknown as Watched;
      watched.__policyViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        watched.__policyViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });

    await run(page);

    const violations = await page.evaluate(() => (window as unknown as Watched).__policyViolations);
    expect(violations, 'blocked by the Content Security Policy').toEqual([]);
  },
});

export { expect };
