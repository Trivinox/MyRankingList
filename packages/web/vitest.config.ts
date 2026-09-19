import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Component tests opt into jsdom per file instead of paying for it here.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // The default would also pick up e2e/*.spec.ts, which is Playwright's.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
