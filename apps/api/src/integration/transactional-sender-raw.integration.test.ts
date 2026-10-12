/**
 * POST /transactional/email checks the sender, and /transactional/email/raw
 * takes the same path (Z132).
 *
 * Before (measured in Z131 and again in Z132):
 *  - /transactional/email with an unverified sender domain: 202 queued, a send
 *    event, a charge and an email.sent webhook. SMTP refused the same message.
 *  - /transactional/email/raw had a path of its own (sendRawMessage): a
 *    suppressed address was queued and billed; no send-rate limit, sandbox
 *    gate, configuration set or email.sent webhook.
 *
 * Now the check is in sendTransactionalMessage — the one function both routes
 * and SMTP call — and uses assertFromDomainOwned, the one definition of a
 * verified sender.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  apiKeys,
  configurationSets,
  emailEvents,
  organizations,
  sendingDomains,
  suppressions,
  webhookDeliveries,
  webhooks,
} from '../db/schema/index.js';
import { mtaOtherQueue } from '../lib/queues.js';
import { getProductUsage } from '../services/billing/meters.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const DOMAIN = `sender-${tag}.test`;
const UNVERIFIED = `team@unverified-${tag}.test`;
const SUPPRESSED = `suppressed-${tag}@example.test`;
const orgIds: string[] = [];
const keys: Record<string, string> = {};

/** An organisation of this file's own, in the state a test needs from the start. */
async function makeOrg(label: string, state: { sendingMode?: string } = {}): Promise<string> {
  const [o] = await db
    .insert(organizations)
    .values({
      name: `sender ${label} ${tag}`,
      slug: `sender-${label}-${tag}`,
      plan: 'pro',
      sendingMode: state.sendingMode ?? 'production',
      settings: { maxSendRate: 1000 },
    })
    .returning({ id: organizations.id });
  orgIds.push(o!.id);
  await db.insert(sendingDomains).values({
    orgId: o!.id,
    domain: `${label}-${DOMAIN}`,
    isVerified: true,
    dkimVerified: true,
    spfVerified: true,
    dmarcVerified: true,
  });
  await db.insert(webhooks).values({
    orgId: o!.id,
    url: 'https://hooks.example.invalid/z132',
    secret: 'z132',
    events: ['email.sent'],
  });
  const raw = `fm_live_${randomBytes(24).toString('hex')}`;
  await db.insert(apiKeys).values({
    orgId: o!.id,
    name: `sender ${label} ${tag}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    role: 'admin',
  });
  keys[o!.id] = raw;
  return o!.id;
}
const fromOf = (label: string) => `team@${label}-${DOMAIN}`;

let org: string;
let sandboxOrg: string;

const post = (orgId: string, url: string, payload: unknown) =>
  app.inject({
    method: 'POST',
    url,
    headers: { 'x-api-key': keys[orgId]! },
    payload: payload as never,
  });

const rawOf = (from: string, to: string, extra = '') =>
  Buffer.from(`${extra}From: ${from}\r\nTo: ${to}\r\nSubject: Z132\r\n\r\nbody\r\n`).toString(
    'base64',
  );

/** What a request left behind: send events to `to`, the meter, email.sent deliveries. */
async function footprint(orgId: string, to: string) {
  const [s] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.eventType, 'send'),
        sql`${emailEvents.metadata}->>'to' = ${to}`,
      ),
    );
  // The invoice basis for email: the plan send counter since Z137 (meters.ts).
  const m = { n: (await getProductUsage(orgId, 'email')).unitsUsed };
  const [h] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(and(eq(webhooks.orgId, orgId), eq(webhookDeliveries.event, 'email.sent')));
  return { sends: s!.n, meter: Number(m!.n), sent: h!.n };
}

/** Metering and webhooks are fire-and-forget after the reply. */
const settle = () => new Promise((r) => setTimeout(r, 400));

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  org = await makeOrg('main');
  sandboxOrg = await makeOrg('sandbox', { sendingMode: 'sandbox' });
  await db.insert(suppressions).values({ orgId: org, email: SUPPRESSED, reason: 'hard_bounce' });
  await db.insert(configurationSets).values({
    orgId: org,
    name: `paused-${tag}`,
    sendingEnabled: false,
    options: {
      trackingEnabled: true,
      tlsPolicy: 'optional',
      suppressionEnabled: true,
      reputationTracking: true,
      eventDestinations: [],
    },
  } as never);
}, 120_000);

afterAll(async () => {
  if (orgIds.length) {
    await db.delete(emailEvents).where(inArray(emailEvents.orgId, orgIds));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('POST /transactional/email checks the sender', () => {
  it('an unverified sender domain: 422 naming the domain; no send event, no charge, no webhook', async () => {
    const to = `te-unverified-${tag}@example.test`;
    const before = await footprint(org, to);
    const res = await post(org, '/api/v1/transactional/email', {
      to,
      from: UNVERIFIED,
      subject: 's',
      html: '<p>x</p>',
    });
    await settle();
    const after = await footprint(org, to);
    console.log(
      `[z132] te unverified: ${res.statusCode} ${res.body} | ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    );
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      code: 'SENDER_DOMAIN_NOT_VERIFIED',
      details: { domain: `unverified-${tag}.test`, from: UNVERIFIED },
    });
    expect(res.json().message).toContain(
      `The sender domain unverified-${tag}.test is not verified`,
    );
    expect(res.json().message).toContain('Sending Domains');
    expect(after).toEqual(before);
  });

  it('a verified sender domain: as before, 202 queued, one send, one charge, one webhook', async () => {
    const to = `te-verified-${tag}@example.test`;
    const before = await footprint(org, to);
    const res = await post(org, '/api/v1/transactional/email', {
      to,
      from: fromOf('main'),
      subject: 's',
      html: '<p>x</p>',
    });
    await settle();
    expect(res.statusCode).toBe(202);
    expect(res.json().data).toMatchObject({ status: 'queued', attachments: 0 });
    expect(await footprint(org, to)).toEqual({
      sends: before.sends + 1,
      meter: before.meter + 1,
      sent: before.sent + 1,
    });
  });
});

