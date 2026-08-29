import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared/sms-sender': path.resolve(__dirname, '../../packages/shared-sms/src/index.ts'),
      '@shared/ai-provider': path.resolve(__dirname, '../../packages/shared-ai/src/index.ts'),
      '@shared/webhooks': path.resolve(__dirname, '../../packages/shared-webhooks/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // src/integration/** needs a migrated + seeded Postgres and a live Redis.
    // It runs from vitest.integration.config.ts via `pnpm test:integration`,
    // never as part of the infrastructure-free unit suite.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/integration/**'],
    env: {
      // Eight files in this suite boot the whole app through buildApp(), which
      // starts the wedged-connection watchdog (db/stuck-connection-reaper.ts).
      // The watchdog polls pg_stat_activity on a timer, so unlike every other
      // part of the app it does not wait to be asked — it would reach for a
      // database this suite deliberately does not have. Measured against a
      // dead port: five `connect ECONNREFUSED` errors in six seconds, one per
      // tick, on any app that outlives the interval. Nothing fails today only
      // because those apps are closed within it. Off here keeps this suite
      // infrastructure-free by construction rather than by luck; the wiring is
      // covered where a database exists, in
      // src/integration/stuck-connection-reaper.integration.test.ts.
      DB_STUCK_CONNECTION_REAPER: 'off',
    },
    testTimeout: 10_000,
    hookTimeout: 30_000,
  },
});
