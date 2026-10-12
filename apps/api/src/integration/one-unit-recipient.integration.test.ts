/**
 * One unit for the plan limit, its counter, the `send` rows and the invoice:
 * the recipient (Z137).
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 *  - POST /emails and /emails/batch checked the plan for to + cc + bcc and
 *    wrote one `send` row per message, so the plan, its counter and every
 *    statistic counted a three-recipient email as one.
 *  - The invoice basis (product_usage_meters) was written by the shared
 *    transactional path only, after the reply, failures swallowed: /emails,
 *    campaigns and campaign tests were never on it, and the plan and the
 *    invoice disagreed.
 *  - A campaign message posted twice by mta-sender (a stalled job run again)
 *    was stored twice, and campaign stats showed it twice.
 *  - A sandboxed send counted against the plan and was not billed.
 *
 * Every case below reads all five: the plan's current count, the counter, the
 * `send` rows, the invoice basis (getProductUsage / getOrgUsageSummary /
 * computePeriodCost) and, at the end, the reconciliation.
 *
 * One organisation of its own and one API key of its own (its own rate-limit
 * bucket); a second, free-plan organisation for the plan limit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import {
  apiKeys,
  campaigns,
  contacts,
  emailEvents,
  organizations,
  productMeterEvents,
  productUsageMeters,
  sendingDomains,
} from '../db/schema/index.js';
import { getPlanCapacity } from '../services/billing/plan-enforcement.js';
import { reconcilePlanSendCounters } from '../services/billing/plan-send-reconcile.js';
import {
  computePeriodCost,
  getOrgUsageSummary,
  getProductUsage,
  recordUsage,
} from '../services/billing/meters.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const rcpt = (p = 'r') => `${p}-${randomUUID().slice(0, 8)}@example.test`;

interface Org {
  id: string;
  key: string;
  from: string;
}
let org: Org;
let free: Org;
let campaignId: string;
let contactId: string;
let contactEmail: string;

async function newOrg(plan: 'pro' | 'free'): Promise<Org> {
  const domain = `unit-${plan}-${tag}.test`;
  const [o] = await db
    .insert(organizations)
    .values({ name: `unit ${plan} ${tag}`, slug: `unit-${plan}-${tag}`, plan })
    .returning({ id: organizations.id });
  await db.insert(sendingDomains).values({
    orgId: o!.id,
    domain,
    isVerified: true,
    dkimVerified: true,
    spfVerified: true,
    dmarcVerified: true,
  });
  const key = `fm_live_${randomBytes(24).toString('hex')}`;
  await db.insert(apiKeys).values({
    orgId: o!.id,
    name: `unit ${plan} ${tag}`,
    keyHash: createHash('sha256').update(key).digest('hex'),
    keyPrefix: key.slice(0, 12),
    scopes: [],
    role: 'admin',
  });
  return { id: o!.id, key, from: `team@${domain}` };
}

const call = (o: Org, method: 'GET' | 'POST', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { 'x-api-key': o.key }, payload: payload as object });

/** The five numbers, for the org's current period. */
async function five(o: Org) {
  const [r] = (await db.execute(sql`
    SELECT count(*) FILTER (WHERE event_type = 'send')::int AS rows,
           count(*) FILTER (WHERE event_type = 'send' AND sandbox)::int AS sandbox_rows,
           coalesce((SELECT sends FROM plan_send_counters
                     WHERE org_id = ${o.id}::uuid AND period_start = plan_period_start(${o.id}::uuid)), 0) AS counter
    FROM email_events WHERE org_id = ${o.id}::uuid
  `)) as unknown as Array<{ rows: number; sandbox_rows: number; counter: number }>;
  const summary = await getOrgUsageSummary(o.id);
  return {
    plan: (await getPlanCapacity(o.id)).sends.current,
    counter: Number(r!.counter),
    rows: r!.rows,
    sandboxRows: r!.sandbox_rows,
    invoice: (await getProductUsage(o.id, 'email')).unitsUsed,
    summary: summary.find((p) => p.product === 'email')?.unitsUsed ?? 0,
    cost: await computePeriodCost(o.id),
  };
}

