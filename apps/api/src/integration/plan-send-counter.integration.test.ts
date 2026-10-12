/**
 * The plan send counter (Z136): what the plan limit is checked against, kept
 * as a row per organisation and period by a trigger on email_events
 * (migration 0029) instead of COUNT(*) over email_events on every send.
 *
 * Every case is measured against the truth the counter must equal —
 * plan_send_truth(): the messages with a `send` row in the period, each once —
 * and against the reconciliation that compares the two for an operator.
 *
 * One organisation of its own, one API key of its own (its own rate-limit
 * bucket), so nothing here depends on the seed org or another file's sends.
 *
 * WHAT THIS FILE CANNOT SEE
 * - mta-sender writing the same campaign message twice when a job is run again;
 *   that is in apps/workers/src/integration/plan-send-counter-retry.integration.test.ts.
 *   Here the same write arrives the way that job posts it, through
 *   /internal/events.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import {
  apiKeys,
  billingSubscriptions,
  campaigns,
  contacts,
  emailEvents,
  organizations,
  planSendCounters,
  sendingDomains,
  suppressions,
} from '../db/schema/index.js';
import { getPlanCapacity } from '../services/billing/plan-enforcement.js';
import { reconcilePlanSendCounters } from '../services/billing/plan-send-reconcile.js';
import { dispatchDueBatches } from '../services/transactional/scheduled-batch.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const DOMAIN = `counter-${tag}.test`;
const FROM = `team@${DOMAIN}`;
let org: string;
let key: string;
let campaignId: string;
let contactId: string;

const rcpt = () => `c-${randomUUID().slice(0, 8)}@example.test`;

async function post(url: string, payload: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'x-api-key': key, ...headers },
    payload: payload as object,
  });
}

/** The counter row of the org's current period, and the truth it must equal. */
async function measure(orgId = org): Promise<{ counter: number; truth: number }> {
  const rows = (await db.execute(sql`
    SELECT coalesce((SELECT sends FROM plan_send_counters
                     WHERE org_id = ${orgId}::uuid AND period_start = plan_period_start(${orgId}::uuid)), 0) AS counter,
           plan_send_truth(${orgId}::uuid, plan_period_start(${orgId}::uuid)) AS truth
  `)) as unknown as Array<{ counter: number; truth: number }>;
  return { counter: Number(rows[0]!.counter), truth: Number(rows[0]!.truth) };
}

/** A `send` row as mta-sender stores a campaign send: through /internal/events. */
function internalSend(messageId: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/internal/events',
    headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
    payload: { type: 'send', orgId: org, campaignId, contactId, messageId },
  });
}

async function newOrg(plan: 'pro' | 'free'): Promise<string> {
  const [o] = await db
    .insert(organizations)
    .values({ name: `counter ${plan} ${tag}`, slug: `counter-${plan}-${tag}`, plan })
    .returning({ id: organizations.id });
  return o!.id;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  org = await newOrg('pro');
  await db.insert(sendingDomains).values({
    orgId: org,
    domain: DOMAIN,
    isVerified: true,
    dkimVerified: true,
    spfVerified: true,
    dmarcVerified: true,
  });
  key = `fm_live_${randomBytes(24).toString('hex')}`;
  await db.insert(apiKeys).values({
    orgId: org,
    name: `counter ${tag}`,
    keyHash: createHash('sha256').update(key).digest('hex'),
    keyPrefix: key.slice(0, 12),
    scopes: [],
    role: 'admin',
  });
  const [c] = await db
    .insert(campaigns)
    .values({ orgId: org, name: `counter ${tag}` })
    .returning({ id: campaigns.id });
  campaignId = c!.id;
  const [k] = await db
    .insert(contacts)
    .values({ orgId: org, email: rcpt(), status: 'active' })
    .returning({ id: contacts.id });
  contactId = k!.id;
}, 120_000);

afterAll(async () => {
  if (org) {
    await db.delete(emailEvents).where(eq(emailEvents.orgId, org));
    await db.delete(organizations).where(eq(organizations.id, org));
  }
  await app?.close();
});

