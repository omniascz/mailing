/**
 * Whose organisation an inbound SMS belongs to.
 *
 *     // Need orgId — derive from the To number (our number) registered in env
 *     // In a real multi-tenant setup this would look up orgId from the inbound
 *     // To number
 *     const orgId = process.env.DEFAULT_ORG_ID ?? '';
 *
 * routes/v1/sms.ts said what it should have done and then did not do it. Every
 * inbound SMS to every provisioned number was processed as if it belonged to
 * one organisation — whichever DEFAULT_ORG_ID names.
 *
 * That is not only a misfiled row. processInboundSms (services/sms/inbound.ts)
 * writes sms_inbound, and before that it acts on keywords: STOP revokes SMS
 * consent for the sender's number in that organisation (:67), START records it
 * (:71), anything else fires an `sms_reply` workflow event (:84). So a stranger
 * texting STOP to somebody else's number could revoke a consent record in the
 * organisation the variable happened to name.
 *
 * The number is in the payload — Twilio sends `To` — and the table to look it
 * up in is phone_numbers, written by POST /api/v1/phone/numbers when a customer
 * provisions the number (routes/v1/phone/numbers.ts:92). Its unique key is
 * (org_id, number), which is per organisation, so the lookup asks for two rows
 * and writes only when exactly one comes back.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * This endpoint answers 200 with TwiML whatever happens, before and after, so
 * "nothing in the wrong organisation" is also what a dead handler looks like.
 * Each refusal case is therefore followed by one that must write, and the case
 * that matters asserts the row field by field in the organisation that owns the
 * number.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations } from '../db/schema/index.js';
import { phoneNumbers } from '../db/schema/phone-numbers.js';
import { smsInbound } from '../db/schema/sms.js';

const tag = randomUUID().slice(0, 6);

/** Provisioned by the owner org. */
const NUMBER_OWNED = `+42077700${tag.slice(0, 4)}`;
/** Provisioned by the owner org and then released. */
const NUMBER_RELEASED = `+42077701${tag.slice(0, 4)}`;
/** Nobody's. */
const NUMBER_UNKNOWN = `+42077709${tag.slice(0, 4)}`;

const from = (what: string) => `+4206${what}${tag.slice(0, 3)}`;
const FROM_OWNED = from('11');
const FROM_UNKNOWN = from('22');
const FROM_RELEASED = from('33');

let app: FastifyInstance;
/** The organisation DEFAULT_ORG_ID names — the one that used to collect everything. */
let fallbackOrg: string;
/** The organisation that provisioned the number. */
let ownerOrg: string;

const inboundFor = async (fromPhone: string) =>
  db.select().from(smsInbound).where(eq(smsInbound.fromPhone, fromPhone));

const allInboundOf = async (orgId: string) =>
  db.select({ id: smsInbound.id }).from(smsInbound).where(eq(smsInbound.orgId, orgId));

/** The write is awaited inside the handler, but the read is cheap to retry. */
async function waitForInbound(
  fromPhone: string,
  timeoutMs = 3000,
): Promise<Array<{ [k: string]: unknown }>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = (await inboundFor(fromPhone)) as Array<{ [k: string]: unknown }>;
    if (rows.length > 0) return rows;
    if (Date.now() > deadline) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Twilio posts application/x-www-form-urlencoded; @fastify/formbody parses it. */
const post = async (toNumber: string, fromNumber: string, body: string) => {
  const payload = new URLSearchParams({
    MessageSid: `SM${tag}${fromNumber.slice(-4)}`,
    From: fromNumber,
    To: toNumber,
    Body: body,
  }).toString();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/sms/webhooks/twilio/inbound',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload,
  });
  return { statusCode: res.statusCode, body: res.body };
};

const prevDefaultOrg = process.env.DEFAULT_ORG_ID;

beforeAll(async () => {
  const [fb] = await db
    .insert(organizations)
    .values({ name: 'sms fallback', slug: `sms-fb-${tag}` })
    .returning({ id: organizations.id });
  fallbackOrg = fb!.id;

  const [own] = await db
    .insert(organizations)
    .values({ name: 'sms owner', slug: `sms-own-${tag}` })
    .returning({ id: organizations.id });
  ownerOrg = own!.id;

  // The single-tenant leftover, pointed at the organisation that owns no
  // number — which is what it becomes the moment a second tenant exists.
  process.env.DEFAULT_ORG_ID = fallbackOrg;

  await db.insert(phoneNumbers).values([
    { orgId: ownerOrg, number: NUMBER_OWNED, provider: 'twilio', status: 'active' },
    { orgId: ownerOrg, number: NUMBER_RELEASED, provider: 'twilio', status: 'released' },
  ]);

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();
}, 120_000);

