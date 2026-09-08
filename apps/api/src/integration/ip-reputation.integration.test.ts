/**
 * The other half of the reputation chain.
 *
 * `dedicated_ips.reputation_score`, `bounce_rate` and `complaint_rate` have
 * been zero since they were added. `updateReputation` is a setter with no
 * caller, and the caller could not be written: `email_events` carried no
 * sending address, so a bounce could not be attributed to the address that
 * caused it. Two probes ended in "do not build" for exactly that reason.
 *
 * The worker now stamps `metadata.sendingIp`, and these assertions are what
 * makes the difference visible: real rows in forgemsg_itest2, real service, and
 * the daily-run route the cron actually calls.
 *
 * The negative control is the assertion this file exists for. "Score everyone
 * lower" satisfies any test that a bad address scores badly, so a clean address
 * is measured beside a dirty one and must come out ahead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, dedicatedIps, emailEvents } from '../db/schema/index.js';
import { refreshAllIpReputations } from '../services/deliverability/ip-reputation.js';

const SUFFIX = randomUUID().slice(0, 8);
const IP_CLEAN = '198.51.100.61';
const IP_DIRTY = '198.51.100.62';
const IP_SILENT = '198.51.100.63';
const ALL = [IP_CLEAN, IP_DIRTY, IP_SILENT];

let orgId: string;
let app: FastifyInstance;

const row = async (ip: string) =>
  (await db.select().from(dedicatedIps).where(eq(dedicatedIps.ipAddress, ip)))[0];

/** Write n events of one type, attributed to `ip` unless `attribute` is false. */
async function events(
  type: 'send' | 'deliver' | 'bounce' | 'complaint',
  n: number,
  opts: { ip?: string; bounceType?: 'hard' | 'soft' } = {},
) {
  if (n === 0) return;
  await db.insert(emailEvents).values(
    Array.from({ length: n }, () => ({
      orgId,
      eventType: type,
      ...(opts.bounceType ? { bounceType: opts.bounceType } : {}),
      metadata: opts.ip ? { sendingIp: opts.ip, isp: 'seznam' } : { isp: 'seznam' },
    })),
  );
}

async function wipe() {
  await db.delete(dedicatedIps).where(inArray(dedicatedIps.ipAddress, ALL));
  if (orgId) await db.delete(emailEvents).where(eq(emailEvents.orgId, orgId));
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [org] = await db
    .insert(organizations)
    .values({ name: `ip rep ${SUFFIX}`, slug: `ip-rep-${SUFFIX}` })
    .returning({ id: organizations.id });
  orgId = org!.id;
  await wipe();
}, 90_000);

afterAll(async () => {
  await wipe();
  if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
  await app?.close();
});

beforeEach(wipe);

describe('the numbers stop being zero', () => {
  it('an address with bounces gets a score, a bounce rate and a complaint rate', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_DIRTY, orgId, status: 'active' });
    await events('send', 100, { ip: IP_DIRTY });
    await events('deliver', 80, { ip: IP_DIRTY });
    await events('bounce', 20, { ip: IP_DIRTY, bounceType: 'hard' });
    await events('complaint', 4, { ip: IP_DIRTY });

    const before = await row(IP_DIRTY);
    expect(Number(before!.reputationScore), 'the column did not start at zero').toBe(0);
    expect(before!.reputationUpdatedAt).toBeNull();

    const summary = await refreshAllIpReputations();
    expect(summary.scored).toBeGreaterThanOrEqual(1);

    const after = await row(IP_DIRTY);
    expect(
      Number(after!.reputationScore),
      'reputation_score is still zero — the half that computes it did not land',
    ).toBeGreaterThan(0);
    expect(Number(after!.bounceRate), 'bounce_rate is still zero').toBe(20);
    expect(Number(after!.complaintRate), 'complaint_rate is still zero').toBe(5);
    expect(after!.reputationUpdatedAt).not.toBeNull();
  });

  it('NEGATIVE CONTROL: a clean address scores HIGHER than a dirty one', async () => {
    // "Score everyone lower" passes any assertion that a bad address scores
    // badly. Both are measured in the same sweep, from the same code.
    await db.insert(dedicatedIps).values([
      { ipAddress: IP_CLEAN, orgId, status: 'active' },
      { ipAddress: IP_DIRTY, orgId, status: 'active' },
    ]);
    await events('send', 100, { ip: IP_CLEAN });
    await events('deliver', 100, { ip: IP_CLEAN });

    await events('send', 100, { ip: IP_DIRTY });
    await events('deliver', 70, { ip: IP_DIRTY });
    await events('bounce', 30, { ip: IP_DIRTY, bounceType: 'hard' });
    await events('complaint', 5, { ip: IP_DIRTY });

    await refreshAllIpReputations();

    const clean = Number((await row(IP_CLEAN))!.reputationScore);
    const dirty = Number((await row(IP_DIRTY))!.reputationScore);

    expect(clean, 'an address with no bounces was scored down').toBeGreaterThan(dirty);
    expect(Number((await row(IP_CLEAN))!.bounceRate), 'a clean address got a bounce rate').toBe(0);
    expect(clean, 'a clean address did not score well').toBeGreaterThanOrEqual(90);
  });
});

