/**
 * Workers integration suite — mirrors apps/api/vitest.integration.config.ts.
 *
 * Unlike the API suite, this one additionally needs a RUNNING API process: the
 * jobs under test reach the database only through /api/v1/internal/*, so with
 * no API listening they would fail open and prove nothing. The preflight in
 * src/integration/setup/global-setup.ts refuses to start without it.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/integration/**/*.integration.test.ts'],
    globalSetup: ['src/integration/setup/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