describe('plan send counter', () => {
  it('counts every send path once per message, and the plan reads it', async () => {
    expect(await measure()).toEqual({ counter: 0, truth: 0 });

    for (let i = 0; i < 3; i++) {
      const r = await post('/api/v1/transactional/email', {
        to: rcpt(),
        from: FROM,
        subject: 'Order',
        html: '<p>x</p>',
      });
      expect(r.statusCode, r.body).toBe(202);
    }
    // Sandbox: the plan has always counted its `send` row; it still does.
    const sandbox = await post('/api/v1/transactional/email', {
      to: rcpt(),
      from: FROM,
      subject: 'Order',
      html: '<p>x</p>',
      sandboxMode: true,
    });
    expect(sandbox.statusCode, sandbox.body).toBe(202);
    // One message to four recipients is one `send` row, as before.
    const resend = await post('/api/v1/emails', {
      from: FROM,
      to: [rcpt(), rcpt()],
      cc: [rcpt()],
      bcc: [rcpt()],
      subject: 'x',
      html: '<p>x</p>',
    });
    expect(resend.statusCode, resend.body).toBe(200);
    const resendBatch = await post('/api/v1/emails/batch', [
      { from: FROM, to: [rcpt()], subject: 'x', html: '<p>x</p>' },
      { from: FROM, to: [rcpt()], subject: 'x', html: '<p>x</p>' },
    ]);
    expect(resendBatch.statusCode, resendBatch.body).toBe(200);
    const batch = await post('/api/v1/transactional/email/batch', {
      from: FROM,
      subject: 'x',
      html: '<p>x</p>',
      recipients: [{ email: rcpt() }, { email: rcpt() }],
    });
    expect(batch.statusCode, batch.body).toBe(202);
    const scheduled = await post('/api/v1/transactional/batch', {
      from: FROM,
      subject: 'x',
      html: '<p>x</p>',
      sendAt: new Date(Date.now() + 1500).toISOString(),
      recipients: [{ to: rcpt() }, { to: rcpt() }],
    });
    expect(scheduled.statusCode, scheduled.body).toBe(202);
    await new Promise((r) => setTimeout(r, 2000));
    await dispatchDueBatches();

    // 3 + 1 + 1 + 2 + 2 + 2
    expect(await measure()).toEqual({ counter: 11, truth: 11 });
    expect((await getPlanCapacity(org)).sends.current).toBe(11);
    expect((await reconcilePlanSendCounters({ orgId: org })).drift).toEqual([]);
  });

  it('counts a message written twice once — posted twice, or twice in one INSERT', async () => {
    const before = await measure();
    const mid = `<counter-${randomUUID()}@forgemsg>`;
    expect((await internalSend(mid)).statusCode).toBe(201);
    expect((await internalSend(mid)).statusCode).toBe(201);
    const twice = `<counter-${randomUUID()}@forgemsg>`;
    await db.execute(sql`
      INSERT INTO email_events (org_id, event_type, message_id)
      VALUES (${org}::uuid, 'send', ${twice}), (${org}::uuid, 'send', ${twice})
    `);
    const after = await measure();
    expect(after.counter - before.counter).toBe(2);
    expect(after).toEqual({ counter: after.truth, truth: after.truth });
  });

  it('counts a message written twice concurrently once, and distinct concurrent sends each once', async () => {
    const before = await measure();
    const mid = `<counter-${randomUUID()}@forgemsg>`;
    // The first writer holds its transaction open; the second must wait for it
    // and then see its row, not count past it.
    const first = db.transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO email_events (org_id, event_type, message_id) VALUES (${org}::uuid, 'send', ${mid})`,
      );
      await tx.execute(sql`SELECT pg_sleep(0.4)`);
    });
    await new Promise((r) => setTimeout(r, 100));
    const second = db.execute(
      sql`INSERT INTO email_events (org_id, event_type, message_id) VALUES (${org}::uuid, 'send', ${mid})`,
    );
    await Promise.all([first, second]);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        db.execute(
          sql`INSERT INTO email_events (org_id, event_type, message_id) VALUES (${org}::uuid, 'send', ${`<counter-par-${i}-${tag}@forgemsg>`})`,
        ),
      ),
    );
    const after = await measure();
    expect(after.counter - before.counter).toBe(21);
    expect(after.counter).toBe(after.truth);
  });

  it('does not move on a refused message', async () => {
    const before = await measure();
    const suppressed = rcpt();
    await db.insert(suppressions).values({ orgId: org, email: suppressed, reason: 'hard_bounce' });
    const s = await post('/api/v1/transactional/email', {
      to: suppressed,
      from: FROM,
      subject: 'x',
      html: '<p>x</p>',
    });
    expect((s.json() as { data?: { status?: string } }).data?.status ?? s.body).not.toBe('queued');
    const unverified = await post('/api/v1/transactional/email', {
      to: rcpt(),
      from: `x@not-${tag}.test`,
      subject: 'x',
      html: '<p>x</p>',
    });
    expect(unverified.statusCode).toBe(422);
    // A failed insert takes its count with it: the statement fails as a whole.
    // (No such campaign, so the foreign key refuses the row.)
    const noCampaign: string = randomUUID();
    await expect(
      db.execute(sql`
        INSERT INTO email_events (org_id, event_type, message_id, campaign_id)
        VALUES (${org}::uuid, 'send', ${`<counter-fk-${tag}@forgemsg>`}, ${noCampaign}::uuid)
      `),
    ).rejects.toThrow();
    expect(await measure()).toEqual(before);
  });

  it('still refuses an exhausted free plan, and the refusal is not counted', async () => {
    const free = await newOrg('free');
    try {
      await db.insert(sendingDomains).values({
        orgId: free,
        domain: `free-${DOMAIN}`,
        isVerified: true,
        dkimVerified: true,
        spfVerified: true,
        dmarcVerified: true,
      });
      const freeKey = `fm_live_${randomBytes(24).toString('hex')}`;
      await db.insert(apiKeys).values({
        orgId: free,
        name: `counter free ${tag}`,
        keyHash: createHash('sha256').update(freeKey).digest('hex'),
        keyPrefix: freeKey.slice(0, 12),
        scopes: [],
        role: 'admin',
      });
      const limit = (await getPlanCapacity(free)).sends.limit;
      expect(limit).toBeGreaterThan(0);
      await db.execute(sql`
        INSERT INTO email_events (org_id, event_type, message_id)
        SELECT ${free}::uuid, 'send', 'counter-free-' || g FROM generate_series(1, ${limit}) g
      `);
      expect(await measure(free)).toEqual({ counter: limit, truth: limit });

      const res = await post(
        '/api/v1/transactional/email',
        { to: rcpt(), from: `team@free-${DOMAIN}`, subject: 'x', html: '<p>x</p>' },
        { 'x-api-key': freeKey },
      );
      expect(res.statusCode, res.body).toBe(403);
      expect(res.body).toContain('send limit');
      const resend = await post(
        '/api/v1/emails',
        { from: `team@free-${DOMAIN}`, to: [rcpt()], subject: 'x', html: '<p>x</p>' },
        { 'x-api-key': freeKey },
      );
      expect(resend.statusCode, resend.body).toBe(403);
      expect(await measure(free)).toEqual({ counter: limit, truth: limit });
    } finally {
      await db.delete(emailEvents).where(eq(emailEvents.orgId, free));
      await db.delete(organizations).where(eq(organizations.id, free));
    }
  });

  it('opens a moved period from email_events, and ignores a row dated before it', async () => {
    const start = new Date(Date.now() - 60 * 60 * 1000);
    await db.insert(billingSubscriptions).values({ orgId: org, currentPeriodStart: start });
    const [row] = await db
      .select()
      .from(planSendCounters)
      .where(
        sql`${planSendCounters.orgId} = ${org}::uuid AND ${planSendCounters.periodStart} = ${start.toISOString()}::timestamptz`,
      );
    expect(row, 'the subscription opened the period').toBeDefined();
    const opened = await measure();
    expect(opened.counter).toBe(opened.truth);
    expect(opened.counter).toBeGreaterThan(0);

    await db.execute(sql`
      INSERT INTO email_events (org_id, event_type, message_id, created_at)
      VALUES (${org}::uuid, 'send', ${`<counter-old-${tag}@forgemsg>`}, ${start.toISOString()}::timestamptz - interval '1 day')
    `);
    expect(await measure()).toEqual(opened);
    const r = await post('/api/v1/transactional/email', {
      to: rcpt(),
      from: FROM,
      subject: 'x',
      html: '<p>x</p>',
    });
    expect(r.statusCode, r.body).toBe(202);
    expect(await measure()).toEqual({ counter: opened.counter + 1, truth: opened.counter + 1 });
  });

  it('counts a send that races a period change in the new period', async () => {
    const next = new Date(Date.now() - 30 * 60 * 1000);
    const mid = `<counter-race-${tag}@forgemsg>`;
    let sendDone = false;
    let send: Promise<unknown> | undefined;
    await db.transaction(async (tx) => {
      await tx
        .update(billingSubscriptions)
        .set({ currentPeriodStart: next })
        .where(eq(billingSubscriptions.orgId, org));
      // Reads the old period start (this update is not committed), so it
      // reaches for the old period's row, which this transaction holds.
      send = db
        .execute(
          sql`INSERT INTO email_events (org_id, event_type, message_id) VALUES (${org}::uuid, 'send', ${mid})`,
        )
        .then(() => (sendDone = true));
      await new Promise((r) => setTimeout(r, 300));
      expect(sendDone, 'the send waits for the period change').toBe(false);
    });
    await send;
    const m = await measure();
    expect(m.counter).toBe(m.truth);
    expect((await reconcilePlanSendCounters({ orgId: org })).drift).toEqual([]);
  });

  it('reconciliation names a counter that was knocked off', async () => {
    const clean = await reconcilePlanSendCounters({ orgId: org });
    expect(clean.checked).toBe(1);
    expect(clean.drift).toEqual([]);
    await db.execute(sql`
      UPDATE plan_send_counters SET sends = sends + 5
      WHERE org_id = ${org}::uuid AND period_start = plan_period_start(${org}::uuid)
    `);
    const { drift } = await reconcilePlanSendCounters({ orgId: org });
    const m = await measure();
    expect(drift).toEqual([
      expect.objectContaining({
        orgId: org,
        slug: `counter-pro-${tag}`,
        counter: m.truth + 5,
        truth: m.truth,
        diff: 5,
        mayBeArchived: false,
      }),
    ]);
  });
});
