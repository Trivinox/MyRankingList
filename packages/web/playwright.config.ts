import { defineConfig, devices } from '@playwright/test';

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  // A retry would pass a test that fails one run in five, and that is exactly
  // the kind of flakiness these runs are here to catch.
  retries: 0,
  workers: ci ? 1 : undefined,
  forbidOnly: ci,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // 412px wide with touch: the phone layout, where every placement is a tap.
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    // The production build, as Vercel will serve it, rather than the dev server.
    {
      command: 'vite build && vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !ci,
    },
    // Never reused: one left running by `npm run dev` only lets in the Vite dev
    // server's origin, and every room test would fail on CORS instead of
    // saying the port is taken.
    {
      command: 'npm run dev --workspace=packages/signaling-server',
      cwd: '../..',
      port: 9000,
      env: { ALLOWED_ORIGIN: 'http://localhost:4173' },
      reuseExistingServer: false,
    },
  ],
});
