/**
 * The remaining transactional entry points take the shared path (Z133).
 *
 * Before (measured against master in Z133):
 *  - /messaging/send: an unverified sender domain and a suppressed address were
 *    both queued, recorded, billed and announced (202);
 *  - /transactional/email/batch: no sender check, no suppression check, no
 *    email.sent webhook, no metering;
 *  - /transactional/batch (immediate and scheduled): no send event and no
 *    metering at all — batches were never billed;
 *  - a raw or SMTP message with three recipients on a 1-per-second plan was
 *    refused after queueing the first recipient (429 / 451), so a retry
 *    duplicated it.
 *
 * Decided (CTO, Z133): the per-second send rate counts accepted messages, not
 * recipients; batch routes do not take it at acceptance; every other step of
 * sendTransactionalMessage applies to them. /emails inherits the sender check
 * and keeps its 403.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  apiKeys,
  emailEvents,
  organizations,
  productUsageMeters,
  sendingDomains,
  suppressions,
  webhookDeliveries,
  webhooks,
} from '../db/schema/index.js';
import { dispatchDueBatches, getBatch } from '../services/transactional/scheduled-batch.js';
import { mtaOtherQueue } from '../lib/queues.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const DOMAIN = `path-${tag}.test`;
const FROM = `team@${DOMAIN}`;
const UNVERIFIED = `team@unverified-${tag}.test`;
const SUPPRESSED = `suppressed-${tag}@example.test`;
let org: string;
let key: string;

const addr = (label: string) => `${label}-${tag}@example.test`;

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, headers: { 'x-api-key': key }, payload: payload as never });

/** What requests left behind for these addresses. */
async function footprint(tos: string[]) {
  const [s] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, org),
        eq(emailEvents.eventType, 'send'),
        inArray(sql<string>`${emailEvents.metadata}->>'to'`, tos),
      ),
    );
  const [m] = await db
    .select({ n: sql<number>`coalesce(sum(${productUsageMeters.unitsUsed}), 0)::int` })
    .from(productUsageMeters)
    .where(and(eq(productUsageMeters.orgId, org), eq(productUsageMeters.product, 'email')));
  const [h] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(and(eq(webhooks.orgId, org), eq(webhookDeliveries.event, 'email.sent')));
  return { sends: s!.n, meter: Number(m!.n), sent: h!.n };
}
const settle = () => new Promise((r) => setTimeout(r, 400));
/**
 * The start of a fresh per-second window. The window is the wall-clock second
 * (send-rate.ts: Math.floor(now / 1000)), so waiting a fixed 1.1 s could leave
 * two requests on either side of a boundary.
 */
const nextSecond = () => new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000) + 20));

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  // One message per second: the plan the multi-recipient cases are about.
  const [o] = await db
    .insert(organizations)
    .values({ name: `path ${tag}`, slug: `path-${tag}`, plan: 'pro', settings: { maxSendRate: 1 } })
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
  await db.insert(suppressions).values({ orgId: org, email: SUPPRESSED, reason: 'hard_bounce' });
  await db.insert(webhooks).values({
    orgId: org,
    url: 'https://hooks.example.invalid/z133',
    secret: 'z133',
    events: ['email.sent'],
  });
  key = `fm_live_${randomBytes(24).toString('hex')}`;
  await db.insert(apiKeys).values({
    orgId: org,
    name: `path ${tag}`,
    keyHash: createHash('sha256').update(key).digest('hex'),
    keyPrefix: key.slice(0, 12),
    scopes: [],
    role: 'admin',
  });
}, 120_000);

afterAll(async () => {
  if (org) {
    await db.delete(emailEvents).where(eq(emailEvents.orgId, org));
    await db.delete(organizations).where(eq(organizations.id, org));
  }
  await app?.close();
});

