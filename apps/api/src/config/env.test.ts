import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('env loader', () => {
  it('accepts dev defaults when nothing is set', async () => {
    process.env = { NODE_ENV: 'development' };
    const mod = await import('./env.js');
    expect(mod.env.PORT).toBe(3001);
    expect(mod.env.DATABASE_URL).toContain('postgresql://');
    expect(mod.env.REDIS_URL).toContain('redis://');
    expect(mod.env.NODE_ENV).toBe('development');
  });

  it('coerces PORT from string', async () => {
    process.env = { NODE_ENV: 'development', PORT: '4000' };
    const mod = await import('./env.js');
    expect(mod.env.PORT).toBe(4000);
  });

  it('rejects an invalid URL in DATABASE_URL', async () => {
    process.env = { NODE_ENV: 'development', DATABASE_URL: 'not-a-url' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('rejects an invalid LOG_LEVEL', async () => {
    process.env = { NODE_ENV: 'development', LOG_LEVEL: 'verbose' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('rejects out-of-range PORT', async () => {
    process.env = { NODE_ENV: 'development', PORT: '99999' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('coerces MINIO_USE_SSL boolean from string', async () => {
    process.env = { NODE_ENV: 'development', MINIO_USE_SSL: 'true' };
    const mod = await import('./env.js');
    expect(mod.env.MINIO_USE_SSL).toBe(true);
  });
});

/**
 * The `prodRequired` contract.
 *
 * `prodRequired(schema).default('dev-value')` reads like "required in
 * production, defaulted in dev" and does the opposite: `.default()` applies to
 * the *result*, so in production the schema becomes `schema.default('dev-value')`
 * and a missing variable parses successfully — handing the app a value that is
 * committed to this repository instead of refusing to boot.
 *
 * That shipped twice (SESSION_SECRET, INTERNAL_API_SECRET), so the behaviour is
 * pinned here against the real module rather than a re-implementation.
 */
describe('prodRequired — production must not fall back to a committed default', () => {
  /** Everything config/env.ts needs in production, minus the field under test. */
  const PROD_BASE: Record<string, string> = {
    NODE_ENV: 'production',
    SESSION_SECRET: 'a-real-session-secret-at-least-32-chars',
    INTERNAL_API_SECRET: 'a-real-internal-secret-at-least-32-chars',
    DMARC_INBOUND_SECRET: 'a-real-dmarc-secret-16+',
    MINIO_ACCESS_KEY: 'real-access-key',
    MINIO_SECRET_KEY: 'real-secret-key',
  };

  /** Security-critical fields and the dev default each one carries. */
  const CRITICAL: Array<{ name: string; devDefault: string; realValue: string }> = [
    {
      name: 'SESSION_SECRET',
      devDefault: 'dev-cookie-secret-change-in-production',
      realValue: 'a-real-session-secret-at-least-32-chars',
    },
    {
      name: 'INTERNAL_API_SECRET',
      devDefault: 'dev-internal-secret-change-in-production',
      realValue: 'a-real-internal-secret-at-least-32-chars',
    },
    { name: 'MINIO_ACCESS_KEY', devDefault: 'minioadmin', realValue: 'real-access-key' },
    { name: 'MINIO_SECRET_KEY', devDefault: 'minioadmin', realValue: 'real-secret-key' },
  ];

  for (const field of CRITICAL) {
    describe(field.name, () => {
      it('production + unset → boot fails, no fallback to the dev default', async () => {
        const env: Record<string, string> = { ...PROD_BASE };
        delete env[field.name];
        process.env = env;

        // In production the loader calls process.exit(1). Stub it so the run
        // survives; the code then falls through to the throw we assert on.
        const exit = vi
          .spyOn(process, 'exit')
          .mockImplementation((() => undefined) as unknown as typeof process.exit);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
        expect(exit).toHaveBeenCalledWith(1);

        exit.mockRestore();
        error.mockRestore();
      });

      it('production + set → parse succeeds with the supplied value', async () => {
        process.env = { ...PROD_BASE };
        const mod = await import('./env.js');
        expect((mod.env as unknown as Record<string, unknown>)[field.name]).toBe(field.realValue);
      });

      it('development + unset → parse succeeds with the dev default', async () => {
        process.env = { NODE_ENV: 'development' };
        const mod = await import('./env.js');
        expect((mod.env as unknown as Record<string, unknown>)[field.name]).toBe(field.devDefault);
      });
    });
  }

  it('a production boot never yields any committed dev default', async () => {
    process.env = { ...PROD_BASE };
    const mod = await import('./env.js');
    const values = Object.values(mod.env as unknown as Record<string, unknown>);

    for (const banned of [
      'dev-cookie-secret-change-in-production',
      'dev-internal-secret-change-in-production',
      'minioadmin',
    ]) {
      expect(values).not.toContain(banned);
    }
  });
});
