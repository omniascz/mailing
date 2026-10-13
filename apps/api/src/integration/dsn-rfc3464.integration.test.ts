/**
 * A DSN is read as RFC 3464 defines it, not by looking for words in its body
 * (Z141).
 *
 * ─── What was wrong (measured on master, end to end) ─────────────────────────
 *
 * The engine's MX parser kept only text/plain and text/html, so the
 * message/delivery-status part never reached the API and every DSN was
 * classified from its human-readable text:
 *  - a delay notice quoting an earlier "550 5.1.1" was a hard bounce that
 *    suppressed a deliverable address;
 *  - "Action: failed / Status: 4.4.7" was an unclassified soft bounce that
 *    suppressed nothing;
 *  - a DSN for three recipients was one row, with no recipient, for none of
 *    them.
 *
 * ─── What holds now ──────────────────────────────────────────────────────────
 *
 * The engine passes the part as `deliveryStatus`; each recipient block is
 * decided from its own Action, Status and Diagnostic-Code (a field missing
 * there from the per-message block), by the rules of Z139/Z140, and written as
 * its own row. Only a DSN without the part falls back to the body text, and
 * its row says `dsnSource: 'body-text'`.
 *
 * Driven through POST /api/v1/webhooks/inbound-email/raw — the route the
 * engine's MX receiver posts to — with the payload it now sends. The Go side
 * (that the part is kept) is apps/engine/internal/inbound/dsn_test.go.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { encodeVerp } from '@forgemsg/shared/sending/verp';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import {
  campaigns,
  contacts,
  emailEvents,
  inboundEmails,
  organizations,
  suppressions,
} from '../db/schema/index.js';
import { checkEventInvariants } from '../services/billing/plan-send-reconcile.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
let org: string;
let campaignId: string;

async function contact(): Promise<{ id: string; email: string }> {
  const email = `r-${randomUUID().slice(0, 8)}@example.test`;
  const [c] = await db
    .insert(contacts)
    .values({ orgId: org, email, status: 'active' })
    .returning({ id: contacts.id });
  return { id: c!.id, email };
}

/** Send + deliver for each recipient of one message, as mta-sender records them. */
async function delivered(recipients: Array<{ id: string; email: string }>): Promise<string> {
  const messageId = `<rfc-${randomUUID()}@forgemsg>`;
  for (const r of recipients) {
    for (const type of ['send', 'deliver'] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/internal/events',
        headers: { 'x-internal-secret': env.INTERNAL_API_SECRET ?? '' },
        payload: { type, orgId: org, campaignId, contactId: r.id, messageId, recipient: r.email },
      });
      expect(res.statusCode).toBe(201);
    }
  }
  return messageId;
}

interface Block {
  rcpt: string;
  action?: string;
  status?: string;
  diag?: string;
}

/** What the engine posts for a DSN: the human-readable text and the part. */
function post(messageId: string, textBody: string, blocks: Block[] | null) {
  const deliveryStatus = blocks
    ? [
        'Reporting-MTA: dns; mx.example',
        '',
        ...blocks.flatMap((b) => [
          `Final-Recipient: ${b.rcpt}`,
          ...(b.action ? [`Action: ${b.action}`] : []),
          ...(b.status ? [`Status: ${b.status}`] : []),
          ...(b.diag ? [`Diagnostic-Code: smtp; ${b.diag}`] : []),
          '',
        ]),
      ].join('\r\n')
    : undefined;
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/inbound-email/raw',
    headers: { 'x-inbound-secret': env.INBOUND_EMAIL_SECRET },
    payload: {
      orgId: org,
      from: 'MAILER-DAEMON@mx.example',
      to: encodeVerp(messageId, 'bounce.example.test'),
      subject: 'Undelivered Mail Returned to Sender',
      textBody,
      ...(deliveryStatus ? { deliveryStatus } : {}),
    },
  });
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

async function dsnMeta(messageId: string) {
  return db
    .select({ recipient: emailEvents.recipient, metadata: emailEvents.metadata })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, org),
        eq(emailEvents.messageId, messageId),
        sql`${emailEvents.metadata}->>'source' = 'verp'`,
      ),
    );
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [o] = await db
    .insert(organizations)
    .values({ name: `rfc3464 ${tag}`, slug: `rfc3464-${tag}`, plan: 'pro' })
    .returning({ id: organizations.id });
  org = o!.id;
  const [c] = await db
    .insert(campaigns)
    .values({ orgId: org, name: `rfc3464 ${tag}` })
    .returning({ id: campaigns.id });
  campaignId = c!.id;
}, 120_000);

afterAll(async () => {
  if (org) {
    await db.delete(emailEvents).where(eq(emailEvents.orgId, org));
    await db.delete(suppressions).where(eq(suppressions.orgId, org));
    await db.delete(inboundEmails).where(eq(inboundEmails.orgId, org));
    await db.delete(organizations).where(eq(organizations.id, org));
  }
  await app?.close();
});

