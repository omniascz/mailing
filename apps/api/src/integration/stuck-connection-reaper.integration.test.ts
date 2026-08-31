/**
 * A request must never wait forever on a wedged database connection.
 *
 * ─── What this asserts ──────────────────────────────────────────────────────
 *
 * The class of failure, not one route: a pool whose connection is stuck
 * mid-protocol, and a query queued behind it. Without the watchdog that query
 * never settles — which is what the caller sees as a request that gets no
 * response at all. With it, the wedged backend is terminated and the queued
 * query is served.
 *
 * The wedge is produced deterministically with a paused cursor rather than by
 * racing the pool, because the real trigger (porsager/postgres#1033) is a
 * concurrency race that does not reproduce on demand. A paused cursor puts a
 * backend in exactly the state the race leaves it in — `state = 'active'`,
 * `wait_event = 'Client/ClientRead'` — every time, which is the state the
 * watchdog keys on. `apps/api` itself uses no cursors and no COPY, so nothing
 * legitimate sits there.
 *
 * This comment used to claim the race reproduces "in roughly two runs out of
 * three". Do not rely on that number; it has been withdrawn. On 2026-08-31,
 * against a migrated and seeded pgvector/pgvector:pg16, it did not reproduce
 * once in more than 25 attempts across four shapes of load: the backed-up
 * repro at its documented parameters (0 of 9), sixteen concurrent processes
 * each with its own max=10 pool (0 of 16), continuous saturation at 434,266
 * queries in 180 s (none), and six runs of route-smoke.integration.test.ts
 * with this watchdog switched off (6 of 6 green, 716 requests in and 716 out
 * every time). Details in mailforge-probes/README.md.
 *
 * ─── What this cannot see ───────────────────────────────────────────────────
 *
 *   - It does not reproduce the postgres.js race itself. If upstream ever
 *     fixes #1033, this file keeps passing and the watchdog becomes dead
 *     weight; nothing here will point that out.
 *   - It proves the wedged connection is freed and the queued query runs. It
 *     does not prove the HTTP request on top of it returns a particular status
 *     — by then the failure is an ordinary query rejection.
 *   - It only covers backends this pool opened (`application_name`). A
 *     connection wedged by another process on the same database is out of
 *     scope by design.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { createTestApp } from './setup/harness.js';
import {
  POOL_APPLICATION_NAME,
  REAPER_DEFAULTS,
  findStuckBackends,
  readReaperConfig,
  reapOnce,
} from '../db/stuck-connection-reaper.js';

const url = process.env.DATABASE_URL!;

const silent = { warn: () => {}, error: () => {} };

/** Opens a client whose single connection we can wedge. */
function poolOfOne(): postgres.Sql {
  return postgres(url, {
    max: 1,
    prepare: false,
    connection: { application_name: POOL_APPLICATION_NAME },
  });
}

/**
 * Take one batch of a cursor and then stop talking. The backend has an open
 * portal and is waiting for the client's next message; the connection is not
 * returned to the pool. Resolves once the backend is in that state.
 *
 * The cursor's own promise is swallowed on purpose: the whole point of the
 * exercise is that this connection gets terminated under it.
 */
async function wedgeTheConnection(sql: postgres.Sql): Promise<void> {
  let wedged: () => void;
  const ready = new Promise<void>((r) => (wedged = r));
  void sql`SELECT oid, relname FROM pg_class ORDER BY oid`
    .cursor(1, async () => {
      wedged();
      // Never returns. The client simply stops asking for the next batch.
      await new Promise<void>(() => {});
    })
    .catch(() => {});
  await ready;
}

/** Resolves to 'pending' if the promise has not settled within ms. */
function settledWithin<T>(p: Promise<T>, ms: number): Promise<'settled' | 'pending'> {
  return Promise.race([
    p.then(
      () => 'settled' as const,
      () => 'settled' as const,
    ),
    new Promise<'pending'>((r) => setTimeout(() => r('pending'), ms)),
  ]);
}

let observer: postgres.Sql;

beforeAll(() => {
  observer = postgres(url, {
    max: 1,
    prepare: false,
    connection: { application_name: 'forgemsg-api-reaper-test-observer' },
  });
});

afterAll(async () => {
  await observer?.end({ timeout: 5 });
});

describe('a wedged connection does not hang a request', () => {
  it('without the watchdog, a query queued behind a wedged connection never settles', async () => {
    const sql = poolOfOne();
    await wedgeTheConnection(sql);

    // The pathology, asserted rather than assumed: the backend is busy with a
    // statement AND waiting on the client. Nothing will move it.
    const stuck = await findStuckBackends(observer, { stuckAfterMs: 0 });
    expect(stuck.length).toBeGreaterThan(0);

    const queued = sql`SELECT 1 AS ok`;
    expect(await settledWithin(queued as unknown as Promise<unknown>, 4_000)).toBe('pending');

    await sql.end({ timeout: 1 }).catch(() => {});
  }, 60_000);

  it('with the watchdog, the connection is freed and the queued query is served', async () => {
    const sql = poolOfOne();
    await wedgeTheConnection(sql);
    const queued = sql`SELECT 1 AS ok`;

    // Same shape as production, only impatient: one pass, short threshold.
    const killed = await reapOnce(observer, { stuckAfterMs: 0 }, silent);
    expect(killed.length).toBeGreaterThan(0);

    expect(await settledWithin(queued as unknown as Promise<unknown>, 15_000)).toBe('settled');

    // And the slot really is back: nothing of ours is left in that state.
    const after = await findStuckBackends(observer, { stuckAfterMs: 0 });
    expect(after).toEqual([]);

    await sql.end({ timeout: 1 }).catch(() => {});
  }, 60_000);

  it('buildApp starts one, so this is live without anything opting in', async () => {
    // The knob has to be set before buildApp reads it. Impatient on purpose:
    // production waits 15 s, this test waits one polling interval.
    const before = process.env.DB_STUCK_CONNECTION_MS;
    process.env.DB_STUCK_CONNECTION_MS = '1';
    const app = await createTestApp();
    await app.ready();

    const sql = poolOfOne();
    await wedgeTheConnection(sql);
    const queued = sql`SELECT 1 AS ok`;

    try {
      expect(await settledWithin(queued as unknown as Promise<unknown>, 20_000)).toBe('settled');
    } finally {
      await app.close();
      if (before === undefined) {
        delete process.env.DB_STUCK_CONNECTION_MS;
      } else {
        process.env.DB_STUCK_CONNECTION_MS = before;
      }
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }, 120_000);

  it('leaves healthy connections alone', async () => {
    const sql = poolOfOne();
    // A connection that is idle, and one that is running a real query: neither
    // is active-and-waiting-on-the-client, so neither may be touched.
    await sql`SELECT 1`;
    const slow = sql`SELECT pg_sleep(2), 1 AS ok`;

    const killed = await reapOnce(observer, { stuckAfterMs: 0 }, silent);
    expect(killed).toEqual([]);

    await expect(slow).resolves.toBeTruthy();
    await sql.end({ timeout: 5 });
  }, 60_000);

  it('the app boots with the watchdog enabled by default', () => {
    const cfg = readReaperConfig({} as NodeJS.ProcessEnv);
    expect(cfg.enabled).toBe(true);
    expect(cfg.stuckAfterMs).toBe(REAPER_DEFAULTS.stuckAfterMs);
  });
});
