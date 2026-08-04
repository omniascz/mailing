/**
 * Centralised, Zod-validated environment loader for the API.
 *
 * Goals:
 *   1. Fail fast at boot when required vars are missing in production.
 *   2. Provide one typed `env` object so call sites don't reach into
 *      `process.env` and lose type safety.
 *   3. Tolerate dev/test by defaulting to localhost dependencies.
 *
 * Usage:
 *   import { env } from './config/env.js';
 *   await connect(env.DATABASE_URL);
 */

import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Makes `.default()` un-callable on the result.
 *
 * `.default` still exists at runtime — this is a type-level block, not a
 * deletion — but calling it is a compile error, which is the point: the bug
 * this guards against was invisible at review and only showed up when someone
 * booted production without the variable set.
 */
type NoChainedDefault<T> = T & { readonly default: never };

/**
 * Required in production, relaxed in dev/test.
 *
 * Do NOT write `prodRequired(schema).default('dev-value')`. `.default()` is
 * applied to the *result*, so in production the schema becomes
 * `schema.default('dev-value')` — a missing variable then parses successfully
 * and the app silently runs on a value published in this repository, instead
 * of refusing to boot. That is exactly how SESSION_SECRET and
 * INTERNAL_API_SECRET were both wrong.
 *
 * Pass the dev default as the second argument instead. It is applied only when
 * NODE_ENV is not production, so the two cases cannot be conflated:
 *
 *   SESSION_SECRET: prodRequired(z.string().min(32), 'dev-cookie-secret-…')
 *
 * The return type also makes the wrong form a typecheck error rather than a
 * production incident.
 */
function prodRequired<T extends z.ZodString>(schema: T): NoChainedDefault<T | z.ZodOptional<T>>;
function prodRequired<T extends z.ZodString>(
  schema: T,
  devDefault: string,
): NoChainedDefault<T | z.ZodDefault<T>>;
function prodRequired<T extends z.ZodString>(schema: T, devDefault?: string) {
  if (isProduction) return schema as NoChainedDefault<T>;
  return (
    devDefault === undefined ? schema.optional() : schema.default(devDefault)
  ) as NoChainedDefault<z.ZodOptional<T> | z.ZodDefault<T>>;
}

const Env = z.object({
  // ─── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  // ─── Public URLs ──────────────────────────────────────────────────────────
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // ─── Datastores ───────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url().default('postgresql://forgemsg:forgemsg@localhost:5432/forgemsg'),
  EU_DATABASE_URL: z.string().url().optional(),
  AP_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CLICKHOUSE_URL: z.string().url().default('http://localhost:8123'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),

  // ─── Object storage (MinIO in dev, S3 in prod) ────────────────────────────
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  // Object-storage credentials. `minioadmin/minioadmin` is the MinIO default
  // and is in this file, so booting production on it means anyone can read and
  // write the bucket. Required in production, defaulted only in dev.
  MINIO_ACCESS_KEY: prodRequired(z.string(), 'minioadmin'),
  MINIO_SECRET_KEY: prodRequired(z.string(), 'minioadmin'),
  MINIO_BUCKET: z.string().default('forgemsg'),
  MINIO_USE_SSL: z.coerce.boolean().default(false),

  // ─── Secrets (must be set in prod) ────────────────────────────────────────
  SESSION_SECRET: prodRequired(z.string().min(32), 'dev-cookie-secret-change-in-production'),
  // Shared secret for /api/v1/internal/*. Required in production — the API is
  // published on an internet-facing ingress with `path: /`, so an unset secret
  // means those routes are open to the world. Dev/test get a fixed default so
  // the worker↔API loop works out of the box.
  INTERNAL_API_SECRET: prodRequired(z.string().min(32), 'dev-internal-secret-change-in-production'),
  DMARC_INBOUND_SECRET: prodRequired(z.string().min(16)),

  // ─── External providers ───────────────────────────────────────────────────
  ANTHROPIC_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // ─── Email / DMARC / deliverability ───────────────────────────────────────
  DMARC_REPORT_EMAIL: z.string().email().default('dmarc-reports@forgemsg.com'),

  // ─── Filesystem (dev-only paths) ──────────────────────────────────────────
  IMPORT_UPLOAD_DIR: z.string().optional(),
});

export type Env = z.infer<typeof Env>;

function loadEnv(): Env {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    // Boot can't continue without a valid env — exit with a useful message.

    console.error(`✖ Invalid environment configuration:\n${issues}`);
    if (isProduction) {
      process.exit(1);
    }
    // In dev/test, throw so tests surface the problem instead of half-booting.
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}

export const env: Env = loadEnv();