describe('never sent is not the same as never bounced', () => {
  it('an address with no attributable events is left alone, timestamp and all', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_SILENT, orgId, status: 'active' });

    const summary = await refreshAllIpReputations();
    expect(summary.skippedNoHistory).toBeGreaterThanOrEqual(1);

    const after = await row(IP_SILENT);
    // Not scored 0 (which reads as "worst") and not scored 100 (which is what
    // computeEmailHealthScore returns for an empty window). Untouched, and the
    // null timestamp is what says so.
    expect(
      after!.reputationUpdatedAt,
      'an address that has never sent was given a score anyway',
    ).toBeNull();
    expect(Number(after!.reputationScore)).toBe(0);
  });

  it('events that name no address are not counted as a clean history', async () => {
    // Modes B and C: the engine or the kernel chose, and nothing here knows
    // which address. Those events must not land on any address — folding them
    // into "no bounces" would dilute a real rate towards zero.
    await db.insert(dedicatedIps).values({ ipAddress: IP_SILENT, orgId, status: 'active' });
    await events('send', 500);
    await events('deliver', 500);

    const summary = await refreshAllIpReputations();

    expect(
      summary.skippedNoHistory,
      'unattributed events were credited to an address that never sent',
    ).toBeGreaterThanOrEqual(1);
    expect((await row(IP_SILENT))!.reputationUpdatedAt).toBeNull();
  });

  it('unattributed events do not dilute an address that DID send', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_DIRTY, orgId, status: 'active' });
    await events('send', 10, { ip: IP_DIRTY });
    await events('deliver', 5, { ip: IP_DIRTY });
    await events('bounce', 5, { ip: IP_DIRTY, bounceType: 'hard' });
    // Nine hundred clean sends from somewhere unknown. If these were counted,
    // the 50% bounce rate below would read as 0.55%.
    await events('send', 900);
    await events('deliver', 900);

    await refreshAllIpReputations();

    expect(
      Number((await row(IP_DIRTY))!.bounceRate),
      'unattributed traffic was folded into an address and hid its bounce rate',
    ).toBe(50);
  });
});

describe('it runs from the daily run, not just from a function', () => {
  it('POST /internal/triggers/daily-run scores the addresses', async () => {
    await db.insert(dedicatedIps).values({ ipAddress: IP_DIRTY, orgId, status: 'active' });
    await events('send', 50, { ip: IP_DIRTY });
    await events('deliver', 40, { ip: IP_DIRTY });
    await events('bounce', 10, { ip: IP_DIRTY, bounceType: 'hard' });

    expect((await row(IP_DIRTY))!.reputationUpdatedAt).toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/triggers/daily-run',
      headers: { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' },
    });
    expect(res.statusCode, res.body).toBeLessThan(400);

    const after = await row(IP_DIRTY);
    expect(
      after!.reputationUpdatedAt,
      'the daily run does not reach the reputation sweep — it would never run in production',
    ).not.toBeNull();
    expect(Number(after!.bounceRate)).toBe(20);
  }, 90_000);
});
