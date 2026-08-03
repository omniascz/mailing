/**
 * Integration-suite preflight.
 *
 * The main unit suite passes with DATABASE_URL and REDIS_URL pointed at dead
 * ports — postgres-js connects lazily and no test ever issues a query, so a
 * green run proves nothing about the database. This setup exists so that can
 * never happen here: if Postgres or Redis is not actually reachable, the whole
 * integration run fails before a single test executes, loudly.
 */
import postgres from 'postgres';
import { Redis } from 'ioredis';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[integration] ${name} is not set. The integration suite talks to a real ` +
        `Postgres and Redis; it will not run against defaults.`,
    );
  }
  return v;
}

export default async function globalSetup(): Promise<void> {
  const databaseUrl = required('DATABASE_URL');
  const redisUrl = required('REDIS_URL');

  // ── Postgres: connect, and confirm the schema is actually migrated ─────────
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
        `[integration] Connected to Postgres but found 0 tables in "public". ` +
          `Run \`pnpm --filter @forgemsg/api db:migrate\` first.`,
      );
    }
    const [seed] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM organizations WHERE slug = 'acme-demo'
    `;
    if ((seed?.n ?? 0) === 0) {
      throw new Error(
        `[integration] Database is migrated (${tables} tables) but not seeded. ` +
          `Run \`pnpm seed\` first.`,
      );
    }
    console.log(`[integration] Postgres OK — ${tables} tables, seed org present.`);
  } catch (err) {
    throw new Error(
      `[integration] Postgres preflight failed for ${databaseUrl.replace(/:\/\/[^@]*@/, '://***@')}: ` +
        (err as Error).message,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }

  // ── Redis: sessions live here, so login cannot work without it ─────────────
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
    console.log('[integration] Redis OK.');
  } catch (err) {
    throw new Error(
      `[integration] Redis preflight failed for ${redisUrl}: ${(err as Error).message}`,
    );
  } finally {
    redis.disconnect();
  }
}
