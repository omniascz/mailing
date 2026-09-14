/**
 * The SMS provider webhooks accepted anything.
 *
 * routes/v1/sms.ts exposes four public endpoints with no authentication of any
 * kind — no preHandler, no signature check, no kill switch, registered CORE
 * (index.ts:470). Anyone who knew a URL could:
 *
 *   - post an inbound SMS with body STOP and revoke a contact's SMS consent in
 *     the organisation that owns the number (services/sms/inbound.ts:67),
 *   - post a status callback and flip any message in sms_send_log to delivered
 *     or failed, because updateSmsDeliveryStatus matches on providerMessageId
 *     alone (services/sms/routing.ts:325-332).
 *
 * Twilio does sign its requests, and the way it does is specific: the HMAC-SHA1
 * is over the full URL plus the POST parameters sorted and concatenated, not
 * over the body. <https://www.twilio.com/docs/usage/security>
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A 403 with an unchanged database is also what a broken route looks like, so
 * every refusal here is followed by a correctly signed request that must be
 * accepted and must write. The signed cases are what would fail if the
 * canonical string were built wrong — which is the real risk in this change.
 *
 * Two cases are NOT here: an unset Auth Token and an unset API_PUBLIC_URL.
 * config/env.ts parses once at import time, so a running
 * app cannot be made to forget them; those live in the unit test beside the
 * route, which re-imports the module per case.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations } from '../db/schema/index.js';
import { phoneNumbers } from '../db/schema/phone-numbers.js';
import { smsInbound, smsSendLog } from '../db/schema/sms.js';

const tag = randomUUID().slice(0, 6);

/**
 * Set BEFORE the imports run. config/env.ts parses process.env once, at import
 * time, so a value assigned in beforeAll would arrive too late — the route
 * would see an unset Auth Token and refuse everything. vi.hoisted is the only
 * hook that runs early enough.
 */
const { AUTH_TOKEN, PUBLIC_BASE } = vi.hoisted(() => {
  const token = 'itest-twilio-auth-token';
  const base = 'https://api.itest.invalid';
  process.env.TWILIO_AUTH_TOKEN = token;
  process.env.API_PUBLIC_URL = base;
  return { AUTH_TOKEN: token, PUBLIC_BASE: base };
});

const NUMBER = `+42077800${tag.slice(0, 4)}`;
const from = (what: string) => `+4207${what}${tag.slice(0, 3)}`;

const SID_UNSIGNED = `SMu${tag}`;
const SID_SIGNED = `SMs${tag}`;
const SID_FORGED = `SMf${tag}`;

let app: FastifyInstance;
let orgId: string;

const INBOUND_PATH = '/api/v1/sms/webhooks/twilio/inbound';
const STATUS_PATH = '/api/v1/sms/webhooks/twilio/status';

/** `sign` picks the key: the real token, a wrong one, or no header at all. */
const post = async (path: string, params: Record<string, string>, sign?: string) => {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (sign !== undefined) {
    const canonical = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], `${PUBLIC_BASE}${path}`);
    headers['x-twilio-signature'] = createHmac('sha1', sign).update(canonical).digest('base64');
  }
  const res = await app.inject({
    method: 'POST',
    url: path,
    headers,
    payload: new URLSearchParams(params).toString(),
  });
  return { statusCode: res.statusCode, body: res.body };
};

const inboundParams = (messageSid: string, fromPhone: string, body: string) => ({
  MessageSid: messageSid,
  From: fromPhone,
  To: NUMBER,
  Body: body,
});

const statusParams = (messageSid: string, status: string) => ({
  MessageSid: messageSid,
  MessageStatus: status,
});

const inboundRowsFor = async (fromPhone: string) =>
  db.select().from(smsInbound).where(eq(smsInbound.fromPhone, fromPhone));

const sendLogFor = async (providerMessageId: string) =>
  db.select().from(smsSendLog).where(eq(smsSendLog.providerMessageId, providerMessageId));

