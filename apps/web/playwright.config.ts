import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for end-to-end smoke tests.
 *
 * The smoke suite is intentionally tiny — it boots `next start` (or
 * `next dev` locally) against a running API + dev stack and walks the
 * golden path. It's not a replacement for unit tests; it's the canary
 * that catches "the dashboard doesn't render at all" regressions.
 *
 * Local: `pnpm --filter @forgemsg/web test:e2e`
 * CI: only enabled when `RUN_E2E=1` to keep the default CI fast.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Playwright can boot the dev server itself, but for the monorepo it's
  // simpler to require the dev stack be up beforehand (postgres + redis +
  // api + web). See scripts/dev-stack.sh.
});