function delta(a: Awaited<ReturnType<typeof five>>, b: Awaited<ReturnType<typeof five>>) {
  return {
    plan: b.plan - a.plan,
    counter: b.counter - a.counter,
    rows: b.rows - a.rows,
    sandboxRows: b.sandboxRows - a.sandboxRows,
    invoice: b.invoice - a.invoice,
    summary: b.summary - a.summary,
    cost: Number((b.cost - a.cost).toFixed(4)),
  };
}

/** n units of every kind, 0.0002 USD each. */
const units = (n: number) => ({
  plan: n,
  counter: n,
  rows: n,
  sandboxRows: 0,
  invoice: n,
  summary: n,
  cost: Number((n * 0.0002).toFixed(4)),
});

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  org = await newOrg('pro');
  free = await newOrg('free');
  const [c] = await db
    .insert(campaigns)
    .values({ orgId: org.id, name: `unit ${tag}` })
    .returning({ id: campaigns.id });
  campaignId = c!.id;
  contactEmail = rcpt('contact');
  const [k] = await db
    .insert(contacts)
    .values({ orgId: org.id, email: contactEmail, status: 'active' })
    .returning({ id: contacts.id });
  contactId = k!.id;
}, 120_000);

afterAll(async () => {
  for (const o of [org, free]) {
    if (!o) continue;
    await db.delete(emailEvents).where(eq(emailEvents.orgId, o.id));
    await db.delete(organizations).where(eq(organizations.id, o.id));
  }
  await app?.close();
});