async function waitForInbound(fromPhone: string, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = (await inboundRowsFor(fromPhone)) as Array<{ [k: string]: unknown }>;
    if (rows.length > 0) return rows;
    if (Date.now() > deadline) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A queued outbound message the status callback can try to flip. */
async function seedSendLog(providerMessageId: string): Promise<void> {
  await db.insert(smsSendLog).values({
    orgId,
    provider: 'twilio',
    providerMessageId,
    phone: from('99'),
    status: 'queued',
    segments: 1,
  });
}

const prev = {
  unsigned: process.env.ALLOW_UNSIGNED_WEBHOOKS,
  defaultOrg: process.env.DEFAULT_ORG_ID,
};

beforeAll(async () => {
  delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
  // Nothing here may be attributed to a fallback organisation.
  delete process.env.DEFAULT_ORG_ID;

  const [org] = await db
    .insert(organizations)
    .values({ name: 'sms sig', slug: `sms-sig-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  // #183: the inbound route resolves the org from the To number, so the number
  // has to belong to somebody for the accepted cases to write anything.
  await db
    .insert(phoneNumbers)
    .values({ orgId, number: NUMBER, provider: 'twilio', status: 'active' });

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();
}, 120_000);

afterAll(async () => {
  if (orgId) {
    await db.delete(smsInbound).where(eq(smsInbound.orgId, orgId));
    await db.delete(smsSendLog).where(eq(smsSendLog.orgId, orgId));
    await db.delete(phoneNumbers).where(eq(phoneNumbers.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  for (const [k, v] of Object.entries({
    ALLOW_UNSIGNED_WEBHOOKS: prev.unsigned,
    DEFAULT_ORG_ID: prev.defaultOrg,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

describe('the Twilio inbound webhook verifies the signature', () => {
  it('an unsigned STOP does not revoke anything and stores nothing', async () => {
    const who = from('11');
    const res = await post(INBOUND_PATH, inboundParams(SID_UNSIGNED, who, 'STOP'));
    expect(res.statusCode, `body: ${res.body}`).toBe(403);

    expect(
      await waitForInbound(who, 1500),
      'an unsigned request reached processInboundSms',
    ).toHaveLength(0);
  });

  it('a signature made with the wrong token is refused', async () => {
    const who = from('22');
    const res = await post(INBOUND_PATH, inboundParams(SID_FORGED, who, 'STOP'), 'wrong-token');
    expect(res.statusCode, `body: ${res.body}`).toBe(403);
    expect(await waitForInbound(who, 1500)).toHaveLength(0);
  });

  it('a correctly signed message is accepted and stored', async () => {
    // The case that must write — and the one that fails if the canonical string
    // is built differently from the way Twilio builds it.
    const who = from('33');
    const res = await post(
      INBOUND_PATH,
      inboundParams(SID_SIGNED, who, 'mate to skladem?'),
      AUTH_TOKEN,
    );
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const rows = await waitForInbound(who);
    expect(rows, 'the handler never reached the sms_inbound insert').toHaveLength(1);
    expect(rows[0]!.orgId).toBe(orgId);
    expect(rows[0]!.fromPhone).toBe(who);
    expect(rows[0]!.toPhone).toBe(NUMBER);
    expect(rows[0]!.body).toBe('mate to skladem?');
  });
});

describe('the Twilio status callback verifies the signature', () => {
  it('an unsigned callback does not change a message status', async () => {
    const sid = `SMst1${tag}`;
    await seedSendLog(sid);

    const res = await post(STATUS_PATH, statusParams(sid, 'delivered'));
    expect(res.statusCode, `body: ${res.body}`).toBe(403);

    const rows = await sendLogFor(sid);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status, 'an unsigned callback flipped the message status').toBe('queued');
    expect(rows[0]!.deliveredAt).toBeNull();
  });

  it('a correctly signed callback still updates the message', async () => {
    // The case that must write.
    const sid = `SMst2${tag}`;
    await seedSendLog(sid);

    const res = await post(STATUS_PATH, statusParams(sid, 'delivered'), AUTH_TOKEN);
    expect(res.statusCode, `body: ${res.body}`).toBe(204);

    const rows = await sendLogFor(sid);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('delivered');
    expect(rows[0]!.deliveredAt).not.toBeNull();
  });
});
