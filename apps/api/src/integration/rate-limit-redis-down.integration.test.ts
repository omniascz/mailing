/**
 * What the shared rate limit does when the thing it is shared through is gone.
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * Moving the counter into Redis (plugins/rate-limit.ts) bought one limit across
 * every instance, and bought a new failure mode with it: the limiter now needs
 * a network round trip to decide anything. @fastify/rate-limit's `skipOnError`
 * decides what happens when that round trip fails — TRUE means "serve the
 * request anyway", which would make every caller unlimited at exactly the
 * moment the shared counter went away. That is strictly worse than the
 * in-process store it replaced, which at least still held per process.
 *
 * rate-limit-shared.integration.test.ts says in its own header that this path
 * "is not exercised here". It is now, because a default nobody has watched fail
 * is a default nobody knows the value of.
 *
 * ─── What was measured, and what it costs ────────────────────────────────────
 *
 * With REDIS_URL pointed at a closed port, against `/health` — a route whose
 * handler returns a static object and, by its own doc comment, "doesn't touch
 * any external system":
 *
 *   Redis up    100 × 200 then 50 × 429   (the limit is exactly 100/min)
 *   Redis down  12 × 500, none served     (no fail-open — this is the assertion)
 *
 * So `skipOnError` is false and holds. The cost is in the second column of the
 * same measurement: the first refusal came back in 326 ms and the twelfth in
 * 8038 ms, climbing and then flat. That is ioredis retrying — packages/shared
 * sets `maxRetriesPerRequest: 3` and the default backoff caps at 2 s, so a
 * command waits out roughly four attempts before it is rejected.
 *
 * The consequence is not the 500 but the eight seconds in front of it, and
 * where it lands: `/health` is the liveness probe. During a Redis outage every
 * instance answers its health check with a slow 500, so the orchestrator
 * restarts them and the balancer drains them — a Redis outage becomes an API
 * outage. Fixing that means either exempting the probe from the limiter or
 * giving the limiter its own client with a short, non-retrying timeout, and
 * both are a mechanism rather than a setting. Out of scope here; this file
 * pins the part that is already right, so that a later change to `skipOnError`
 * or to the client cannot quietly flip it.
 *
 * ─── Technique ───────────────────────────────────────────────────────────────
 *
 * The client is a module singleton built from `process.env.REDIS_URL` at import
 * (packages/shared/src/redis/index.ts:5). So the environment is moved first and
 * the module graph reset second, the way beyond-core-groups does it, and both
 * are put back in `finally` — the rest of the suite needs the real Redis.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/** A port nothing listens on. Connection is refused rather than hanging. */
const DEAD_REDIS = 'redis://127.0.0.1:63999';

/** Unauthenticated, static handler, and not under the allowList prefix. */
const PATH = '/health';

const opened: FastifyInstance[] = [];
const disconnect: Array<() => void> = [];

afterAll(async () => {
  for (const app of opened.splice(0)) await app.close().catch(() => {});
  // The dead client retries forever on its own; let it go, or vitest waits.
  for (const d of disconnect.splice(0)) d();
  vi.resetModules();
});

describe('the rate limit does not fail open when Redis is gone', () => {
  it('refuses rather than serves, and the refusal is not a 200 in disguise', async () => {
    const prev = process.env.REDIS_URL;
    process.env.REDIS_URL = DEAD_REDIS;
    vi.resetModules();

    try {
      const { buildApp } = await import('../index.js');
      const { redis } = await import('@forgemsg/shared/redis');
      disconnect.push(() => redis.disconnect());

      const app = await buildApp();
      opened.push(app);
      await app.ready();

      // One request is the whole claim. Well under 100/min, so a working
      // limiter would let it through and a fail-open one would too — the
      // difference is that a fail-open limiter would ALSO let through the
      // hundred-and-first, and the only way to tell them apart cheaply is that
      // a fail-CLOSED limiter cannot serve even the first.
      const res = await app.inject({
        method: 'GET',
        url: PATH,
        remoteAddress: '203.0.113.91',
      });

      expect(
        res.statusCode,
        'the limiter served a request while its store was unreachable — skipOnError has been ' +
          'turned on, or the store no longer errors, and every caller is now unlimited for the ' +
          'duration of a Redis outage',
      ).not.toBe(200);

      // Pin the shape too, so a future change that swaps the refusal for a 429
      // (which would read to a caller as "you are over the limit" when nothing
      // was counted) shows up here rather than in a support ticket.
      expect(res.statusCode).toBe(500);
    } finally {
      if (prev === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = prev;
      vi.resetModules();
    }
  }, 180_000);
});
