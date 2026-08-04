import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { productionIssues } from './env.js';

const ORIGINAL_ENV = { ...process.env };

/**
 * The datastore trio has no defaults since lib/env.ts merged in here, so every
 * case that expects a successful parse has to supply them.
 */
const REQUIRED = {
  DATABASE_URL: 'postgresql://u:p@db.internal:5432/forgemsg',
  REDIS_URL: 'redis://redis.internal:6379',
  JWT_SECRET: 'a-real-jwt-secret-64-bytes-random-value',
} as const;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('env loader', () => {
  it('accepts dev defaults when nothing is set', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED };
    const mod = await import('./env.js');
    expect(mod.env.PORT).toBe(3001);
    expect(mod.env.DATABASE_URL).toContain('postgresql://');
    expect(mod.env.REDIS_URL).toContain('redis://');
    expect(mod.env.NODE_ENV).toBe('development');
  });

  it('coerces PORT from string', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, PORT: '4000' };
    const mod = await import('./env.js');
    expect(mod.env.PORT).toBe(4000);
  });

  it('rejects an invalid URL in DATABASE_URL', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, DATABASE_URL: 'not-a-url' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('rejects an invalid LOG_LEVEL', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, LOG_LEVEL: 'verbose' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('rejects out-of-range PORT', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, PORT: '99999' };
    await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('coerces MINIO_USE_SSL boolean from string', async () => {
    process.env = { NODE_ENV: 'development', ...REQUIRED, MINIO_USE_SSL: 'true' };
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
    ...REQUIRED,
    API_PUBLIC_URL: 'https://api.example.com',
    APP_URL: 'https://app.example.com',
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
        process.env = { NODE_ENV: 'development', ...REQUIRED };
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

/**
 * The post-parse production checks, which used to live in a second module
 * (`lib/env.ts`) that was imported for its side effect on index.ts line 3.
 * When the two modules merged, these were the part most likely to be dropped
 * silently — nothing else references them.
 */
describe('productionIssues — checks carried over from the old lib/env.ts', () => {
  const VALID: Parameters<typeof productionIssues>[0] = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-real-jwt-secret-64-bytes-random-value',
    DATABASE_URL: 'postgresql://u:p@db.internal:5432/forgemsg',
    API_PUBLIC_URL: 'https://api.example.com',
    APP_URL: 'https://app.example.com',
  } as Parameters<typeof productionIssues>[0];

  it('a fully-configured production env has no issues', () => {
    expect(productionIssues(VALID)).toEqual([]);
  });

  it('flags a JWT_SECRET that is still the dev placeholder', () => {
    expect(productionIssues({ ...VALID, JWT_SECRET: 'dev-secret-abc' })).toEqual([
      expect.stringContaining('JWT_SECRET still looks like the dev placeholder'),
    ]);
    // The second half of the condition: anything containing "change".
    expect(productionIssues({ ...VALID, JWT_SECRET: 'please-change-me-now' })).toEqual([
      expect.stringContaining('JWT_SECRET still looks like the dev placeholder'),
    ]);
  });

  it('flags a DATABASE_URL pointing at localhost or 127.0.0.1', () => {
    for (const url of ['postgresql://u:p@localhost:5432/f', 'postgresql://u:p@127.0.0.1:5432/f']) {
      expect(productionIssues({ ...VALID, DATABASE_URL: url })).toEqual([
        expect.stringContaining('DATABASE_URL points at localhost in production'),
      ]);
    }
  });

  it('flags a missing API_PUBLIC_URL', () => {
    expect(productionIssues({ ...VALID, API_PUBLIC_URL: undefined })).toEqual([
      expect.stringContaining('API_PUBLIC_URL must be set in production'),
    ]);
  });

  it('flags a missing APP_URL', () => {
    expect(productionIssues({ ...VALID, APP_URL: undefined })).toEqual([
      expect.stringContaining('APP_URL must be set in production'),
    ]);
  });

  it('reports every problem at once rather than only the first', () => {
    const issues = productionIssues({
      ...VALID,
      JWT_SECRET: 'dev-x',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/f',
      API_PUBLIC_URL: undefined,
      APP_URL: undefined,
    });
    expect(issues).toHaveLength(4);
  });

  it('is inert outside production', () => {
    expect(
      productionIssues({
        ...VALID,
        NODE_ENV: 'development',
        JWT_SECRET: 'dev-x',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/f',
        API_PUBLIC_URL: undefined,
        APP_URL: undefined,
      }),
    ).toEqual([]);
  });
});

describe('merged schema — datastore fields lost their defaults on purpose', () => {
  // lib/env.ts required these with no default and ran first, so a boot without
  // them already failed. Re-adding the localhost defaults during the merge
  // would have been a regression wearing a refactor's clothes.
  for (const field of ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'] as const) {
    it(`${field} is required — a real (non-test) boot without it fails`, async () => {
      // VITEST=false disables the lax test branch, so the schema is what a
      // deployed process would see.
      process.env = { NODE_ENV: 'development', VITEST: 'false' };
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(import('./env.js')).rejects.toThrow(/Invalid environment/);

      error.mockRestore();
    });
  }

  it('the test branch still supplies datastore values so unit tests can boot', async () => {
    process.env = { NODE_ENV: 'test', VITEST: 'true' };
    const mod = await import('./env.js');
    expect(mod.env.DATABASE_URL).toContain('postgresql://');
    expect(mod.env.REDIS_URL).toContain('redis://');
    expect(mod.env.JWT_SECRET).toBeTruthy();
  });
});
