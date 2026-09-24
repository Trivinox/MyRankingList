import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// The preview server is meant to send what Vercel will, so the two are held
// together here rather than trusting the config to keep reading the file.
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const policy: string = config.headers[0].headers[0].value;

test('serves the page with the policy from vercel.json', async ({ page }) => {
  const response = await page.goto('/');

  // The one difference is the local signaling server, which production must
  // never be allowed to reach.
  expect(policy).not.toContain('localhost');
  expect(response?.headers()['content-security-policy']).toBe(
    policy.replace(
      "connect-src 'self'",
      "connect-src 'self' http://localhost:9000 ws://localhost:9000",
    ),
  );
});
