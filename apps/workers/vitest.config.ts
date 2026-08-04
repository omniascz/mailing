/**
 * Unit suite — must run with no infrastructure at all.
 *
 * The default include (`**\/*.test.ts`) also matches
 * `src/integration/**\/*.integration.test.ts`, so without this exclude the
 * unit run picks up the integration tests, tries to reach a Postgres/Redis/API
 * that are not there, and fails. The integration suite has its own config with
 * a preflight that requires those services.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'src/integration/**'],
  },
});