describe('/messaging/send', () => {
  const send = (to: string, from: string) =>
    post('/api/v1/messaging/send', {
      channel: 'email',
      payload: { to, from, subject: 's', html: '<p>x</p>' },
    });

  it('unverified sender: 422, nothing written; suppressed: rejected, nothing written; verified: as before', async () => {
    await nextSecond();
    const u = addr('msg-u');
    const before = await footprint([u, SUPPRESSED]);
    const refused = await send(u, UNVERIFIED);
    const rejected = await send(SUPPRESSED, FROM);
    await settle();
    expect(refused.statusCode).toBe(422);
    expect(refused.json().code).toBe('SENDER_DOMAIN_NOT_VERIFIED');
    expect(rejected.statusCode).toBe(202);
    expect(rejected.json().data).toEqual({
      channel: 'email',
      status: 'rejected',
      reason: 'suppressed:hard_bounce',
    });
    expect(await footprint([u, SUPPRESSED])).toEqual(before);

    await nextSecond();
    const v = addr('msg-v');
    const b2 = await footprint([v]);
    const ok = await send(v, FROM);
    await settle();
    expect(ok.statusCode).toBe(202);
    expect(Object.keys(ok.json().data).sort()).toEqual(['channel', 'messageId', 'status']);
    expect(await footprint([v])).toEqual({
      sends: b2.sends + 1,
      meter: b2.meter + 1,
      sent: b2.sent + 1,
    });
  });
});

describe('/transactional/email/batch', () => {
  const batch = (from: string, tos: string[]) =>
    post('/api/v1/transactional/email/batch', {
      from,
      subject: 's',
      html: '<p>Hi {{name}}</p>',
      recipients: tos.map((email) => ({ email, mergeVars: { name: 'Z' } })),
    });

  it('unverified sender: 422 and nothing written', async () => {
    const tos = [addr('eb-u0'), addr('eb-u1')];
    const before = await footprint(tos);
    const res = await batch(UNVERIFIED, tos);
    await settle();
    expect(res.statusCode).toBe(422);
    expect(await footprint(tos)).toEqual(before);
  });

  it('every message billed and announced, the suppressed one rejected, no per-second limit', async () => {
    const tos = [addr('eb-0'), addr('eb-1'), addr('eb-2')];
    const before = await footprint([...tos, SUPPRESSED]);
    const res = await batch(FROM, [...tos, SUPPRESSED]);
    await settle();
    console.log(`[z133] email/batch: ${res.statusCode} ${res.body.slice(0, 300)}`);
    expect(res.statusCode).toBe(202);
    expect(res.json().data.queued).toBe(3);
    expect(res.json().data.results.at(-1)).toEqual({
      email: SUPPRESSED,
      status: 'rejected',
      reason: 'suppressed:hard_bounce',
    });
    // Three messages at one per second: batches do not take the rate.
    expect(await footprint([...tos, SUPPRESSED])).toEqual({
      sends: before.sends + 3,
      meter: before.meter + 3,
      sent: before.sent + 3,
    });
  });
});

describe('/transactional/batch — billed now and when scheduled', () => {
  it('immediate: a send event and a charge per message', async () => {
    const tos = [addr('tb-0'), addr('tb-1')];
    const before = await footprint(tos);
    const res = await post('/api/v1/transactional/batch', {
      from: FROM,
      subject: 's',
      html: '<p>x</p>',
      recipients: tos.map((to) => ({ to })),
    });
    await settle();
    expect(res.statusCode).toBe(202);
    expect(await footprint(tos)).toEqual({
      sends: before.sends + 2,
      meter: before.meter + 2,
      sent: before.sent + 2,
    });
  });

  it('scheduled: nothing at scheduling; a send event and a charge per message when it fires', async () => {
    const tos = [addr('sb-0'), addr('sb-1')];
    const sendAt = new Date(Date.now() + 60_000);
    const res = await post('/api/v1/transactional/batch', {
      from: FROM,
      subject: 's',
      html: '<p>x</p>',
      recipients: tos.map((to) => ({ to })),
      sendAt: sendAt.toISOString(),
    });
    expect(res.statusCode).toBe(202);
    const batchId = res.json().data.batchId as string;
    const atSchedule = await footprint(tos);
    await dispatchDueBatches(new Date(sendAt.getTime() + 1000));
    await settle();
    const fired = await footprint(tos);
    console.log(
      `[z133] scheduled batch: at schedule ${JSON.stringify(atSchedule)} -> fired ${JSON.stringify(fired)}`,
    );
    expect(atSchedule.sends).toBe(0);
    expect(fired).toEqual({ sends: 2, meter: atSchedule.meter + 2, sent: atSchedule.sent + 2 });
    expect((await getBatch(org, batchId))?.status).toBe('queued');
  });

  it('scheduled, but the sender is no longer verified when it fires: failed with the reason, not retried', async () => {
    const domain = `later-${tag}.test`;
    await db.insert(sendingDomains).values({
      orgId: org,
      domain,
      isVerified: true,
      dkimVerified: true,
      spfVerified: true,
      dmarcVerified: true,
    });
    const tos = [addr('sb-late')];
    const sendAt = new Date(Date.now() + 60_000);
    const res = await post('/api/v1/transactional/batch', {
      from: `team@${domain}`,
      subject: 's',
      html: '<p>x</p>',
      recipients: tos.map((to) => ({ to })),
      sendAt: sendAt.toISOString(),
    });
    const batchId = res.json().data.batchId as string;
    await db
      .delete(sendingDomains)
      .where(and(eq(sendingDomains.orgId, org), eq(sendingDomains.domain, domain)));
    const first = await dispatchDueBatches(new Date(sendAt.getTime() + 1000));
    const second = await dispatchDueBatches(new Date(sendAt.getTime() + 61_000));
    const rec = await getBatch(org, batchId);
    console.log(
      `[z133] stale sender: ${JSON.stringify(first)} then ${JSON.stringify(second)} record=${rec?.status} ${rec?.error}`,
    );
    expect(rec?.status).toBe('failed');
    expect(rec?.error).toMatch(/is not verified/);
    expect((await footprint(tos)).sends).toBe(0);
  });
});