describe('POST /transactional/email/raw takes the same path', () => {
  const raw = (orgId: string, from: string, to: string, extra = '') =>
    post(orgId, '/api/v1/transactional/email/raw', { raw: rawOf(from, to, extra) });

  it('an unverified sender domain: the same 422, nothing written', async () => {
    const to = `raw-unverified-${tag}@example.test`;
    const before = await footprint(org, to);
    const res = await raw(org, UNVERIFIED, to);
    await settle();
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('SENDER_DOMAIN_NOT_VERIFIED');
    expect(await footprint(org, to)).toEqual(before);
  });

  it('a suppressed address: refused, not queued, not recorded, not billed', async () => {
    const before = await footprint(org, SUPPRESSED);
    const res = await raw(org, fromOf('main'), SUPPRESSED);
    await settle();
    console.log(`[z132] raw suppressed: ${res.statusCode} ${res.body}`);
    expect(res.statusCode).toBe(202);
    expect(res.json().data).toEqual({
      status: 'queued',
      messages: [],
      rejected: [{ to: SUPPRESSED, reason: 'suppressed:hard_bounce' }],
    });
    expect(await footprint(org, SUPPRESSED)).toEqual(before);
  });

  it('an ordinary address: the send rate counted, the email.sent webhook, one charge', async () => {
    const to = `raw-ok-${tag}@example.test`;
    const before = await footprint(org, to);
    const res = await raw(org, fromOf('main'), to);
    // The send rate travels on the queued job since Z134: the MTA worker takes it
    // when the message is sent. This asserted the acceptance-time counter
    // (sendrate:<org>:<second>) that no longer exists.
    const rated = (await mtaOtherQueue.getJobs(['waiting', 'prioritized', 'delayed'], 0, 5_000))
      .filter((j) => j?.data?.toEmail === to)
      .map((j) => j.data.orgSendRate);
    await settle();
    const after = await footprint(org, to);
    console.log(
      `[z132] raw ordinary: ${res.statusCode} orgSendRate=${JSON.stringify(rated)} ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    );
    expect(res.statusCode).toBe(202);
    expect(rated).toEqual([1000]);
    expect(after).toEqual({
      sends: before.sends + 1,
      meter: before.meter + 1,
      sent: before.sent + 1,
    });
  });

  it('the sandbox gate and a paused configuration set apply', async () => {
    const sandbox = await raw(sandboxOrg, fromOf('sandbox'), `raw-sbx-${tag}@example.test`);
    const paused = await raw(
      org,
      fromOf('main'),
      `raw-cfg-${tag}@example.test`,
      `X-Configuration-Set: paused-${tag}\r\n`,
    );
    console.log(
      `[z132] raw sandbox=${sandbox.statusCode} ${sandbox.body} paused=${paused.statusCode} ${paused.body}`,
    );
    expect(sandbox.statusCode).toBe(403);
    expect(sandbox.json().message).toMatch(/sandbox mode/);
    expect(paused.statusCode).toBe(403);
    expect(paused.json().message).toMatch(/sending is paused/);
  });
});