describe('a DSN read from its message/delivery-status part', () => {
  it('delayed 4.4.7 with an earlier "550 5.1.1" quoted in the text: a deferral, nothing suppressed', async () => {
    const c = await contact();
    const m = await delivered([c]);
    const res = await post(m, `Delayed. An earlier attempt said: 550 5.1.1 user unknown`, [
      { rcpt: `rfc822; ${c.email}`, action: 'delayed', status: '4.4.7', diag: '451 4.4.7 delayed' },
    ]);
    expect(res.statusCode, res.body).toBe(201);
    expect(await rows(m)).toEqual({ deferred: 1, deliver: 1, send: 1 });
    expect(await suppressedAs(c.email)).toEqual([]);
    expect((await dsnMeta(m))[0]!.metadata).toMatchObject({ dsnSource: 'delivery-status' });
  });

  it('failed 4.4.7 with "policy" in the text: a soft bounce that suppresses', async () => {
    const c = await contact();
    const m = await delivered([c]);
    await post(m, 'Expired. Earlier attempts were deferred by the remote local policy.', [
      { rcpt: `rfc822; ${c.email}`, action: 'failed', status: '4.4.7', diag: '421 4.4.7 expired' },
    ]);
    expect(await rows(m)).toEqual({ 'bounce:soft': 1, deliver: 1, send: 1 });
    expect(await suppressedAs(c.email)).toEqual(['hard_bounce']);
  });

  it('failed 5.1.1: hard, invalid_email; failed 5.7.1 blocked by an RBL: block, nothing suppressed', async () => {
    const hard = await contact();
    const mh = await delivered([hard]);
    await post(mh, 'Failed.', [
      {
        rcpt: `rfc822; ${hard.email}`,
        action: 'failed',
        status: '5.1.1',
        diag: '550 5.1.1 user unknown',
      },
    ]);
    expect(await rows(mh)).toEqual({ 'bounce:hard': 1, deliver: 1, send: 1 });
    expect(await suppressedAs(hard.email)).toEqual(['invalid_email']);

    const block = await contact();
    const mb = await delivered([block]);
    await post(mb, 'Failed.', [
      {
        rcpt: `rfc822; ${block.email}`,
        action: 'failed',
        status: '5.7.1',
        diag: '550 5.7.1 client host blocked using Spamhaus RBL',
      },
    ]);
    expect(await rows(mb)).toEqual({ 'bounce:block': 1, deliver: 1, send: 1 });
    expect(await suppressedAs(block.email)).toEqual([]);
  });

  it('three recipients — one failed, two delayed — are three rows, and only the failed one is suppressed', async () => {
    const [a, b, c] = [await contact(), await contact(), await contact()];
    const m = await delivered([a!, b!, c!]);
    await post(m, 'Report for three recipients.', [
      {
        rcpt: `rfc822; ${a!.email}`,
        action: 'failed',
        status: '5.1.1',
        diag: '550 5.1.1 user unknown',
      },
      { rcpt: `rfc822; ${b!.email}`, action: 'delayed', status: '4.4.7' },
      { rcpt: `rfc822; ${c!.email}`, action: 'delayed', status: '4.4.7' },
    ]);
    expect(await rows(m)).toEqual({ 'bounce:hard': 1, deferred: 2, deliver: 3, send: 3 });
    const byRecipient = Object.fromEntries(
      (await dsnMeta(m)).map((r) => [r.recipient, (r.metadata as { dsnAction: string }).dsnAction]),
    );
    expect(byRecipient).toEqual({
      [a!.email]: 'failed',
      [b!.email]: 'delayed',
      [c!.email]: 'delayed',
    });
    expect(await suppressedAs(a!.email)).toEqual(['invalid_email']);
    expect(await suppressedAs(b!.email)).toEqual([]);
    expect(await suppressedAs(c!.email)).toEqual([]);
  });

  it('a Final-Recipient that is not rfc822 does not break it: the message recipient is used', async () => {
    const c = await contact();
    const m = await delivered([c]);
    const res = await post(m, 'Failed.', [
      { rcpt: 'x400; c=CZ;a= ;p=Example;s=Novak', action: 'failed', status: '5.1.1' },
    ]);
    expect(res.statusCode, res.body).toBe(201);
    expect(await rows(m)).toEqual({ 'bounce:hard': 1, deliver: 1, send: 1 });
    expect(await suppressedAs(c.email)).toEqual(['invalid_email']);
  });

  it('with no message/delivery-status part, the body text decides — and the row says it was a guess', async () => {
    const c = await contact();
    const m = await delivered([c]);
    await post(
      m,
      `I'm sorry to inform you... <${c.email}>: host said: 550 5.1.1 user unknown`,
      null,
    );
    expect(await rows(m)).toEqual({ 'bounce:hard': 1, deliver: 1, send: 1 });
    expect((await dsnMeta(m))[0]!.metadata).toMatchObject({ dsnSource: 'body-text' });
  });

  it('the invariants hold', async () => {
    expect((await checkEventInvariants({ orgId: org })).breaches).toEqual([]);
  });
});