describe('/emails keeps its answers', () => {
  it('unverified sender: 403 FROM_NOT_VERIFIED, as before', async () => {
    const res = await post('/api/v1/emails', {
      from: UNVERIFIED,
      to: addr('em-u'),
      subject: 's',
      html: '<p>x</p>',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FROM_NOT_VERIFIED' });
  });

  it('success: the Resend shape, unchanged', async () => {
    const res = await post('/api/v1/emails', {
      from: FROM,
      to: addr('em-v'),
      subject: 's',
      html: '<p>x</p>',
    });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json()).sort()).toEqual(['created_at', 'from', 'id', 'subject', 'to']);
  });
});

describe('the per-second rate is not taken at acceptance', () => {
  it('/raw: one message to three recipients on a one-per-second plan is queued whole', async () => {
    await nextSecond();
    const tos = [addr('raw-0'), addr('raw-1'), addr('raw-2')];
    const raw = Buffer.from(
      `From: ${FROM}\r\nTo: ${tos.join(', ')}\r\nSubject: s\r\n\r\nbody\r\n`,
    ).toString('base64');
    const before = await footprint(tos);
    const res = await post('/api/v1/transactional/email/raw', { raw });
    await settle();
    console.log(`[z133] raw 3 recipients at 1/s: ${res.statusCode}`);
    expect(res.statusCode).toBe(202);
    expect(res.json().data.messages).toHaveLength(3);
    expect(await footprint(tos)).toEqual({
      sends: before.sends + 3,
      meter: before.meter + 3,
      sent: before.sent + 3,
    });
  });

  it('/raw: a second message in the same second is accepted too — the rate is taken at sending', async () => {
    // Z133 refused this second message with 429 at acceptance. Since Z134 the
    // per-second rate is taken by the MTA worker when the message is sent
    // (workers lib/org-send-rate.ts), which paces instead of refusing; at
    // acceptance both messages are queued, each carrying the org's rate.
    await nextSecond();
    const raw = (to: string) =>
      Buffer.from(`From: ${FROM}\r\nTo: ${to}\r\nSubject: s\r\n\r\nbody\r\n`).toString('base64');
    const first = await post('/api/v1/transactional/email/raw', { raw: raw(addr('rate-1')) });
    await settle();
    const tos = [addr('rate-2a'), addr('rate-2b')];
    const before = await footprint(tos);
    const second = await post('/api/v1/transactional/email/raw', { raw: raw(tos.join(', ')) });
    await settle();
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(await footprint(tos)).toEqual({
      sends: before.sends + 2,
      meter: before.meter + 2,
      sent: before.sent + 2,
    });
    const jobs = (
      await mtaOtherQueue.getJobs(['waiting', 'prioritized', 'delayed'], 0, 5_000)
    ).filter((j) => tos.includes(j?.data?.toEmail));
    expect(jobs.map((j) => j.data.orgSendRate)).toEqual([1, 1]);
  });
});
