import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// The preview server is meant to send what Vercel will, so the two are held
// together here rather than trusting the config to keep reading the file.
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const policy: string = config.headers[0].headers[0].value;

test('serves the page with the policy from vercel.json', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.headers()['content-security-policy']).toBe(policy);
});
