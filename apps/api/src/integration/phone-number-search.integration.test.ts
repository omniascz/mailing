/**
 * An empty search result must mean "nothing matched".
 *
 * `searchAvailableNumbers` ended with `return []` for every provider it does
 * not implement — today that is telnyx, which the route's own enum offers. The
 * caller cannot tell that apart from a genuine "no numbers match your area
 * code": both are `{ data: [] }` with a 200. Somebody searching for a Czech
 * number on telnyx concludes none exist, when the truth is that we never asked
 * anybody.
 *
 * #186 made the matching purchase branch refuse for the same reason; this is
 * the step before it, and it should not be the one place that still answers
 * with silence.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A refusal is easy to fake by breaking the route, so the telnyx case is
 * followed by a twilio search that must still return the numbers the provider
 * offered, and the stub counts its calls.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';

const tag = randomUUID().slice(0, 6);

let app: FastifyInstance;
let caller: Session;

/** Answers as Twilio's AvailablePhoneNumbers endpoint does. */
function stubFetch() {
  const calls: string[] = [];
  const impl = (async (url: unknown) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        available_phone_numbers: [
          { phone_number: `+4207770000${tag.slice(0, 2)}`, monthly_rental_rate: '1.15' },
        ],
      }),
    };
  }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', impl);
  return calls;
}

const search = async (provider: 'twilio' | 'telnyx') =>
  app.inject({
    method: 'POST',
    url: '/api/v1/phone/numbers/search',
    headers: { cookie: caller.cookie },
    payload: { countryCode: 'CZ', provider, limit: 5 },
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
  for (const [k, v] of Object.entries({
    TWILIO_ACCOUNT_SID: prev.sid,
    TWILIO_AUTH_TOKEN: prev.token,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

describe('searching through a provider we do not implement', () => {
  it('telnyx is refused, not answered with an empty list', async () => {
    const calls = stubFetch();

    const res = await search('telnyx');
    expect(res.statusCode, `body: ${res.body}`).toBe(400);
    expect(res.body).toMatch(/telnyx/i);
    expect(calls, 'a telnyx search reached the network').toHaveLength(0);
  });

  it('twilio still searches and still returns what it found', async () => {
    // The case that must answer: without it the refusal above would also hold
    // for a route that had stopped working.
    const calls = stubFetch();

    const res = await search('twilio');
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    expect(calls, 'Twilio was never asked').toHaveLength(1);
    expect(calls[0]!).toContain('/AvailablePhoneNumbers/CZ/Local.json');

    const data = res.json().data as Array<{ number: string; monthlyRate: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.number).toBe(`+4207770000${tag.slice(0, 2)}`);
    expect(data[0]!.monthlyRate).toBe('1.15');
  });
});
