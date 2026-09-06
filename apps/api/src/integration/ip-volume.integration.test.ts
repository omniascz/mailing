/**
 * The other half of the per-IP volume counter.
 *
 * `pickIpForSend` orders candidate IPs by `dedicated_ips.today_sent` and, for
 * an IP still warming, admits it only while `today_sent < cap`. Both of those
 * reads were against a column nothing ever wrote: `recordIpSend` is the only
 * writer and it had no caller, and `dailyIpMaintenance` — the reset — had none
 * either. So the counter was a constant zero, which made the two reads mean
 * something other than what they say:
 *
 *   - ordering by a constant is not ordering. An org with several IPs sent
 *     everything from whichever row came back first; the pool existed but
 *     never rotated.
 *   - `today_sent < cap` is `0 < cap`, which is always true. A warming IP was
 *     never once excluded by its own ramp on this path.
 *
 * These assertions drive the real transactional route rather than calling the
 * service, because the route is what a customer's send goes through, and the
 * defect was precisely that the route did not reach the writer.
 *
 * NOT covered here, deliberately: the Go engine leg. The engine binds the
 * socket to the IP the API chose (pool.DialFrom → LocalAddr) but reports no IP
 * back, so for the sends the engine picks for itself "the message left from
 * this IP" is not observable from the API at all. That is PR 2.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, inArray, sql } from 'drizzle-orm';
import { randomUUID, createHash } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  ipPools,
  dedicatedIps,
  warmupIps,
  configurationSets,
  apiKeys,
} from '../db/schema/index.js';
import {
  recordIpSend,
  pickIpForSend,
  allocateDedicatedIp,
} from '../services/dedicated-ips/index.js';

let app: FastifyInstance;
let session: Session;
let orgId: string;
let poolId = '';
let apiKey = '';

const SUFFIX = randomUUID().slice(0, 8);
const IP_ONE = '198.51.100.11';
const IP_TWO = '198.51.100.12';
const IP_WARMING = '198.51.100.13';
const ALL_IPS = [IP_ONE, IP_TWO, IP_WARMING];
const CFG_SET = `ipvol-${SUFFIX}`;

const ipRow = async (address: string) =>
  (await db.select().from(dedicatedIps).where(eq(dedicatedIps.ipAddress, address)))[0];

async function cleanup() {
  await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL_IPS));
  await db.delete(warmupIps).where(inArray(warmupIps.ipAddress, ALL_IPS));
  await db.delete(configurationSets).where(eq(configurationSets.name, CFG_SET));
  await db.delete(apiKeys).where(eq(apiKeys.name, `ipvol ${SUFFIX}`));
  if (poolId) await db.delete(ipPools).where(eq(ipPools.id, poolId));
}

/** One transactional send through the registered route, as a customer makes it. */
async function sendOne(to: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/transactional/email',
    headers: { 'x-api-key': apiKey },
    payload: {
      to,
      from: 'sender@acme.test',
      subject: 'ip volume itest',
      html: '<p>ip volume itest</p>',
      configurationSet: CFG_SET,
      sandboxMode: true,
    },
  });
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  orgId = session.orgId;

  await cleanup();

  // The route is guarded by requireScope('emails:send'), so a session cookie
  // is not enough — a customer sends with a key. Issued AFTER cleanup, which
  // deletes by this same name.
  apiKey = `fm_live_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `ipvol ${SUFFIX}`,
    keyHash: createHash('sha256').update(apiKey).digest('hex'),
    keyPrefix: apiKey.slice(0, 12),
    scopes: [],
    isPublic: false,
  });

  const [pool] = await db
    .insert(ipPools)
    .values({ orgId, name: `ipvol-${SUFFIX}`, type: 'marketing' })
    .returning({ id: ipPools.id });
  poolId = pool!.id;

  await db.insert(dedicatedIps).values([
    { ipAddress: IP_ONE, orgId, poolId, status: 'active' },
    { ipAddress: IP_TWO, orgId, poolId, status: 'active' },
  ]);

  await db.insert(configurationSets).values({
    orgId,
    name: CFG_SET,
    options: {
      trackingEnabled: false,
      tlsPolicy: 'optional',
      suppressionEnabled: false,
      reputationTracking: true,
      ipPoolId: poolId,
      eventDestinations: [],
    },
  });
}, 60_000);

afterAll(async () => {
  await cleanup();
  await app?.close();
});

describe('per-IP volume is counted by the send path', () => {
  it('a transactional send moves today_sent on the IP it was sent from', async () => {
    await db
      .update(dedicatedIps)
      .set({ todaySent: 0, totalSent: 0 })
      .where(inArray(dedicatedIps.ipAddress, [IP_ONE, IP_TWO]));

    const res = await sendOne(`vol-${SUFFIX}@example.com`);
    expect(res.statusCode, res.body).toBeLessThan(400);

    const one = await ipRow(IP_ONE);
    const two = await ipRow(IP_TWO);
    const moved = (one?.todaySent ?? 0) + (two?.todaySent ?? 0);

    // The point of the whole file: SOMETHING must have been counted. Which of
    // the two was chosen is the next assertion's business.
    expect(moved, 'no IP recorded the send — today_sent is still a constant zero').toBe(1);
  });

  it('a pool rotates: the second send does not resolve to the same IP as the first', async () => {
    await db
      .update(dedicatedIps)
      .set({ todaySent: 0, totalSent: 0 })
      .where(inArray(dedicatedIps.ipAddress, [IP_ONE, IP_TWO]));

    const first = await pickIpForSend(orgId, poolId);
    expect(first).not.toBeNull();

    const r1 = await sendOne(`rot1-${SUFFIX}@example.com`);
    expect(r1.statusCode, r1.body).toBeLessThan(400);

    const second = await pickIpForSend(orgId, poolId);
    expect(second).not.toBeNull();
    expect(
      second!.ipAddress,
      'both sends resolved to the same IP: ordering by today_sent orders nothing while the column stays zero',
    ).not.toBe(first!.ipAddress);
  });

  it('a warming IP that has spent its day-1 allowance is no longer offered', async () => {
    await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, [IP_ONE, IP_TWO]));
    await db.insert(dedicatedIps).values({
      ipAddress: IP_WARMING,
      orgId,
      poolId,
      status: 'warming',
      warmupDay: 1,
      todaySent: 0,
    });

    // Day 1 of the default ramp is 50. Spend it the way a send does.
    const row = await ipRow(IP_WARMING);
    await recordIpSend(row!.id, 50);

    const picked = await pickIpForSend(orgId, poolId);
    expect(
      picked,
      'a warming IP that has spent its whole day-1 allowance was still offered',
    ).toBeNull();
  });
});

describe('the counter is reset, and the reset is reachable', () => {
  it('the daily run zeroes today_sent', async () => {
    await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL_IPS));
    await db
      .insert(dedicatedIps)
      .values({ ipAddress: IP_ONE, orgId, poolId, status: 'active', todaySent: 17 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/triggers/daily-run',
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
    });
    expect(res.statusCode, res.body).toBeLessThan(400);

    const after = await ipRow(IP_ONE);
    expect(
      after!.todaySent,
      'today_sent survived the daily run — without a reset it is a lifetime total wearing a daily name',
    ).toBe(0);
  });
});

describe('an address nobody registered cannot create a reputation row', () => {
  it('recordIpSend against an unknown id inserts nothing and touches nothing', async () => {
    const countRows = async () =>
      (
        (await db.execute(sql`SELECT count(*)::int AS n FROM dedicated_ips`)) as unknown as Array<{
          n: number;
        }>
      )[0]!.n;

    const before = await countRows();
    await recordIpSend(randomUUID(), 5);
    const after = await countRows();

    // xmax <> 0 marks a row written by a transaction that is still visible as
    // the writer — an insert or update from this session. Asserting that the
    // function "was not called with an unknown id" would prove only that the
    // test did not call it.
    const touched = (
      (await db.execute(
        sql`SELECT count(*)::int AS touched FROM dedicated_ips WHERE xmax <> 0`,
      )) as unknown as Array<{ touched: number }>
    )[0]!.touched;

    expect(after, 'an unknown id appended a row to the reputation table').toBe(before);
    expect(touched, 'an unknown id upserted into the reputation table').toBe(0);
  });
});

describe('an IP allocated into warmup has a ceiling the engine can see', () => {
  it('allocating with startWarmup seeds the warmup_ips row the claim reads', async () => {
    await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL_IPS));
    await db.delete(warmupIps).where(inArray(warmupIps.ipAddress, ALL_IPS));

    await allocateDedicatedIp({
      orgId,
      poolId,
      ipAddress: IP_WARMING,
      startWarmup: true,
    });

    const [ramp] = await db.select().from(warmupIps).where(eq(warmupIps.ipAddress, IP_WARMING));
    expect(
      ramp,
      'the configuration says this IP is warming but the table the engine enforces against has no row for it',
    ).toBeDefined();
    expect(ramp!.orgId).toBe(orgId);
    expect(ramp!.status).toBe('warming');
    expect(ramp!.warmupDay).toBe(1);
  });
});
