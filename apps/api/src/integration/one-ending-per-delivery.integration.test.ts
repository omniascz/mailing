/**
 * The events that happen once to one delivery are stored once (Z138); the
 * ones that repeat legitimately are not touched.
 *
 * ─── What was wrong (measured on master in the Z138 probe) ───────────────────
 *
 * Only `send` was unique (0030). A stalled mta-sender job run again stored a
 * second `deliver` (or `failed`, or bounce), a mailbox provider sending the
 * same DSN twice stored two bounces, and the same ARF report posted twice
 * stored two complaints, counted two and fired everything twice. `deliver` is
 * the denominator of the bounce rate, the delivery rate, the health score,
 * the insights and the auto-pause: a campaign of 100 with 10 deliveries
 * stored twice read a 9.09 % bounce rate instead of 10 %.
 *
 * ─── What is unique now, and what is not ─────────────────────────────────────
 *
 *   deliver, failed, complaint   once per (org, message, recipient)
 *   bounce                       once per (org, message, recipient, type)
 *   deferred                     once per attempt — repeats
 *   open, click                  every time — repeat
 *   unsubscribe                  the service writes it only when something
 *                                changed (a second click writes nothing); a
 *                                list and then everything are two
 *
 * A repeat is a no-op for the caller: 201 from /internal/events with
 * `duplicate: true`, `duplicate` from the FBL processor — nothing stored,
 * counted or announced.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { createTrackingToken } from '@forgemsg/shared';
import { encodeVerp } from '@forgemsg/shared/sending/verp';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import {
  apiKeys,
  billingSubscriptions,
  campaigns,
  consentEvents,
  contacts,
  emailEvents,
  organizations,
  sendingDomains,
  webhookDeliveries,
  webhooks,
} from '../db/schema/index.js';
import { receiveInbound } from '../services/inbound-email/index.js';
import {
  checkEventInvariants,
  reconcilePlanSendCounters,
} from '../services/billing/plan-send-reconcile.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const DOMAIN = `ending-${tag}.test`;
let org: string;
let key: string;
let campaignId: string;

async function contact(): Promise<{ id: string; email: string }> {
  const email = `e-${randomUUID().slice(0, 8)}@example.test`;
  const [c] = await db
    .insert(contacts)
    .values({ orgId: org, email, status: 'active' })
    .returning({ id: contacts.id });
  return { id: c!.id, email };
}

/** An event as mta-sender posts it. */
function event(
  type: 'send' | 'deliver' | 'bounce' | 'deferred' | 'failed',
  messageId: string,
  c: { id: string; email: string },
  metadata: Record<string, unknown> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/internal/events',
    headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
    payload: {
      type,
      orgId: org,
      campaignId,
      contactId: c.id,
      messageId,
      recipient: c.email,
      metadata,
    },
  });
}

async function rows(messageId: string) {
  const r = (await db.execute(sql`
    SELECT event_type::text AS t, coalesce(bounce_type::text, '') AS bt, count(*)::int AS n
    FROM email_events WHERE org_id = ${org}::uuid AND message_id = ${messageId}
    GROUP BY 1, 2 ORDER BY 1, 2
  `)) as unknown as Array<{ t: string; bt: string; n: number }>;
  return Object.fromEntries(r.map((x) => [x.bt ? `${x.t}:${x.bt}` : x.t, x.n]));
}

async function hooks(event: string): Promise<number> {
  const [h] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(and(eq(webhooks.orgId, org), eq(webhookDeliveries.event, event)));
  return h!.n;
}
const settle = () => new Promise((r) => setTimeout(r, 400));
const mid = () => `<ending-${randomUUID()}@forgemsg>`;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [o] = await db
    .insert(organizations)
    .values({ name: `ending ${tag}`, slug: `ending-${tag}`, plan: 'pro' })
    .returning({ id: organizations.id });
  org = o!.id;
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
    name: `ending ${tag}`,
    keyHash: createHash('sha256').update(key).digest('hex'),
    keyPrefix: key.slice(0, 12),
    scopes: [],
    role: 'admin',
  });
  await db.insert(webhooks).values({
    orgId: org,
    url: 'https://hooks.example.invalid/z138',
    secret: 'z138',
    events: ['email.delivered', 'email.bounced', 'email.complained'],
  });
  const [c] = await db
    .insert(campaigns)
    .values({ orgId: org, name: `ending ${tag}` })
    .returning({ id: campaigns.id });
  campaignId = c!.id;
}, 120_000);

afterAll(async () => {
  if (org) {
    await db.delete(emailEvents).where(eq(emailEvents.orgId, org));
    // The opt_out row a recipient's own unsubscribe writes since Z186.
    await db.delete(consentEvents).where(eq(consentEvents.orgId, org));
    await db.delete(organizations).where(eq(organizations.id, org));
  }
  await app?.close();
});