afterAll(async () => {
  for (const orgId of [fallbackOrg, ownerOrg]) {
    if (!orgId) continue;
    await db.delete(smsInbound).where(eq(smsInbound.orgId, orgId));
    await db.delete(phoneNumbers).where(eq(phoneNumbers.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  if (prevDefaultOrg === undefined) delete process.env.DEFAULT_ORG_ID;
  else process.env.DEFAULT_ORG_ID = prevDefaultOrg;
  await app?.close();
}, 120_000);

describe('an inbound SMS belongs to the org that provisioned the number it came to', () => {
  it('the message is stored for the owner organisation, not for DEFAULT_ORG_ID', async () => {
    const fallbackBefore = await allInboundOf(fallbackOrg);

    const res = await post(NUMBER_OWNED, FROM_OWNED, 'mate to skladem?');
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const rows = await waitForInbound(FROM_OWNED);
    expect(rows, 'the handler never reached the sms_inbound insert').toHaveLength(1);
    expect(rows[0]!.orgId, 'the message was stored for the wrong organisation').toBe(ownerOrg);
    expect(rows[0]!.provider).toBe('twilio');
    expect(rows[0]!.fromPhone).toBe(FROM_OWNED);
    expect(rows[0]!.toPhone).toBe(NUMBER_OWNED);
    expect(rows[0]!.body).toBe('mate to skladem?');
    expect(rows[0]!.keywordAction).toBe('workflow');

    // And the organisation the env variable names is exactly as it was.
    expect(
      await db
        .select()
        .from(smsInbound)
        .where(and(eq(smsInbound.orgId, fallbackOrg), eq(smsInbound.fromPhone, FROM_OWNED))),
    ).toHaveLength(0);
    expect((await allInboundOf(fallbackOrg)).map((r) => r.id).sort()).toEqual(
      fallbackBefore.map((r) => r.id).sort(),
    );
  });

  it('a number nobody provisioned stores nothing, and the answer is still TwiML', async () => {
    const fallbackBefore = await allInboundOf(fallbackOrg);
    const ownerBefore = await allInboundOf(ownerOrg);

    const res = await post(NUMBER_UNKNOWN, FROM_UNKNOWN, 'haló?');
    // Still 200 with an empty TwiML document: Twilio retries and surfaces
    // errors on anything else, and the caller is not at fault for our
    // configuration.
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    expect(res.body).toContain('<Response/>');

    expect(
      await waitForInbound(FROM_UNKNOWN, 1500),
      'a stranger’s SMS was stored under DEFAULT_ORG_ID',
    ).toHaveLength(0);
    expect((await allInboundOf(fallbackOrg)).map((r) => r.id).sort()).toEqual(
      fallbackBefore.map((r) => r.id).sort(),
    );
    expect((await allInboundOf(ownerOrg)).map((r) => r.id).sort()).toEqual(
      ownerBefore.map((r) => r.id).sort(),
    );
  });

  it('a released number is treated as nobody’s', async () => {
    // Releasing a number gives it back to the provider (numbers.ts:162 sets
    // status 'released'), and the listing route already filters on 'active'
    // (:35). A message to a number we no longer hold must not be filed as if we
    // did.
    const res = await post(NUMBER_RELEASED, FROM_RELEASED, 'jeste tam jste?');
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    expect(await waitForInbound(FROM_RELEASED, 1500)).toHaveLength(0);
  });

  it('the keyword path still works for the owner organisation', async () => {
    // The case that must write, on the branch where the damage is worst: STOP
    // revokes consent, and it has to be the owner's consent record.
    const who = from('44');
    const res = await post(NUMBER_OWNED, who, 'STOP');
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    expect(res.body).toContain('unsubscribed');

    const rows = await waitForInbound(who);
    expect(rows, 'the handler never reached the sms_inbound insert').toHaveLength(1);
    expect(rows[0]!.orgId).toBe(ownerOrg);
    expect(rows[0]!.keywordAction).toBe('stop');

    await db.delete(smsInbound).where(eq(smsInbound.fromPhone, who));
  });
});
