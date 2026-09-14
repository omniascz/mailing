/**
 * A release that did not happen must not be recorded as one.
 *
 *     await releaseNumberWithProvider(num.provider, num.providerSid);
 *     await db.update(phoneNumbers).set({ status: 'released', … });
 *
 * The first line swallowed everything — `.catch(() => {})` around the request
 * and no look at `res.ok` — and returned void, so a 401, a 404 or a network
 * outage were indistinguishable from success. The second line ran regardless.
 *
 * What that costs: deleting the number is what stops the monthly charge
 * (<https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource>),
 * so a failed release leaves the number on the account, billed. And because the
 * listing route filters `status = 'active'`, the row it was recorded in
 * disappears — the only place the charge remained visible was the Twilio
 * invoice.
 *
 * ─── Which wrong is the lesser one ───────────────────────────────────────────
 *
 * A number left `active` after a failed release is not ideal either: the
 * customer asked for it to go. But it is TRUE — we still hold it and still pay
 * for it — it stays visible in the listing, and the delete can be retried. The
 * other direction is a lie that hides a recurring cost. So: provider first, row
 * only if the provider agreed.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "Row unchanged" is also what a route that stopped working looks like, so the
 * refusal cases are followed by a release that must succeed and must change the
 * row. Every case also asserts what was sent to Twilio, and the stub counts its
 * calls, so "nothing was sent" cannot pass for "the right thing was sent".
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { phoneNumbers } from '../db/schema/phone-numbers.js';
import { createTestApp, login, type Session } from './setup/harness.js';

const tag = randomUUID().slice(0, 6);
const ACCOUNT_SID = `AC${tag}`;
const AUTH_TOKEN = `itest-twilio-token-${tag}`;

let app: FastifyInstance;
let caller: Session;

interface Call {
  url: string;
  method: string | undefined;
}

/** Replaces global fetch: the route has no seam of its own to inject into. */
function stubFetch(response: { ok: boolean; status?: number } | 'network-error') {
  const calls: Call[] = [];
  const impl = (async (url: unknown, init?: unknown) => {
    const opts = (init ?? {}) as { method?: string };
    calls.push({ url: String(url), method: opts.method });
    if (response === 'network-error') throw new Error('ECONNREFUSED');
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 204 : 500),
      json: async () => ({}),
    };
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', impl);
  return calls;
}

/** A provisioned number, as the provisioning route would have left it. */
async function seedNumber(opts: { providerSid: string | null }): Promise<string> {
  const [row] = await db
    .insert(phoneNumbers)
    .values({
      orgId: caller.orgId,
      number: `+42077${Math.floor(Math.random() * 1_000_000)}`,
      provider: 'twilio',
      providerSid: opts.providerSid,
      status: 'active',
      provisionedAt: new Date(),
    })
    .returning({ id: phoneNumbers.id });
  return row!.id;
}

const rowOf = async (id: string) =>
  (await db.select().from(phoneNumbers).where(eq(phoneNumbers.id, id)))[0]!;

const release = async (id: string) =>
  app.inject({
    method: 'DELETE',
    url: `/api/v1/phone/numbers/${id}`,
    headers: { cookie: caller.cookie },
  });

const prev = {
  sid: process.env.TWILIO_ACCOUNT_SID,
  token: process.env.TWILIO_AUTH_TOKEN,
};

beforeAll(async () => {
  process.env.TWILIO_ACCOUNT_SID = ACCOUNT_SID;
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;

  app = await createTestApp();
  await app.ready();
  caller = await login(app);
}, 120_000);

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.TWILIO_ACCOUNT_SID = ACCOUNT_SID;
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
});

afterAll(async () => {
  await db.delete(phoneNumbers).where(eq(phoneNumbers.orgId, caller.orgId));
  for (const [k, v] of Object.entries({
    TWILIO_ACCOUNT_SID: prev.sid,
    TWILIO_AUTH_TOKEN: prev.token,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

describe('releasing a number records what actually happened', () => {
  it('a refusal from Twilio leaves the number active', async () => {
    const id = await seedNumber({ providerSid: `PN-refused-${tag}` });
    const calls = stubFetch({ ok: false, status: 500 });

    const res = await release(id);
    expect(res.statusCode, `body: ${res.body}`).not.toBe(200);

    // Twilio really was asked — otherwise the row below would be unchanged for
    // the wrong reason.
    expect(calls, 'Twilio was never called').toHaveLength(1);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers/PN-refused-${tag}.json`,
    );

    const row = await rowOf(id);
    expect(row.status, 'a number Twilio refused to release was marked released').toBe('active');
    expect(row.releasedAt).toBeNull();
  });

  it('a network failure leaves the number active too', async () => {
    const id = await seedNumber({ providerSid: `PN-offline-${tag}` });
    const calls = stubFetch('network-error');

    const res = await release(id);
    expect(res.statusCode, `body: ${res.body}`).not.toBe(200);
    expect(calls).toHaveLength(1);

    const row = await rowOf(id);
    expect(row.status).toBe('active');
    expect(row.releasedAt).toBeNull();
  });

  it('missing credentials leave a provisioned number active', async () => {
    // We bought it and now cannot give it back; saying otherwise would be the
    // same lie with a different cause.
    const id = await seedNumber({ providerSid: `PN-nocreds-${tag}` });
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    const calls = stubFetch({ ok: true });

    const res = await release(id);
    expect(res.statusCode, `body: ${res.body}`).not.toBe(200);
    expect(calls, 'a request went out with no credentials').toHaveLength(0);

    const row = await rowOf(id);
    expect(row.status).toBe('active');
    expect(row.releasedAt).toBeNull();
  });

  it('a successful release marks the row released', async () => {
    // The case that must change the row.
    const id = await seedNumber({ providerSid: `PN-ok-${tag}` });
    const calls = stubFetch({ ok: true, status: 204 });

    const res = await release(id);
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    expect(res.json()).toEqual({ data: { released: true } });
    expect(calls).toHaveLength(1);

    const row = await rowOf(id);
    expect(row.status).toBe('released');
    expect(row.releasedAt).not.toBeNull();
  });

  it('a number we never bought is released as bookkeeping, without calling anyone', async () => {
    // Negative control: providerSid null means the operator brought the number
    // themselves, so there is nothing at the provider to give back.
    const id = await seedNumber({ providerSid: null });
    const calls = stubFetch({ ok: false, status: 500 });

    const res = await release(id);
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    expect(calls, 'a number we never bought was reported to Twilio').toHaveLength(0);

    const row = await rowOf(id);
    expect(row.status).toBe('released');
    expect(row.releasedAt).not.toBeNull();
  });
});
