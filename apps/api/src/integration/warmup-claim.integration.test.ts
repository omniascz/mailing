/**
 * The daily warmup cap, actually enforced.
 *
 * checkWarmupAllowance had no callers, so no limit was applied anywhere, while
 * the daily cron kept advancing warmup_day — the API reported a ramp in
 * progress and every send went out regardless. Underneath were three counters:
 * warmup_ips.today_sent that nothing wrote, and one Redis key per side under
 * two different names, so switching both halves on would have doubled the cap.
 *
 * There is one counter now, in Postgres, and the engine claims against it over
 * the internal API. These assertions go through that route rather than calling
 * the service, because the route is what the engine talks to.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, warmupIps } from '../db/schema/index.js';
import { startWarmup, getDailyLimit, claimWarmupCapacity } from '../services/sending/ip-warmup.js';

let app: FastifyInstance;
let orgId: string;
const SECRET = process.env.INTERNAL_API_SECRET ?? '';

const IP_A = '203.0.113.21';
const IP_B = '203.0.113.22';
const IP_WARM = '203.0.113.23';

async function claim(ips: string[]) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/internal/sending/warmup/claim',
    headers: { 'x-internal-secret': SECRET },
    payload: { ips },
  });
}

const row = async (ip: string) =>
  (await db.select().from(warmupIps).where(eq(warmupIps.ipAddress, ip)))[0];

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [org] = await db
    .insert(organizations)
    .values({ name: 'warmup itest', slug: `warmup-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  for (const ip of [IP_A, IP_B, IP_WARM]) {
    await db.delete(warmupIps).where(eq(warmupIps.ipAddress, ip));
  }
}, 60_000);

afterAll(async () => {
  for (const ip of [IP_A, IP_B, IP_WARM]) {
    await db.delete(warmupIps).where(eq(warmupIps.ipAddress, ip));
  }
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await app?.close();
}, 60_000);

describe('warmup capacity is claimed, once, from one place', () => {
  it('startWarmup begins on day 1, which is where the schedule begins', async () => {
    await startWarmup(IP_A, orgId);
    const r = await row(IP_A);
    // Day 0 fell outside WARMUP_SCHEDULE (first phase is fromDay: 1) and only
    // got 50 from the `?? 50` fallback — the right answer by accident. It also
    // disagreed with the Redis seed, which said 1.
    expect(r!.warmupDay).toBe(1);
    expect(r!.todaySent).toBe(0);
    expect(getDailyLimit(r!.warmupDay)).toBe(50);
  });

  it('the 50th send is allowed and the 51st is refused', async () => {
    const results: number[] = [];
    for (let i = 0; i < 51; i++) results.push((await claim([IP_A])).statusCode);

    expect(results.slice(0, 50).every((s) => s === 200)).toBe(true);
    expect(results[50]).toBe(429);

    const r = await row(IP_A);
    // Exactly 50 — the refused one must not have been counted.
    expect(r!.todaySent).toBe(50);
  }, 60_000);

  it('the refusal says what the engine needs to hear', async () => {
    const res = await claim([IP_A]);
    expect(res.statusCode).toBe(429);
    const body = res.json() as { code: string; message: string; dailyLimit: number };
    expect(body.code).toBe('WARMUP_QUOTA_EXHAUSTED');
    // apps/engine matches ErrAllExhausted, and apps/workers matches this text
    // to defer the message rather than fail it. Changing it breaks both.
    expect(body.message).toBe('warmup: all sending IPs have reached their daily limit');
    expect(body.dailyLimit).toBe(50);
  });

  it('a second IP with capacity is chosen over the exhausted one', async () => {
    await startWarmup(IP_B, orgId);
    const res = await claim([IP_A, IP_B]);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { ip: string } }).data.ip).toBe(IP_B);
  });

  it('a warm IP has no limit', async () => {
    await startWarmup(IP_WARM, orgId);
    await db
      .update(warmupIps)
      .set({ warmupDay: 31, status: 'warm' })
      .where(eq(warmupIps.ipAddress, IP_WARM));

    expect(getDailyLimit(31)).toBe(Infinity);
    const c = await claimWarmupCapacity(IP_WARM);
    expect(c.allowed).toBe(true);
    expect(c.isWarm).toBe(true);
    expect(c.dailyLimit).toBe(Infinity);

    // Well past any phase cap, still allowed.
    await db.update(warmupIps).set({ todaySent: 999_999 }).where(eq(warmupIps.ipAddress, IP_WARM));
    expect((await claim([IP_WARM])).statusCode).toBe(200);
  });

  it('an unregistered IP is not being warmed up, so it is allowed', async () => {
    const res = await claim(['203.0.113.99']);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { known: boolean } }).data.known).toBe(false);
  });

  it('there is one counter: the route and the status listing agree', async () => {
    // The bug this replaces was two stores under two names. Whatever the claim
    // path incremented has to be the number the product reports.
    const before = (await row(IP_B))!.todaySent;
    for (let i = 0; i < 5; i++) expect((await claim([IP_B])).statusCode).toBe(200);

    const { listWarmupStatuses } = await import('../services/sending/ip-warmup.js');
    const statuses = await listWarmupStatuses(orgId);
    const b = statuses.find((s) => s.ipAddress === IP_B)!;

    expect((await row(IP_B))!.todaySent).toBe(before + 5);
    expect(b.sentToday).toBe(before + 5);
    expect(b.remainingToday).toBe(getDailyLimit(b.warmupDay) - b.sentToday);
  }, 60_000);

  it('concurrent claims cannot both take the last unit', async () => {
    const ip = '203.0.113.24';
    await db.delete(warmupIps).where(eq(warmupIps.ipAddress, ip));
    await startWarmup(ip, orgId);
    // One unit left of 50.
    await db.update(warmupIps).set({ todaySent: 49 }).where(eq(warmupIps.ipAddress, ip));

    const results = await Promise.all([claim([ip]), claim([ip]), claim([ip]), claim([ip])]);
    const ok = results.filter((r) => r.statusCode === 200);
    expect(ok).toHaveLength(1);
    expect((await row(ip))!.todaySent).toBe(50);

    await db.delete(warmupIps).where(eq(warmupIps.ipAddress, ip));
  }, 60_000);

  it('the nightly advance cron gets past auth', async () => {
    // Its only caller is apps/workers/src/jobs/warmup-advance.ts, which
    // presents the internal secret and nothing else. A plugin-wide preHandler
    // demanded a user session, so this answered 401 every night and warmup_day
    // never moved — an IP stayed on day 1, and on 50 sends a day, forever.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/sending/warmup/advance-all',
      headers: { 'x-internal-secret': SECRET },
    });
    expect(res.statusCode, res.body).toBe(200);
  });

  it('a stale date restarts the allowance without waiting for the cron', async () => {
    const ip = '203.0.113.25';
    await db.delete(warmupIps).where(eq(warmupIps.ipAddress, ip));
    await startWarmup(ip, orgId);
    await db
      .update(warmupIps)
      .set({ todaySent: 50, currentDate: '2000-01-01' })
      .where(eq(warmupIps.ipAddress, ip));

    // Yesterday's 50 must not block today, even if the advance job is late.
    const res = await claim([ip]);
    expect(res.statusCode).toBe(200);
    expect((await row(ip))!.todaySent).toBe(1);

    await db.delete(warmupIps).where(eq(warmupIps.ipAddress, ip));
  });
});
