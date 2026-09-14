/**
 * An unsupported provider refuses instead of writing a row.
 *
 * `provider` is `z.enum(['twilio', 'telnyx'])` on the provisioning route, but
 * only the twilio branch is implemented. Telnyx fell through to
 * `return { providerSid: null, monthlyRateUsd: null }` and the route inserted
 * the row anyway: a number in phone_numbers, listed as active, with no provider
 * sid, that nobody ever bought and that nothing can send from or receive on.
 * `searchAvailableNumbers` is the same shape — it returns [] for telnyx — so the
 * only way to reach this was to type the number in by hand, and the answer was
 * a 201.
 *
 * Telnyx is not fictional in this repo: services/phone/voip.ts:244 implements
 * it as a VOICE provider. Number provisioning is simply not written, and the
 * enum promised otherwise.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "No row" is also what a broken route produces, so the refusal is followed by
 * a twilio provisioning that must still write one.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { phoneNumbers } from '../db/schema/phone-numbers.js';
import { createTestApp, login, type Session } from './setup/harness.js';

/**
 * #185 refuses to buy a number when API_PUBLIC_URL is unset, because the
 * inbound webhook could not be configured on it. config/env.ts parses once at
 * import, so the value has to be in place before the imports run.
 */
vi.hoisted(() => {
  process.env.API_PUBLIC_URL = 'https://api.itest.invalid';
});

const tag = randomUUID().slice(0, 6);
const NUMBER_TELNYX = `+42078800${tag.slice(0, 4)}`;
const NUMBER_TWILIO = `+42078801${tag.slice(0, 4)}`;

let app: FastifyInstance;
let caller: Session;

const rowsFor = async (number: string) =>
  db
    .select()
    .from(phoneNumbers)
    .where(and(eq(phoneNumbers.orgId, caller.orgId), eq(phoneNumbers.number, number)));

/** Counts calls so a refusal cannot be confused with a request never made. */
function stubFetch() {
  const calls: string[] = [];
  const impl = (async (url: unknown) => {
    calls.push(String(url));
    return { ok: true, status: 201, json: async () => ({ sid: `PN-${tag}` }) };
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', impl);
  return calls;
}

const provision = async (number: string, provider: 'twilio' | 'telnyx') =>
  app.inject({
    method: 'POST',
    url: '/api/v1/phone/numbers',
    headers: { cookie: caller.cookie },
    payload: { number, provider },
  });

const prev = {
  sid: process.env.TWILIO_ACCOUNT_SID,
  token: process.env.TWILIO_AUTH_TOKEN,
};

beforeAll(async () => {
  process.env.TWILIO_ACCOUNT_SID = `AC${tag}`;
  process.env.TWILIO_AUTH_TOKEN = `itest-token-${tag}`;

  app = await createTestApp();
  await app.ready();
  caller = await login(app);
}, 120_000);

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  for (const number of [NUMBER_TELNYX, NUMBER_TWILIO]) {
    await db.delete(phoneNumbers).where(eq(phoneNumbers.number, number));
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

describe('provisioning through a provider we do not implement', () => {
  it('telnyx is refused and nothing is written', async () => {
    const calls = stubFetch();

    const res = await provision(NUMBER_TELNYX, 'telnyx');
    expect(res.statusCode, `body: ${res.body}`).toBe(400);
    expect(res.body).toMatch(/telnyx/i);

    expect(calls, 'a telnyx provisioning reached the network').toHaveLength(0);
    expect(
      await rowsFor(NUMBER_TELNYX),
      'a number nobody provisioned was written to phone_numbers',
    ).toHaveLength(0);
  });

  it('twilio still provisions and still writes the row', async () => {
    // The case that must write: without it the refusal above would also hold
    // for a route that had stopped working.
    const calls = stubFetch();

    const res = await provision(NUMBER_TWILIO, 'twilio');
    expect(res.statusCode, `body: ${res.body}`).toBe(201);
    expect(calls, 'Twilio was never called').toHaveLength(1);

    const rows = await rowsFor(NUMBER_TWILIO);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe('twilio');
    expect(rows[0]!.providerSid).toBe(`PN-${tag}`);
    expect(rows[0]!.status).toBe('active');
  });
});
