/**
 * SMTP submission takes the path POST /transactional/email takes (Z131).
 *
 * Before: the relay had a path of its own (sendRawMessage). Measured in Z129:
 * a suppressed recipient got 250, was queued, recorded as sent and billed; no
 * send-rate limit, no sandbox gate, no configuration set, no `sent` webhook;
 * and every refusal — an unverified From, a used-up plan — went to the client
 * as 451, so it retried for days.
 *
 * Driven here the way the Go submission server drives it: POST
 * /internal/smtp/rcpt for each RCPT TO, POST /internal/smtp/relay at DATA.
 * The Go side (that it answers with the reply it is given) is in
 * apps/engine/internal/submission/server_test.go.
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
  productUsageMeters,
  sendingDomains,
  suppressions,
  webhookDeliveries,
  webhooks,
} from '../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const DOMAIN = `smtp-${tag}.test`;
const FROM = `team@main-${DOMAIN}`;
const SUPPRESSED = `suppressed-${tag}@example.test`;
const orgIds: string[] = [];
let org: string;
let planOrg: string;
let sandboxOrg: string;
let rateOrg: string;
let key: string;

const secret = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };

/**
 * An organisation of this file's own, in the state a test needs from the
 * start, with its own verified sending domain `<label>-<DOMAIN>`. Never an
 * UPDATE of organizations: integration files may not write that table
 * (workers/src/lib/seed-org-read-only.test.ts).
 */
async function makeOrg(
  label: string,
  state: { plan?: 'free' | 'pro'; sendingMode?: string; maxSendRate?: number } = {},
): Promise<string> {
  const [o] = await db
    .insert(organizations)
    .values({
      name: `smtp ${label} ${tag}`,
      slug: `smtp-${label}-${tag}`,
      plan: state.plan ?? 'pro',
      sendingMode: state.sendingMode ?? 'production',
      settings: { maxSendRate: state.maxSendRate ?? 1000 },
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
  return o!.id;
}
const fromOf = (label: string) => `team@${label}-${DOMAIN}`;

const rcpt = (orgId: string, address: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/internal/smtp/rcpt',
    headers: secret,
    payload: { orgId, rcpt: address },
  });

function relay(
  orgId: string,
  opts: { from?: string; to: string[]; headers?: Record<string, string> },
) {
  const from = opts.from ?? FROM;
  const extra = Object.entries(opts.headers ?? {})
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join('');
  const raw = `${extra}From: ${from}\r\nTo: ${opts.to.join(', ')}\r\nSubject: Z131\r\n\r\nbody\r\n`;
  return app.inject({
    method: 'POST',
    url: '/api/v1/internal/smtp/relay',
    headers: secret,
    payload: { orgId, raw: Buffer.from(raw).toString('base64'), mailFrom: from, rcptTo: opts.to },
  });
}

const sendsTo = async (orgId: string, to: string) =>
  db
    .select({ messageId: emailEvents.messageId, metadata: emailEvents.metadata })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.eventType, 'send'),
        sql`${emailEvents.metadata}->>'to' = ${to}`,
      ),
    );

const meter = async (orgId: string) =>
  Number(
    (
      await db
        .select({ n: sql<number>`coalesce(sum(${productUsageMeters.unitsUsed}), 0)` })
        .from(productUsageMeters)
        .where(and(eq(productUsageMeters.orgId, orgId), eq(productUsageMeters.product, 'email')))
    )[0]!.n,
  );

const sentDeliveries = async (orgId: string) =>
  (
    await db
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .where(and(eq(webhooks.orgId, orgId), eq(webhookDeliveries.event, 'email.sent')))
  ).length;

