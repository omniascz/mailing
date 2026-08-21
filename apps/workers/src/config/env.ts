/**
 * Centralised env loader for the workers process.
 * See `apps/api/src/config/env.ts` for design notes.
 */
import { z } from 'zod';
import { DEV_TRACKING_SECRET } from '@forgemsg/shared';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Blocks `.default()` at the type level. See apps/api/src/config/env.ts for
 * why this exists and why the helper is duplicated rather than shared.
 */
type NoChainedDefault<T> = T & { readonly default: never };

/**
 * Required in production, relaxed in dev/test. The dev default is the second
 * argument — never `prodRequired(schema).default(...)`, which applies the
 * default in production too.
 */
function prodRequired<T extends z.ZodString>(schema: T): NoChainedDefault<T | z.ZodOptional<T>>;
function prodRequired<T extends z.ZodString>(
  schema: T,
  devDefault: string,
): NoChainedDefault<T | z.ZodDefault<T>>;
function prodRequired<T extends z.ZodString>(schema: T, devDefault?: string) {
  if (isProduction) return schema as NoChainedDefault<T>;
  // `as never` on the default: this package is on zod 4 (the API is still on
  // zod 3), and zod 4 types `.default()` on a generic T as a getter returning
  // NoUndefined<output<T>>. The runtime accepts a plain value either way.
  return (
    devDefault === undefined ? schema.optional() : schema.default(devDefault as never)
  ) as NoChainedDefault<z.ZodOptional<T> | z.ZodDefault<T>>;
}

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Datastores
  DATABASE_URL: z.string().url().default('postgresql://forgemsg:forgemsg@localhost:5432/forgemsg'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CLICKHOUSE_URL: z.string().url().default('http://localhost:8123'),

  // MTA engine — workers dispatch to it via gRPC
  ENGINE_GRPC_URL: z.string().default('localhost:50051'),

  // Object storage
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  // `minioadmin/minioadmin` is the MinIO default and is written in this file.
  // The workers write attachments and exports to this bucket, so a production
  // boot on it means anyone who reads this repo can read and overwrite them.
  MINIO_ACCESS_KEY: prodRequired(z.string(), 'minioadmin'),
  MINIO_SECRET_KEY: prodRequired(z.string(), 'minioadmin'),
  MINIO_BUCKET: z.string().default('forgemsg'),

  // HMAC-SHA256 over the open pixel and every wrapped link. The workers are the
  // side that *creates* these tokens (batch-sender injects them); the API
  // verifies them. Both read packages/shared, which reads this variable, so the
  // two processes must be given the same value or nothing verifies.
  TRACKING_SECRET: prodRequired(z.string().min(32), DEV_TRACKING_SECRET),

  // External providers used in jobs
  ANTHROPIC_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),

  // Tunables
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(10),

  // Sentry — no-op when SENTRY_DSN is empty (default).
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.05),
  SENTRY_RELEASE: z.string().optional(),

  // ─── Bounce handling ───────────────────────────────────────────────────────
  // VERP envelope sender domain. batch-sender encodes the Message-ID into
  // `bounce+<id>@<this domain>` and sets it as Return-Path, so an out-of-band
  // DSN can be matched back to the exact send (decoded by decodeVerp on the
  // inbound side).
  //
  // It read `process.env.VERP_BOUNCE_DOMAIN ?? ''` at one call site and existed
  // nowhere else — not in .env.example, not in compose, not in a schema. With
  // it unset the Return-Path is empty and the engine falls back to the header
  // From (smtp/sender.go:169), so DSNs go to the customer's own mailbox and we
  // never see them. Sending still works; bounce processing goes blind, which on
  // a shared IP pool is how the pool gets burned.
  //
  // prodRequired, not required-everywhere: this loader parses raw process.env
  // with no test lane, and every unit test transitively imports it through
  // lib/telemetry.js. Production is where the silence costs something.
  //
  // Setting this is necessary, not sufficient: the domain also needs MX
  // pointing at the inbound receiver, which is ops, not code.
  VERP_BOUNCE_DOMAIN: prodRequired(
    z
      .string()
      .min(1, 'VERP_BOUNCE_DOMAIN must not be empty')
      .regex(
        /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)([.](?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/,
        'VERP_BOUNCE_DOMAIN must be a bare domain such as bounce.example.com — no scheme, no path, no @',
      ),
  ),
});

export type Env = z.infer<typeof Env>;

function loadEnv(): Env {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (i: { path: PropertyKey[]; message: string }) =>
          `  - ${i.path.join('.') || '<root>'}: ${i.message}`,
      )
      .join('\n');

    console.error(`✖ Invalid environment configuration:\n${issues}`);
    if (isProduction) process.exit(1);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}

export const env: Env = loadEnv();
