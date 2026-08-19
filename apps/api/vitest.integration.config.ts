/**
 * Integration suite — deliberately separate from vitest.config.ts.
 *
 * The unit suite runs with no infrastructure and must stay that way. This one
 * refuses to start unless a migrated, seeded Postgres and a live Redis are
 * reachable (see src/integration/setup/global-setup.ts).
 *
 * The include glob is scoped to src/integration/ rather than
 * `src/**\/*.integration.test.ts`, because src/mailing-journey.integration.test.ts
 * already matches that pattern and belongs to the unit suite.
 */
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
    include: ['src/integration/**/*.integration.test.ts'],
    globalSetup: ['src/integration/setup/global-setup.ts'],
    env: {
      // Layer 2 of the raw-SQL check: EXPLAIN every statement the app actually
      // composes, before it runs. This is the only place it is switched on —
      // the unit suite never reaches a database, and db/explain-guard.ts
      // refuses to arm under NODE_ENV=production whatever this says.
      SQL_EXPLAIN_GUARD: '1',
    },
    // Booting the whole Fastify app and doing a bcrypt(cost 12) login is
    // slower than a unit test; and these must not run concurrently against
    // shared rows.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
