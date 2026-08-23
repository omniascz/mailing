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
    testTimeout: 10_000,
    hookTimeout: 30_000,
  },
});