/** Metering is fire-and-forget after the reply; give it a moment. */
const settle = () => new Promise((r) => setTimeout(r, 400));

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  org = await makeOrg('main');
  planOrg = await makeOrg('plan', { plan: 'free' });
  sandboxOrg = await makeOrg('sandbox', { sendingMode: 'sandbox' });
  rateOrg = await makeOrg('rate', { maxSendRate: 1 });
  await db.insert(suppressions).values({ orgId: org, email: SUPPRESSED, reason: 'hard_bounce' });
  await db.insert(webhooks).values({
    orgId: org,
    url: 'https://hooks.example.invalid/z131',
    secret: 'z131',
    events: ['email.sent'],
  });
  // The free plan's 2500 sends this month, used up.
  await db.execute(sql`
    INSERT INTO email_events (org_id, event_type, message_id, metadata)
    SELECT ${planOrg}, 'send', '<fill-' || g || '>', '{}'::jsonb FROM generate_series(1, 2500) g
  `);
  key = `fm_live_${randomBytes(24).toString('hex')}`;
  await db.insert(apiKeys).values({
    orgId: org,
    name: `smtp ${tag}`,
    keyHash: createHash('sha256').update(key).digest('hex'),
    keyPrefix: key.slice(0, 12),
    scopes: [],
    role: 'admin',
  });
}, 120_000);

