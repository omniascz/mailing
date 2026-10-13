/**
 * A DSN with a transient status is a deferral, not a bounce (Z139).
 *
 * ─── What was wrong (measured on master) ─────────────────────────────────────
 *
 * Every DSN went through classifyBounce and was stored as a bounce. A delay
 * notice — Status 4.4.7, "will keep trying" — was a soft bounce: on a campaign
 * of 100 with 8 real hard bounces, 20 delay notices read a 23.33 % bounce rate,
 * an F health score, and raised the 10 % auto-pause rule eight times. And
 * because classifyBounce reads the whole body, a delay notice that quoted an
 * earlier "550 5.1.1" was a hard bounce that suppressed the address.
 *
 * ─── What holds now ──────────────────────────────────────────────────────────
 *
 *  - Status 4.x.x (or no Status field and a transient classification):
 *    `deferred`, never a bounce, never a suppression, as many as arrive.
 *  - Status 5.x.x: a bounce as classified — hard (suppressed: invalid_email or
 *    hard_bounce), or block for a policy rejection (5.7.x; not suppressed, as
 *    before).
 *
 * WHAT THIS FILE CANNOT SEE
 * - The SMTP session (mta-sender): its deferrals and its definitive soft
 *   bounce are walked in apps/workers/src/integration/soft-bounce-suppression.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { encodeVerp } from '@forgemsg/shared/sending/verp';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import {
  apiKeys,
  campaigns,
  contacts,
  emailEvents,
  organizations,
  suppressions,
} from '../db/schema/index.js';
import { receiveInbound } from '../services/inbound-email/index.js';
import { checkEventInvariants } from '../services/billing/plan-send-reconcile.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
let org: string;
let key: string;
let campaignId: string;

/** A campaign message to a new contact, delivered (as mta-sender records it). */
async function delivered(): Promise<{ email: string; messageId: string }> {
  const email = `d-${randomUUID().slice(0, 8)}@example.test`;
  const [c] = await db
    .insert(contacts)
    .values({ orgId: org, email, status: 'active' })
    .returning({ id: contacts.id });
  const messageId = `<dsn-${randomUUID()}@forgemsg>`;
  for (const type of ['send', 'deliver'] as const) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/events',
      headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
      payload: { type, orgId: org, campaignId, contactId: c!.id, messageId, recipient: email },
    });
    expect(r.statusCode).toBe(201);
  }
  return { email, messageId };
}

function dsn(m: { email: string; messageId: string }, status: string, diag: string) {
  const transient = status.startsWith('4');
  return receiveInbound(org, {
    from: 'MAILER-DAEMON@mx.example',
    to: encodeVerp(m.messageId, 'bounce.example.test'),
    subject: transient
      ? 'Delivery Status Notification (Delay)'
      : 'Undelivered Mail Returned to Sender',
    textBody: [
      `Final-Recipient: rfc822; ${m.email}`,
      `Action: ${transient ? 'delayed' : 'failed'}`,
      `Status: ${status}`,
      `Diagnostic-Code: smtp; ${diag}`,
    ].join('\n'),
    headers: {},
  } as never);
}

async function rows(messageId: string) {
  const r = (await db.execute(sql`
    SELECT CASE WHEN bounce_type IS NULL THEN event_type::text
                ELSE event_type::text || ':' || bounce_type::text END AS t,
           count(*)::int AS n
    FROM email_events WHERE org_id = ${org}::uuid AND message_id = ${messageId}
    GROUP BY 1 ORDER BY 1
  `)) as unknown as Array<{ t: string; n: number }>;
  return Object.fromEntries(r.map((x) => [x.t, x.n]));
}

