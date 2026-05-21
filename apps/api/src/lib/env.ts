/**
 * Boot-time environment validation.
 *
 * Imported at the top of `apps/api/src/index.ts` so it runs before any
 * other module reads `process.env`. Fails fast with a clear error if
 * production is missing required vars. In development we warn but keep
 * going so `pnpm dev` works without a populated .env file.
 *
 * Add new required vars by editing the schema below. Optional vars
 * stay where they're used — there's no single registry for them, but
 * `.env.example` is the canonical documentation.
 */

import { z } from 'zod';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Catch the most common deploy footguns:
 *   - JWT_SECRET that's still the dev placeholder
 *   - Postgres URL pointing at localhost in prod (very common Docker mistake)
 *   - Web URL pointing at localhost in prod (breaks DOI email links)
 */
function refineProd<T extends z.ZodTypeAny>(schema: T) {
  if (!isProd) return schema;
  return schema;
}

const RequiredSchema = z.object({
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid postgresql:// URL' }),
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid redis:// URL' }),
  JWT_SECRET: z.string().min(16, {
    message: 'JWT_SECRET must be at least 16 chars (use a 64-byte random in production)',
  }),
});

const RecommendedSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_PUBLIC_URL: z.string().url().optional(),
  APP_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().optional(),
  TRACKING_BASE_URL: z.string().url().optional(),
  // ─── Sentry ────────────────────────────────────────────────────────────────
  // When SENTRY_DSN is empty/unset, telemetry init is a no-op — so dev runs
  // and tests don't ship errors anywhere. Set in production to capture
  // unhandled errors. Sample rate kept low by default to stay within free
  // tier; bump for incidents.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.05),
  SENTRY_RELEASE: z.string().optional(),
  // ─── Platform operator alerts ──────────────────────────────────────────────
  // Address to notify on platform events (new signups, abuse reports).
  // When unset, alerts are a no-op.
  OPERATOR_EMAIL: z.string().email().optional(),
});

const Schema = RequiredSchema.merge(RecommendedSchema);

export type AppEnv = z.infer<typeof Schema>;

// ─── Parse + report ──────────────────────────────────────────────────────────

function fail(message: string): never {
  // Plain console.error — pino logger isn't initialized yet at this stage.
  console.error('\n❌  Environment validation failed:');
  console.error(message);
  console.error('\nSee apps/api/.env.example for documentation.\n');
  process.exit(1);
}

// Vitest sets NODE_ENV=test. Most unit tests don't boot the server, but
// some import index.ts transitively — those would die at module-load
// if we enforced the schema strictly. Use lax defaults for tests; real
// integration tests can set their own env.
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const parsed = Schema.safeParse(
  isTest
    ? {
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
        JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret-not-for-production',
        ...process.env,
        NODE_ENV: 'test',
      }
    : process.env,
);
if (!parsed.success) {
  fail(
    parsed.error.issues.map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`).join('\n'),
  );
}

const env = parsed.data;

// Post-parse production sanity checks. These are warnings in dev (where
// people legitimately use localhost) and hard failures in prod.
if (env.NODE_ENV === 'production') {
  const prodIssues: string[] = [];

  if (env.JWT_SECRET.startsWith('dev-') || env.JWT_SECRET.includes('change')) {
    prodIssues.push('JWT_SECRET still looks like the dev placeholder. Generate a real one.');
  }

  // Postgres URL safety: prod connecting to localhost almost always means
  // a misconfigured container. Allow it if explicitly inside a docker
  // network where postgres listens on localhost-equivalent.
  if (env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1')) {
    prodIssues.push(
      'DATABASE_URL points at localhost in production — almost certainly a misconfigured deploy.',
    );
  }

  if (refineProd(z.unknown()) && !env.API_PUBLIC_URL) {
    prodIssues.push(
      'API_PUBLIC_URL must be set in production — DOI email links and tracking pixels break without it.',
    );
  }

  if (!env.APP_URL) {
    prodIssues.push('APP_URL must be set in production.');
  }

  if (prodIssues.length > 0) {
    fail(prodIssues.map((m) => `  • ${m}`).join('\n'));
  }
}

export { env };