afterAll(async () => {
  if (orgIds.length) {
    await db.delete(emailEvents).where(inArray(emailEvents.orgId, orgIds));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('RCPT TO', () => {
  it('a suppressed address is refused with a permanent 550 and its reason; nothing sent, nothing billed', async () => {
    const before = await meter(org);
    const res = await rcpt(org, SUPPRESSED);
    await settle();
    console.log(`[z131] rcpt suppressed: ${res.statusCode} ${res.body}`);
    expect(res.json().data).toEqual({
      accept: false,
      smtp: {
        code: 550,
        enhanced: '5.7.1',
        text: `Recipient <${SUPPRESSED}> is on this account's suppression list (hard_bounce); not sent, not billed`,
      },
    });
    expect(await sendsTo(org, SUPPRESSED)).toEqual([]);
    expect(await meter(org)).toBe(before);
  });

  it('any other address is accepted', async () => {
    expect((await rcpt(org, `ok-${tag}@example.test`)).json().data).toEqual({ accept: true });
  });
});

describe('DATA: the transactional path', () => {
  it('an ordinary message: queued, the send event the HTTP route writes, the send rate counted, the `sent` webhook, billed once', async () => {
    const to = `ok-${tag}@example.test`;
    const [m0, d0] = [await meter(org), await sentDeliveries(org)];
    const res = await relay(org, { to: [to] });
    const rateKeys = await redis.keys(`sendrate:${org}:*`);
    await settle();
    const events = await sendsTo(org, to);
    console.log(
      `[z131] relay ordinary: ${res.statusCode} rate keys=${rateKeys.length} send=${JSON.stringify(events[0]?.metadata)}`,
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(events).toHaveLength(1);
    // The HTTP route's event shape, plus where it came from.
    expect(events[0]!.metadata).toMatchObject({
      to,
      transactional: true,
      sandbox: false,
      tags: [],
      configurationSet: null,
      via: 'smtp',
      raw: true,
    });
    expect(rateKeys.length).toBeGreaterThan(0);
    expect(await sentDeliveries(org)).toBe(d0 + 1);
    expect(await meter(org)).toBe(m0 + 1);
  });

  it('a recipient suppressed between RCPT and DATA is not queued, not recorded, not billed', async () => {
    const late = `late-${tag}@example.test`;
    await db.insert(suppressions).values({ orgId: org, email: late, reason: 'complaint' });
    const m0 = await meter(org);
    const res = await relay(org, { to: [late] });
    await settle();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.rejected).toEqual([{ to: late, reason: 'suppressed:complaint' }]);
    expect(await sendsTo(org, late)).toEqual([]);
    expect(await meter(org)).toBe(m0);
  });

  it('refusals that will not change are 550: unverified From, used-up plan, sandbox, paused configuration set', async () => {
    const results: string[] = [];
    const unverified = await relay(org, {
      from: `team@unverified-${tag}.test`,
      to: [`a-${tag}@example.test`],
    });
    const plan = await relay(planOrg, { from: fromOf('plan'), to: [`b-${tag}@example.test`] });
    const sandbox = await relay(sandboxOrg, {
      from: fromOf('sandbox'),
      to: [`c-${tag}@example.test`],
    });
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
    const paused = await relay(org, {
      to: [`d-${tag}@example.test`],
      headers: { 'X-Configuration-Set': `paused-${tag}` },
    });
    for (const [label, res, text] of [
      ['unverified From', unverified, /not a verified sender/],
      ['plan used up', plan, /send limit reached/],
      ['sandbox', sandbox, /sandbox mode/],
      ['paused configuration set', paused, /sending is paused/],
    ] as const) {
      results.push(`${label}=${res.statusCode} ${JSON.stringify(res.json().smtp)}`);
      expect(res.statusCode, label).toBe(422);
      expect(res.json().smtp.code, label).toBe(550);
      expect(res.json().smtp.text, label).toMatch(text);
    }
    console.log(`[z131] permanent refusals: ${results.join(' | ')}`);
  });

  it('the send-rate limit stays temporary: 451 4.7.0', async () => {
    // Two recipients in one second against a limit of one per second.
    const res = await relay(rateOrg, {
      from: fromOf('rate'),
      to: [`r1-${tag}@example.test`, `r2-${tag}@example.test`],
    });
    console.log(`[z131] rate limit: ${res.statusCode} ${res.body}`);
    expect(res.statusCode).toBe(503);
    expect(res.json().smtp).toMatchObject({ code: 451, enhanced: '4.7.0' });
  });
});

describe('POST /transactional/email answers as it did', () => {
  const send = (body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/transactional/email',
      headers: { 'x-api-key': key },
      payload: body,
    });

  it('ordinary: 202 queued, one send event, billed once; suppressed: 202 rejected, nothing; unknown template: 400', async () => {
    const to = `http-${tag}@example.test`;
    const m0 = await meter(org);
    const ok = await send({ to, from: FROM, subject: 's', html: '<p>x</p>' });
    await settle();
    const m1 = await meter(org);
    const rejected = await send({ to: SUPPRESSED, from: FROM, subject: 's', html: '<p>x</p>' });
    await settle();
    const tpl = await send({ to, from: FROM, templateId: randomUUID() });
    console.log(
      `[z131] http: ok=${ok.statusCode} ${ok.body} rejected=${rejected.statusCode} ${rejected.body} template=${tpl.statusCode} ${tpl.body.slice(0, 80)}`,
    );
    expect(ok.statusCode).toBe(202);
    expect(Object.keys(ok.json().data).sort()).toEqual(['attachments', 'messageId', 'status']);
    expect(ok.json().data).toMatchObject({ status: 'queued', attachments: 0 });
    expect(await sendsTo(org, to)).toHaveLength(1);
    expect(m1).toBe(m0 + 1);
    expect(rejected.statusCode).toBe(202);
    expect(rejected.json()).toEqual({
      data: { status: 'rejected', reason: 'suppressed:hard_bounce' },
    });
    expect(await meter(org)).toBe(m1);
    expect(tpl.statusCode).toBe(400);
    expect(tpl.json().code).toBe('RENDERING_FAILED');
  });
});

describe('SMTP credentials advertise what the engine opens', () => {
  it('one port from SUBMISSION_LISTEN, none when it is unset', async () => {
    // Issued through the route, as a member does; a session is not needed for
    // what is measured here, so the key's admin role stands in.
    const issue = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/smtp-credentials',
        headers: { 'x-api-key': key },
        payload: { label: tag },
      });
    const saved = process.env.SUBMISSION_LISTEN;
    try {
      process.env.SUBMISSION_LISTEN = '0.0.0.0:2587';
      const on = await issue();
      delete process.env.SUBMISSION_LISTEN;
      const off = await issue();
      console.log(
        `[z131] ports: listen=0.0.0.0:2587 -> ${JSON.stringify(on.json().data.ports)}, unset -> ${JSON.stringify(off.json().data.ports)}`,
      );
      expect(on.json().data.ports).toEqual([2587]);
      expect(off.json().data.ports).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.SUBMISSION_LISTEN;
      else process.env.SUBMISSION_LISTEN = saved;
    }
  });
});