async function suppressedAs(email: string): Promise<string[]> {
  const s = await db
    .select({ reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, org), eq(suppressions.email, email)));
  return s.map((x) => x.reason).sort();
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [o] = await db
    .insert(organizations)
    .values({ name: `dsn ${tag}`, slug: `dsn-${tag}`, plan: 'pro' })
    .returning({ id: organizations.id });
  org = o!.id;
  key = `fm_live_${randomBytes(24).toString('hex')}`;
  await db.insert(apiKeys).values({
    orgId: org,
    name: `dsn ${tag}`,
    keyHash: createHash('sha256').update(key).digest('hex'),
    keyPrefix: key.slice(0, 12),
    scopes: [],
    role: 'admin',
  });
  const [c] = await db
    .insert(campaigns)
    .values({ orgId: org, name: `dsn ${tag}` })
    .returning({ id: campaigns.id });
  campaignId = c!.id;
}, 120_000);

afterAll(async () => {
  if (org) {
    await db.delete(emailEvents).where(eq(emailEvents.orgId, org));
    await db.delete(suppressions).where(eq(suppressions.orgId, org));
    await db.delete(organizations).where(eq(organizations.id, org));
  }
  await app?.close();
});

describe('a DSN with a transient status is a deferral', () => {
  it('three delay notices: three deferrals, no bounce, no suppression', async () => {
    const m = await delivered();
    for (let i = 0; i < 3; i++)
      await dsn(m, '4.4.7', '421 4.4.7 Message delayed, will keep trying');
    expect(await rows(m.messageId)).toEqual({ deferred: 3, deliver: 1, send: 1 });
    expect(await suppressedAs(m.email)).toEqual([]);
  });

  it('a delay notice quoting an earlier 5.1.1 is still a deferral and suppresses nothing', async () => {
    const m = await delivered();
    await dsn(m, '4.4.7', '451 4.4.7 still trying; previous attempt said 550 5.1.1 user unknown');
    expect(await rows(m.messageId)).toEqual({ deferred: 1, deliver: 1, send: 1 });
    expect(await suppressedAs(m.email)).toEqual([]);
  });

  it('a delay and then the failure: a deferral and a hard bounce, suppressed at the failure', async () => {
    const m = await delivered();
    await dsn(m, '4.4.7', '421 4.4.7 Message delayed');
    expect(await suppressedAs(m.email)).toEqual([]);
    await dsn(m, '5.1.1', '550 5.1.1 user unknown');
    expect(await rows(m.messageId)).toEqual({
      'bounce:hard': 1,
      deferred: 1,
      deliver: 1,
      send: 1,
    });
    expect(await suppressedAs(m.email)).toEqual(['invalid_email']);
  });

  it('5.x.x is a bounce; a policy rejection (5.7.1) is a block and suppresses nothing, as before', async () => {
    const full = await delivered();
    await dsn(full, '5.2.2', '552 5.2.2 Mailbox full');
    expect(await rows(full.messageId)).toEqual({ 'bounce:hard': 1, deliver: 1, send: 1 });
    expect(await suppressedAs(full.email)).toEqual(['hard_bounce']);
    const policy = await delivered();
    await dsn(policy, '5.7.1', '550 5.7.1 Message rejected by policy');
    expect(await rows(policy.messageId)).toEqual({ 'bounce:block': 1, deliver: 1, send: 1 });
    expect(await suppressedAs(policy.email)).toEqual([]);
  });

  it('delay notices leave the campaign bounce rate alone, and the invariants hold', async () => {
    const stats = (
      await app.inject({
        method: 'GET',
        url: `/api/v1/campaigns/${campaignId}/stats`,
        headers: { 'x-api-key': key },
      })
    ).json().data as { delivered: number; bounces: number; softBounces: number };
    // Five delivered messages above and four delay notices; the bounces are
    // the three 5.x.x DSNs only — hard 2 (5.1.1, 5.2.2), block 1 (5.7.1).
    expect(stats).toMatchObject({ delivered: 5, softBounces: 0, bounces: 3 });
    expect((await checkEventInvariants({ orgId: org })).breaches).toEqual([]);
  });
});
