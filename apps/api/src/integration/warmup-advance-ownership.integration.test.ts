/**
 * The customer-facing warmup/advance route moved another org's counter.
 *
 * POST /api/v1/sending/warmup/advance took an IP address out of the request
 * body, handed it straight to advanceWarmupDay() and returned the new day.
 * The only thing between the caller and that write was requireAuth, which
 * establishes who is signed in, not which addresses they own. So any user of
 * any org could name the dedicated IP of another org — the address sits in the
 * Received header of every message that IP sends, it is not a secret — and
 * push its warmup_day up. That raises the daily ceiling the send path
 * enforces before the reputation has been earned, and enough calls flip the
 * row to status 'warm', which removes the ceiling altogether.
 *
 * The lookup inside advanceWarmupDay is NOT the defect and is untouched here.
 * warmup_ips is keyed UNIQUE (ip_address) on purpose: the counter belongs to
 * the address, the way the receiving ISP sees it. Scoping that lookup by org
 * would hand two orgs sharing an address a full daily allowance each, which is
 * the three-counters bug #48 removed. The defect was that the route let a
 * caller address an IP that was not theirs.
 *
 * Nothing in the repo called the route — no UI, no MCP tool, no e2e spec, no
 * script, no worker, no test. The nightly advance goes through
 * POST /api/v1/internal/sending/warmup/advance-all, a different route behind
 * the shared-secret gate, and that one keeps working; the second case here is
 * the proof. So the route is gone rather than guarded, and these assertions
 * read the victim's row field by field rather than the response status —
 * a 403 with the write already done would look the same from the outside.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, warmupIps, dedicatedIps } from '../db/schema/index.js';
import { advanceWarmupDay } from '../services/sending/ip-warmup.js';

/** Org B's dedicated address — the one the attacker names. */
const VICTIM_IP = '203.0.113.91';
/** Advanced through the internal cron route, to show that path still works. */
const CRON_IP = '203.0.113.92';
/** Advanced by calling the service directly, seeded inside its own case. */
const SERVICE_IP = '203.0.113.93';
const ALL_IPS = [VICTIM_IP, CRON_IP, SERVICE_IP];

const SECRET = process.env.INTERNAL_API_SECRET ?? '';

let app: FastifyInstance;
/** A real session in the seeded org — a tenant that owns none of these IPs. */
let attacker: Session;
let orgB: string;

const row = async (ip: string) =>
  (await db.select().from(warmupIps).where(eq(warmupIps.ipAddress, ip)))[0];

/** Yesterday in UTC, so advanceWarmupDay has a day to move to. */
function yesterdayString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function cleanup(): Promise<void> {
  for (const ip of ALL_IPS) {
    await db.delete(warmupIps).where(eq(warmupIps.ipAddress, ip));
    await db.delete(dedicatedIps).where(eq(dedicatedIps.ipAddress, ip));
  }
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  attacker = await login(app);

  const [org] = await db
    .insert(organizations)
    .values({ name: 'warmup victim', slug: `warmup-victim-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgB = org!.id;

  await cleanup();

  // Org B owns both addresses and is mid-ramp on each: day 3, yesterday's
  // date, so a day advance is available and would be visible.
  for (const ip of [VICTIM_IP, CRON_IP]) {
    await db.insert(dedicatedIps).values({
      ipAddress: ip,
      orgId: orgB,
      status: 'warming',
      warmupDay: 3,
    });
    await db.insert(warmupIps).values({
      ipAddress: ip,
      orgId: orgB,
      warmupDay: 3,
      todaySent: 17,
      currentDate: yesterdayString(),
      status: 'warming',
    });
  }
}, 60_000);

afterAll(async () => {
  await cleanup();
  await db.delete(organizations).where(eq(organizations.id, orgB));
  await app?.close();
}, 60_000);

describe("another org's warmup day is not the caller's to advance", () => {
  it('the seeded org cannot advance org B IP, and the row is untouched', async () => {
    const before = await row(VICTIM_IP);
    expect(before, 'fixture missing — the victim row was not seeded').toBeDefined();
    expect(before!.orgId).toBe(orgB);
    expect(before!.orgId).not.toBe(attacker.orgId);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sending/warmup/advance',
      headers: { cookie: attacker.cookie },
      payload: { ip: VICTIM_IP },
    });

    // The row first, field by field: that is where the damage lands, and a
    // refusal returned after the write would read the same from the outside.
    // warmupDay is the ceiling the send path enforces; status 'warm' removes
    // the ceiling; currentDate is what makes a further advance possible today.
    const after = await row(VICTIM_IP);
    expect(after!.warmupDay).toBe(before!.warmupDay);
    expect(after!.status).toBe(before!.status);
    expect(after!.currentDate).toBe(before!.currentDate);
    expect(after!.todaySent).toBe(before!.todaySent);
    expect(after!.orgId).toBe(before!.orgId);
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());

    // And then the answer: 404, not 403. A refusal that tells "not yours"
    // apart from "no such route" confirms the address exists.
    expect(res.statusCode, `body: ${res.body}`).toBe(404);
  });

  it('the nightly cron route still advances the same kind of row', async () => {
    const before = await row(CRON_IP);
    expect(before!.warmupDay).toBe(3);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/sending/warmup/advance-all',
      headers: { 'x-internal-secret': SECRET },
    });
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const after = await row(CRON_IP);
    expect(after!.warmupDay).toBe(4);
    expect(after!.currentDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it('advanceWarmupDay still advances by address when called directly', async () => {
    // Seeded here rather than in beforeAll: advance-all in the previous case
    // moves every warming row, this one included, and then there would be
    // nothing left to measure.
    await db.insert(warmupIps).values({
      ipAddress: SERVICE_IP,
      orgId: orgB,
      warmupDay: 5,
      currentDate: yesterdayString(),
      status: 'warming',
    });

    const newDay = await advanceWarmupDay(SERVICE_IP);
    expect(newDay).toBe(6);
    expect((await row(SERVICE_IP))!.warmupDay).toBe(6);
  });
});
