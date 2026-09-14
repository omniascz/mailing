/**
 * Buying the same number twice.
 *
 * The provisioning route called the provider first and looked at the database
 * second:
 *
 *     const { providerSid } = await provisionNumberWithProvider(…);   // money
 *     const [row] = await db.insert(phoneNumbers).values({ … });      // check
 *
 * There is no existence check at all, and `phone_numbers` is unique on
 * (org_id, number), so the second POST for a number this organisation already
 * has buys it again and then fails on the insert — a 500, with the purchase
 * already made and the new provider sid only in a local variable that the
 * handler throws away. Nothing in the repo can find that number again: the
 * release path takes a providerSid we no longer have, and there is no lookup
 * by phone number.
 *
 * The reachable case is not the obvious one. A real Twilio refuses to sell a
 * number the account already owns, and since #185 that refusal is an error, so
 * the duplicate stops there. What is not refused is a number this organisation
 * RELEASED: Twilio sells it again quite happily, and the row is still in our
 * table with status 'released', so the unique index rejects the insert after
 * the money is spent.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "No second call" is also what a route that stopped working produces, so the
 * first purchase in every case must succeed and must write the row, asserted
 * field by field, and the stub counts its calls in both directions.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, users } from '../db/schema/index.js';
import { phoneNumbers } from '../db/schema/phone-numbers.js';
import { createTestApp, login, type Session } from './setup/harness.js';

/**
 * #185 refuses a purchase with no API_PUBLIC_URL, because the inbound webhook
 * could not be configured. config/env.ts parses once at import, so it has to be
 * set before the imports run.
 */
vi.hoisted(() => {
  process.env.API_PUBLIC_URL = 'https://api.itest.invalid';
});

const tag = randomUUID().slice(0, 6);
const ACCOUNT_SID = `AC${tag}`;

const NUMBER_TWICE = `+42079900${tag.slice(0, 4)}`;
const NUMBER_RELEASED = `+42079901${tag.slice(0, 4)}`;
const NUMBER_OTHER_ORG = `+42079902${tag.slice(0, 4)}`;

let app: FastifyInstance;
let caller: Session;
/** A second organisation, for the case that must still be allowed. */
let otherOrg: string;

const rowsFor = async (orgId: string, number: string) =>
  db
    .select()
    .from(phoneNumbers)
    .where(and(eq(phoneNumbers.orgId, orgId), eq(phoneNumbers.number, number)));

/** Each purchase gets its own sid, so a second one is visible in the row. */
function stubFetch() {
  const calls: string[] = [];
  const impl = (async (url: unknown) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 201,
      json: async () => ({ sid: `PN-${tag}-${calls.length}` }),
    };
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', impl);
  return calls;
}

const provision = async (number: string, cookie = caller.cookie) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/phone/numbers',
    headers: { cookie },
    payload: { number, provider: 'twilio' },
  });

const prev = {
  sid: process.env.TWILIO_ACCOUNT_SID,
  token: process.env.TWILIO_AUTH_TOKEN,
};

beforeAll(async () => {
  process.env.TWILIO_ACCOUNT_SID = ACCOUNT_SID;
  process.env.TWILIO_AUTH_TOKEN = `itest-token-${tag}`;

  app = await createTestApp();
  await app.ready();
  caller = await login(app);

  const [org] = await db
    .insert(organizations)
    .values({ name: 'phone other', slug: `phone-other-${tag}` })
    .returning({ id: organizations.id });
  otherOrg = org!.id;
}, 120_000);

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  for (const number of [NUMBER_TWICE, NUMBER_RELEASED, NUMBER_OTHER_ORG]) {
    await db.delete(phoneNumbers).where(eq(phoneNumbers.number, number));
  }
  if (otherOrg) {
    await db.delete(phoneNumbers).where(eq(phoneNumbers.orgId, otherOrg));
    await db.delete(users).where(eq(users.orgId, otherOrg));
    await db.delete(organizations).where(eq(organizations.id, otherOrg));
  }
  for (const [k, v] of Object.entries({
    TWILIO_ACCOUNT_SID: prev.sid,
    TWILIO_AUTH_TOKEN: prev.token,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

describe('a number this organisation already has is not bought again', () => {
  it('the second purchase is refused before any money is spent', async () => {
    const calls = stubFetch();

    // First: must succeed and must write — the evidence that the refusal below
    // is a decision and not a broken route.
    const first = await provision(NUMBER_TWICE);
    expect(first.statusCode, `body: ${first.body}`).toBe(201);
    expect(calls, 'the first purchase never reached Twilio').toHaveLength(1);

    const afterFirst = await rowsFor(caller.orgId, NUMBER_TWICE);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.providerSid).toBe(`PN-${tag}-1`);
    expect(afterFirst[0]!.status).toBe('active');

    // Second: refused, and refused BEFORE the provider is asked.
    const second = await provision(NUMBER_TWICE);
    expect(second.statusCode, `body: ${second.body}`).not.toBe(201);
    expect(calls, 'the number was bought a second time').toHaveLength(1);

    const afterSecond = await rowsFor(caller.orgId, NUMBER_TWICE);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]!.providerSid, 'the row was overwritten by the second purchase').toBe(
      `PN-${tag}-1`,
    );
  });

  it('a released number can be bought again, and the row comes back to life', async () => {
    // The case the unique index used to make impossible after the money was
    // spent: (org_id, number) still holds the released row.
    const calls = stubFetch();

    const first = await provision(NUMBER_RELEASED);
    expect(first.statusCode, `body: ${first.body}`).toBe(201);

    // Release it the way the route does, without going through the provider.
    await db
      .update(phoneNumbers)
      .set({ status: 'released', releasedAt: new Date() })
      .where(and(eq(phoneNumbers.orgId, caller.orgId), eq(phoneNumbers.number, NUMBER_RELEASED)));

    const again = await provision(NUMBER_RELEASED);
    expect(again.statusCode, `body: ${again.body}`).toBe(201);
    expect(calls, 'the re-purchase never reached Twilio').toHaveLength(2);

    const rows = await rowsFor(caller.orgId, NUMBER_RELEASED);
    expect(rows, 'a second row appeared for one number').toHaveLength(1);
    expect(rows[0]!.status).toBe('active');
    expect(rows[0]!.releasedAt).toBeNull();
    expect(rows[0]!.providerSid, 'the row kept the sid of the number we gave back').toBe(
      `PN-${tag}-2`,
    );
  });

  it('another organisation can buy the same number', async () => {
    // Negative control: the unique key is per organisation, and two customers
    // may legitimately hold the same number on different accounts.
    const calls = stubFetch();

    const mine = await provision(NUMBER_OTHER_ORG);
    expect(mine.statusCode, `body: ${mine.body}`).toBe(201);

    await db.insert(phoneNumbers).values({
      orgId: otherOrg,
      number: NUMBER_OTHER_ORG,
      provider: 'twilio',
      providerSid: `PN-other-${tag}`,
      status: 'active',
      provisionedAt: new Date(),
    });

    expect(await rowsFor(caller.orgId, NUMBER_OTHER_ORG)).toHaveLength(1);
    expect(await rowsFor(otherOrg, NUMBER_OTHER_ORG)).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});
