import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the web app.
 *
 * The Playwright suite lives under `e2e/` and uses `test.describe` from
 * `@playwright/test`, which vitest can't run. Exclude that directory so
 * `pnpm test` at the repo root doesn't try (and fail) to load it.
 *
 * Run Playwright separately with `pnpm --filter @forgemsg/web test:e2e`.
 *
 * `environment: 'node'` with no DOM is deliberate and does NOT stop components
 * from being tested: `renderToStaticMarkup` from react-dom/server needs no
 * document. It does mean no hooks, no effects and no events — a `'use client'`
 * component can be rendered for its initial markup only, which is why the
 * client-side form is covered through the pure payload builder it exports
 * rather than by clicking it.
 *
 * The `@` alias mirrors tsconfig `paths`; without it a test cannot import
 * anything under src that uses the alias, which is nearly every component.
 */
export default defineConfig({
  // Next compiles JSX with the automatic runtime; the tsconfig says
  // `jsx: preserve` and leaves that to the bundler, so esbuild here falls back
  // to the classic transform and every rendered component dies on
  // `ReferenceError: React is not defined`. Say it explicitly.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.next/**'],
    passWithNoTests: true,
  },
});
