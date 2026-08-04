/**
 * Workers integration preflight.
 *
 * Stricter than the API's, on purpose. Jobs in this package never touch the
 * database directly — every read goes through /api/v1/internal/*, and every one
 * of those fetches fails OPEN on a transport error. So an integration test run
 * with no API listening would not error; it would quietly exercise the
 * fail-open branch of every filter and go green while proving nothing.
 *
 * Three things must therefore be true before a single test runs:
 *   1. Postgres is reachable, migrated and seeded
 *   2. Redis is reachable (BullMQ queues live there)
 *   3. An API process is actually answering on API_URL, and answering
 *      /api/v1/internal/* with our INTERNAL_API_SECRET rather than 401
 */
import postgres from 'postgres';
import { Redis } from 'ioredis';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[workers-integration] ${name} is not set. This suite talks to a real ` +
        `Postgres, Redis and API; it will not run against defaults.`,
    );
  }
  return v;
}

export default async function globalSetup(): Promise<void> {
  const databaseUrl = required('DATABASE_URL');
  const redisUrl = required('REDIS_URL');
  const apiUrl = required('API_URL');
  const secret = required('INTERNAL_API_SECRET');

  // ── Postgres ──────────────────────────────────────────────────────────────
  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const [row] = await sql<{ tables: number }[]>`
      SELECT count(*)::int AS tables
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    const tables = row?.tables ?? 0;
    if (tables === 0) {
      throw new Error(
        'Connected but found 0 tables in "public". Run `pnpm --filter @forgemsg/api db:migrate`.',
      );
    }
    const [seed] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM organizations WHERE slug = 'acme-demo'
    `;
    if ((seed?.n ?? 0) === 0) {
      throw new Error(`Migrated (${tables} tables) but not seeded. Run \`pnpm seed\`.`);
    }
    console.log(`[workers-integration] Postgres OK — ${tables} tables, seed org present.`);
  } catch (err) {
    throw new Error(`[workers-integration] Postgres preflight failed: ${(err as Error).message}`);
  } finally {
    await sql.end({ timeout: 5 });
  }

  // ── Redis ─────────────────────────────────────────────────────────────────
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 10_000,
  });
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error(`unexpected PING reply: ${pong}`);
    console.log('[workers-integration] Redis OK.');
  } catch (err) {
    throw new Error(`[workers-integration] Redis preflight failed: ${(err as Error).message}`);
  } finally {
    redis.disconnect();
  }

  // ── A live API, reachable AND accepting our internal secret ───────────────
  try {
    const health = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!health.ok) throw new Error(`GET /health returned ${health.status}`);
  } catch (err) {
    throw new Error(
      `[workers-integration] No API answering on ${apiUrl}: ${(err as Error).message}. ` +
        `Start it with \`pnpm --filter @forgemsg/api start\` (every job in this ` +
        `package reads through the API, and those reads fail open — without it ` +
        `the suite would go green without testing anything).`,
    );
  }

  // A 401 here means the worker's secret does not match the API's. Every
  // internal fetch would then fail open, which is exactly the silent-green
  // failure this preflight exists to prevent.
  const probe = await fetch(`${apiUrl}/api/v1/internal/holdout/check-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({
      orgId: '00000000-0000-0000-0000-000000000000',
      contactIds: [],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (probe.status === 401) {
    throw new Error(
      `[workers-integration] API rejected INTERNAL_API_SECRET (401). The worker ` +
        `and the API must share the same value.`,
    );
  }
  if (!probe.ok) {
    throw new Error(`[workers-integration] Internal probe returned ${probe.status}.`);
  }
  console.log('[workers-integration] API OK and internal secret accepted.');
}
