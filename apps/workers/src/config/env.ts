/**
 * Centralised env loader for the workers process.
 * See `apps/api/src/config/env.ts` for design notes.
 */
import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

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
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('forgemsg'),

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
