import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the web app.
 *
 * The Playwright suite lives under `e2e/` and uses `test.describe` from
 * `@playwright/test`, which vitest can't run. Exclude that directory so
 * `pnpm test` at the repo root doesn't try (and fail) to load it.
 *
 * Run Playwright separately with `pnpm --filter @forgemsg/web test:e2e`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.next/**'],
    passWithNoTests: true,
  },
});