describe('one unit: the recipient', () => {
  it('/emails to + cc + bcc is three of everything, and GET /emails shows one email', async () => {
    const a = await five(org);
    const to = rcpt('to');
    const res = await call(org, 'POST', '/api/v1/emails', {
      from: org.from,
      to,
      cc: [rcpt('cc')],
      bcc: [rcpt('bcc')],
      subject: 'Three',
      html: '<p>x</p>',
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { id: string; to: string[] };
    expect(body.to).toEqual([to]);
    expect(delta(a, await five(org))).toEqual(units(3));

    const rows = await db
      .select({ recipient: emailEvents.recipient })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.orgId, org.id),
          eq(emailEvents.eventType, 'send'),
          eq(emailEvents.messageId, `<${body.id}@forgemsg>`),
        ),
      );
    expect(rows.map((r) => r.recipient).sort()).toHaveLength(3);
    expect(rows.map((r) => r.recipient)).toContain(to);

    const one = await call(org, 'GET', `/api/v1/emails/${body.id}`);
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({ id: body.id, to: [to], subject: 'Three' });
    const list = (await call(org, 'GET', '/api/v1/emails?limit=10')).json() as {
      data: Array<{ id: string }>;
    };
    expect(list.data.filter((e) => e.id === body.id)).toHaveLength(1);
  });

  it('an address listed twice is one recipient', async () => {
    const a = await five(org);
    const same = rcpt('same');
    const res = await call(org, 'POST', '/api/v1/emails', {
      from: org.from,
      to: same,
      cc: [same.toUpperCase(), rcpt('cc')],
      subject: 'Twice',
      html: '<p>x</p>',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(delta(a, await five(org))).toEqual(units(2));
  });

  it('/emails/batch counts each item by its recipients', async () => {
    const a = await five(org);
    const res = await call(org, 'POST', '/api/v1/emails/batch', [
      { from: org.from, to: [rcpt()], cc: [rcpt()], bcc: [rcpt()], subject: 'x', html: '<p>x</p>' },
      { from: org.from, to: [rcpt()], subject: 'x', html: '<p>x</p>' },
    ]);
    expect(res.statusCode, res.body).toBe(200);
    expect(delta(a, await five(org))).toEqual(units(4));
  });

  it('the plan is checked in the same unit it counts', async () => {
    const limit = (await getPlanCapacity(free.id)).sends.limit;
    const fill = async (remaining: number) => {
      await db.delete(emailEvents).where(eq(emailEvents.orgId, free.id));
      await db.execute(sql`DELETE FROM plan_send_counters WHERE org_id = ${free.id}::uuid`);
      await db.execute(sql`
        INSERT INTO email_events (org_id, event_type, message_id)
        SELECT ${free.id}::uuid, 'send', 'unit-fill-' || g FROM generate_series(1, ${limit - remaining}) g
      `);
    };
    const three = () =>
      call(free, 'POST', '/api/v1/emails', {
        from: free.from,
        to: rcpt(),
        cc: [rcpt()],
        bcc: [rcpt()],
        subject: 'x',
        html: '<p>x</p>',
      });
    await fill(2);
    const a = await five(free);
    expect((await three()).statusCode).toBe(403);
    expect(delta(a, await five(free))).toEqual(units(0));
    await fill(3);
    const b = await five(free);
    expect((await three()).statusCode).toBe(200);
    expect(delta(b, await five(free))).toEqual(units(3));
    // Exhausted: refused, nothing counted.
    const c = await five(free);
    expect((await three()).statusCode).toBe(403);
    expect(delta(c, await five(free))).toEqual(units(0));
  });

  it('a sandboxed send is recorded and counted by nothing', async () => {
    const a = await five(org);
    const t = await call(org, 'POST', '/api/v1/transactional/email', {
      to: rcpt(),
      from: org.from,
      subject: 'x',
      html: '<p>x</p>',
      sandboxMode: true,
    });
    expect(t.statusCode, t.body).toBe(202);
    const e = await call(org, 'POST', '/api/v1/emails', {
      from: org.from,
      to: rcpt(),
      cc: [rcpt()],
      subject: 'x',
      html: '<p>x</p>',
      sandbox_mode: true,
    });
    expect(e.statusCode, e.body).toBe(200);
    expect(delta(a, await five(org))).toEqual({ ...units(0), rows: 3, sandboxRows: 3 });
  });

  it('a campaign message posted twice is one row, one unit and one in the campaign stats', async () => {
    const statsBefore = (await call(org, 'GET', `/api/v1/campaigns/${campaignId}/stats`)).json()
      .data.sent as number;
    const a = await five(org);
    const body = {
      type: 'send',
      orgId: org.id,
      campaignId,
      contactId,
      messageId: `<unit-${randomUUID()}@forgemsg>`,
      recipient: contactEmail,
    };
    const post = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/internal/events',
        headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
        payload: body,
      });
    const first = await post();
    const second = await post();
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual({ ok: true, duplicate: true });
    expect(delta(a, await five(org))).toEqual(units(1));
    const statsAfter = (await call(org, 'GET', `/api/v1/campaigns/${campaignId}/stats`)).json().data
      .sent as number;
    expect(statsAfter - statsBefore).toBe(1);

    // A worker deployed before the recipient was sent: the contact's address
    // stands in, so the second post is still a no-op.
    const { recipient: _omit, ...old } = { ...body, messageId: `<unit-old-${tag}@forgemsg>` };
    const b = await five(org);
    for (let i = 0; i < 2; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/internal/events',
        headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
        payload: old,
      });
      expect(r.statusCode).toBe(201);
    }
    expect(delta(b, await five(org))).toEqual(units(1));
  });

  it('the invoice basis is the counter, by Stripe period or by calendar month', async () => {
    const now = await five(org);
    const month = new Date().toISOString().slice(0, 7);
    // No subscription: the period is the calendar month, so both readings agree.
    expect((await getProductUsage(org.id, 'email', month)).unitsUsed).toBe(now.counter);
    expect((await getProductUsage(org.id, 'email', '2000-01')).unitsUsed).toBe(0);
    const usage = await call(org, 'GET', '/api/v1/billing/usage');
    expect(usage.json()).toMatchObject({
      data: { products: [expect.objectContaining({ product: 'email', unitsUsed: now.counter })] },
    });
  });

  it('a billing write that fails is an error, and leaves nothing half-written', async () => {
    await expect(recordUsage(org.id, 'email', 1)).rejects.toThrow(/plan send counter/);
    const ghost = randomUUID();
    await expect(recordUsage(ghost, 'sms', 1)).rejects.toThrow();
    const [m] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(productUsageMeters)
      .where(eq(productUsageMeters.orgId, ghost));
    const [e] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(productMeterEvents)
      .where(eq(productMeterEvents.orgId, ghost));
    expect([m!.n, e!.n]).toEqual([0, 0]);
    await recordUsage(org.id, 'sms', 2, 'ref-1', 'test');
    const sms = await getProductUsage(org.id, 'sms');
    expect(sms.unitsUsed).toBe(2);
  });

  it('reconciles to zero after all of it', async () => {
    for (const o of [org, free]) {
      expect((await reconcilePlanSendCounters({ orgId: o.id })).drift).toEqual([]);
    }
  });
});
