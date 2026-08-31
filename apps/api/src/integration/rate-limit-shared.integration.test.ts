/**
 * The rate limit is one limit, not one per process.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * plugins/rate-limit.ts registered @fastify/rate-limit without a `redis`
 * option, and that option is the whole decision: `if (settings.redis) { new
 * RedisStore } else { new LocalStore }` (index.js:119). So every API process
 * counted into its own memory. Behind a load balancer the ceiling was
 * 100/min × instances, and which share of it a caller got depended on how the
 * balancer happened to spread the requests — a limit that quietly loosens as
 * the deployment scales out, which is the direction it is least wanted.
 *
 * It applied to the per-route limits in routes/v1/auth.ts too. Those do not
 * register a limiter of their own; they pass `config: { rateLimit: … }` to this
 * one, so they inherited the store. The login limit is the one that matters:
 * ten attempts per fifteen minutes is a credential-stuffing brake, and it was
 * multiplied by the instance count.
 *
 * ─── What this asserts ───────────────────────────────────────────────────────
 *
 * Two independent `buildApp()` instances, one Redis, one caller. Exhaust the
 * limit on the first; the second must refuse the very next request. Two apps in
 * one process is a faithful stand-in here and not a shortcut: each `buildApp()`
 * registers its own copy of the plugin, so before this change they had two
 * separate LocalStores — exactly the thing two containers had.
 *
 * ─── What it cannot see ──────────────────────────────────────────────────────
 *
 *   - It does not prove the number. 100/min is asserted only as "the second
 *     instance sees the first one's count", not as a specific ceiling.
 *   - It says nothing about behaviour when Redis is down. `skipOnError`
 *     defaults to false, so the limiter throws and the request is refused;
 *     that path is not exercised here.
 *   - A limiter registered separately somewhere else would not be covered.
 *     Nothing does that today.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../index.js';

/**
 * A caller nothing else in the suite shares. The counter lives in Redis for a
 * whole minute, so a fixed address would collide with a re-run of this file and
 * with anything else that happens to sweep routes.
 */
const CALLER = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
const TAG = randomUUID().slice(0, 8);

/** Unauthenticated, cheap, and not under /api/v1/internal/* (which is exempt). */
const PATH = '/health';

let instanceA: FastifyInstance;
let instanceB: FastifyInstance;

beforeAll(async () => {
  instanceA = await buildApp();
  instanceB = await buildApp();
  await instanceA.ready();
  await instanceB.ready();
}, 60_000);

afterAll(async () => {
  await instanceA?.close();
  await instanceB?.close();
});

function hit(app: FastifyInstance, caller: string): Promise<number> {
  return app.inject({ method: 'GET', url: PATH, remoteAddress: caller }).then((r) => r.statusCode);
}

describe('rate limit — shared across API instances', () => {
  it('the second instance refuses a caller the first has already exhausted', async () => {
    // Enough to pass 100/min with room to spare; the exact ceiling is not the
    // claim, only that the two instances agree about it.
    let refusedOnA = 0;
    for (let i = 0; i < 130; i++) {
      if ((await hit(instanceA, CALLER)) === 429) refusedOnA++;
    }
    expect(
      refusedOnA,
      'instance A never rate-limited at all — the limiter is not running',
    ).toBeGreaterThan(0);

    const onB = await hit(instanceB, CALLER);
    expect(
      onB,
      'instance B served a caller instance A had already cut off: the counter is per-process, ' +
        'so the real limit is 100/min times the number of instances',
    ).toBe(429);
  }, 60_000);

  it('a caller the first instance has not seen is still served by the second', async () => {
    // The other direction. Without this, a limiter that refused everything —
    // a broken Redis client, say — would satisfy the assertion above.
    const fresh = `198.51.100.${Math.floor(Math.random() * 30) + 221}-${TAG}`;
    expect(await hit(instanceB, fresh)).not.toBe(429);
  }, 30_000);
});