describe('one ending per delivery', () => {
  it('a delivery posted twice: one row, one webhook, campaign stats count it once', async () => {
    const c = await contact();
    const m = mid();
    const hooksBefore = await hooks('email.delivered');
    const statsBefore = (
      await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}/stats`,
        headers: { 'x-api-key': key },
      })
    ).json().data;
    expect((await event('send', m, c)).statusCode).toBe(201);
    expect((await event('deliver', m, c)).statusCode).toBe(201);
    // The same job, processed again.
    expect((await event('send', m, c)).json()).toEqual({ ok: true, duplicate: true });
    const again = await event('deliver', m, c);
    expect(again.statusCode).toBe(201);
    expect(again.json()).toEqual({ ok: true, duplicate: true });
    await settle();
    expect(await rows(m)).toEqual({ deliver: 1, send: 1 });
    expect((await hooks('email.delivered')) - hooksBefore).toBe(1);
    const statsAfter = (
      await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}/stats`,
        headers: { 'x-api-key': key },
      })
    ).json().data;
    expect(statsAfter.delivered - statsBefore.delivered).toBe(1);
    expect(statsAfter.sent - statsBefore.sent).toBe(1);
  });

  it('bounce once per type, failed once, deferred every attempt', async () => {
    const c = await contact();
    const hard = mid();
    await event('bounce', hard, c, { bounceType: 'hard' });
    await event('bounce', hard, c, { bounceType: 'hard' });
    const failed = mid();
    await event('failed', failed, c, { reason: 'transport_error' });
    await event('failed', failed, c, { reason: 'transport_error' });
    const greylisted = mid();
    await event('deferred', greylisted, c, { reason: 'soft_bounce', attempt: 0 });
    await event('deferred', greylisted, c, { reason: 'soft_bounce', attempt: 1 });
    await event('send', greylisted, c);
    await event('deliver', greylisted, c);
    expect(await rows(hard)).toEqual({ 'bounce:hard': 1 });
    expect(await rows(failed)).toEqual({ failed: 1 });
    expect(await rows(greylisted)).toEqual({ deferred: 2, deliver: 1, send: 1 });
  });

  it('/emails to three recipients: a delivery for each is kept', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/emails',
      headers: { 'x-api-key': key },
      payload: {
        from: `team@${DOMAIN}`,
        to: 'a@example.test',
        cc: ['b@example.test'],
        bcc: ['c@example.test'],
        subject: 'x',
        html: '<p>x</p>',
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const m = `<${(res.json() as { id: string }).id}@forgemsg>`;
    // mta-sender's events for a /emails message: placeholder ids, a recipient each.
    for (const to of ['a@example.test', 'b@example.test', 'c@example.test']) {
      for (let i = 0; i < 2; i++) {
        const r = await app.inject({
          method: 'POST',
          url: '/api/v1/internal/events',
          headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
          payload: {
            type: 'deliver',
            orgId: org,
            campaignId: org,
            contactId: randomUUID(),
            messageId: m,
            recipient: to,
            campaignIsPlaceholder: true,
          },
        });
        expect(r.statusCode).toBe(201);
      }
    }
    expect(await rows(m)).toEqual({ deliver: 3, send: 3 });
  });

  it('opens and clicks repeat', async () => {
    const c = await contact();
    const ts = Math.floor(Date.now() / 1000);
    const open = createTrackingToken({ type: 'open', campaignId, contactId: c.id, orgId: org, ts });
    const click = createTrackingToken({
      type: 'click',
      campaignId,
      contactId: c.id,
      orgId: org,
      url: 'https://example.test/x',
      ts,
    });
    for (let i = 0; i < 2; i++) await app.inject({ method: 'GET', url: `/track/o/${open}` });
    for (let i = 0; i < 2; i++) await app.inject({ method: 'GET', url: `/track/c/${click}` });
    await settle();
    const [r] = (await db.execute(sql`
      SELECT count(*) FILTER (WHERE event_type = 'open')::int AS opens,
             count(*) FILTER (WHERE event_type = 'click')::int AS clicks
      FROM email_events WHERE org_id = ${org}::uuid AND contact_id = ${c.id}::uuid
    `)) as unknown as Array<{ opens: number; clicks: number }>;
    expect(r).toEqual({ opens: 2, clicks: 2 });
  });

  it('the same FBL report twice is one complaint; a complaint about another message is another', async () => {
    const c = await contact();
    const m = mid();
    const arf = (messageId: string) =>
      [
        'From: fbl@isp.example',
        'Subject: complaint',
        '',
        'Feedback-Type: abuse',
        'Version: 1',
        `Original-Rcpt-To: ${c.email}`,
        '',
        `Message-ID: ${messageId}`,
        '',
      ].join('\r\n');
    const post = (messageId: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/isp/feedback',
        payload: arf(messageId),
        headers: {
          'content-type': 'text/plain',
          'x-fbl-secret': env.FBL_WEBHOOK_SECRET,
          'x-org-id': org,
          'x-campaign-id': campaignId,
        },
      });
    const before = await hooks('email.complained');
    expect((await post(m)).statusCode).toBe(200);
    expect((await post(m)).statusCode).toBe(200);
    await settle();
    expect(await rows(m)).toEqual({ complaint: 1 });
    const count = async () =>
      (
        await db.select({ n: contacts.complaintCount }).from(contacts).where(eq(contacts.id, c.id))
      )[0]!.n;
    expect(await count()).toBe(1);
    expect((await hooks('email.complained')) - before).toBe(1);
    const other = mid();
    await post(other);
    expect(await rows(other)).toEqual({ complaint: 1 });
    expect(await count()).toBe(2);
  });

  // Until Z139 the delay notice was stored as a soft bounce, so this pinned
  // `bounce:soft` + `bounce:hard`. A 4.x.x DSN is a deferral (Z139).
  it('the same DSN twice is one bounce; a delay notice and then the failure are a deferral and a bounce', async () => {
    const c = await contact();
    const dsn = (m: string, subject: string, status: string, action: string) => ({
      from: 'MAILER-DAEMON@mx.example',
      to: encodeVerp(m, 'bounce.example.test'),
      subject,
      textBody: `Final-Recipient: rfc822; ${c.email}\nAction: ${action}\nStatus: ${status}\nDiagnostic-Code: smtp; ${status.startsWith('4') ? '451 4.4.7 try again later' : '550 5.1.1 user unknown'}`,
      headers: {},
    });
    const twice = mid();
    await event('send', twice, c);
    await event('deliver', twice, c);
    for (let i = 0; i < 2; i++)
      await receiveInbound(
        org,
        dsn(twice, 'Undelivered Mail Returned to Sender', '5.1.1', 'failed') as never,
      );
    expect(await rows(twice)).toEqual({ 'bounce:hard': 1, deliver: 1, send: 1 });
    const later = mid();
    await event('send', later, c);
    await event('deliver', later, c);
    await receiveInbound(
      org,
      dsn(later, 'Delivery Status Notification (Delay)', '4.4.7', 'delayed') as never,
    );
    await receiveInbound(
      org,
      dsn(later, 'Delivery Status Notification (Failure)', '5.1.1', 'failed') as never,
    );
    expect(await rows(later)).toEqual({ 'bounce:hard': 1, deferred: 1, deliver: 1, send: 1 });
  });

  it('a second unsubscribe click writes nothing, as before', async () => {
    const c = await contact();
    const t = createTrackingToken({
      type: 'unsub',
      orgId: org,
      contactId: c.id,
      campaignId,
      ts: Math.floor(Date.now() / 1000),
    });
    for (let i = 0; i < 2; i++) {
      const r = await app.inject({ method: 'POST', url: `/api/v1/unsubscribe/${t}` });
      expect(r.statusCode).toBe(204);
    }
    const [r] = (await db.execute(sql`
      SELECT count(*)::int AS n FROM email_events
      WHERE org_id = ${org}::uuid AND contact_id = ${c.id}::uuid AND event_type = 'unsubscribe'
    `)) as unknown as Array<{ n: number }>;
    expect(r!.n).toBe(1);
  });

  it('the invariants hold, and name a message that breaks them', async () => {
    expect((await checkEventInvariants({ orgId: org })).breaches).toEqual([]);
    expect((await reconcilePlanSendCounters({ orgId: org })).drift).toEqual([]);

    const c = await contact();
    const noSend = mid();
    await event('deliver', noSend, c);
    const twoEndings = mid();
    await event('send', twoEndings, c);
    await event('deliver', twoEndings, c);
    // A second ending through the API is refused since Z140 (the post below is
    // a no-op), so the breach is made by hand: a row with no recipient, which
    // no unique index constrains — what a row from before 0030 looks like.
    expect((await event('failed', twoEndings, c, { reason: 'suppressed' })).json()).toEqual({
      ok: true,
      duplicate: true,
    });
    await db.execute(sql`
      INSERT INTO email_events (org_id, campaign_id, contact_id, event_type, message_id)
      VALUES (${org}::uuid, ${campaignId}::uuid, ${c.id}::uuid, 'failed', ${twoEndings})
    `);
    const { breaches } = await checkEventInvariants({ orgId: org });
    expect(breaches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageId: noSend,
          rule: 'deliver_exceeds_send',
          deliver: 1,
          send: 0,
        }),
        expect.objectContaining({
          messageId: twoEndings,
          rule: 'outcomes_exceed_send',
          send: 1,
          deliver: 1,
          failed: 1,
        }),
      ]),
    );
    expect(breaches).toHaveLength(2);
  });

  it('/billing/usage says which period it answers for', async () => {
    const usage = async (q = '') =>
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/billing/usage${q}`,
          headers: { 'x-api-key': key },
        })
      ).json().data as { period: string; periodStart?: string };
    const calendar = await usage();
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`;
    expect(calendar).toMatchObject({ period: monthStart.slice(0, 7), periodStart: monthStart });
    const start = new Date(Date.UTC(2026, 8, 12, 10, 0, 0));
    await db.insert(billingSubscriptions).values({ orgId: org, currentPeriodStart: start });
    expect(await usage()).toMatchObject({ period: '2026-09', periodStart: start.toISOString() });
    const asked = await usage('?period=2026-07');
    expect(asked.period).toBe('2026-07');
    expect(asked.periodStart).toBeUndefined();
  });
});
