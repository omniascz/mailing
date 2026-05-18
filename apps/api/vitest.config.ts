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
    testTimeout: 10_000,
  },
});
