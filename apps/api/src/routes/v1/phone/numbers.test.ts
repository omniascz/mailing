/**
 * Buying a number has to point it at us.
 *
 * `provisionNumberWithProvider` bought the number with a body of exactly
 * `{ PhoneNumber }` — no SmsUrl — so Twilio had nowhere to deliver an inbound
 * message and answered the sender with its own default. Every number the
 * product ever provisioned was bought that way; nothing else in the repo sets
 * SmsUrl either, so inbound SMS could only ever work if somebody opened the
 * Twilio console and typed the URL in by hand.
 *
 * <https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource>:
 * "SmsUrl — The URL we should call when the new phone number receives an
 * incoming SMS message", accepted by the same POST that buys the number.
 *
 * ─── What is asserted ────────────────────────────────────────────────────────
 *
 * The body of the request that goes to Twilio, not the return value: a function
 * can return a plausible sid while having sent the wrong thing. The stub also
 * counts its calls, so "nothing was sent" cannot pass as "the right thing was
 * sent".
 *
 * The URL itself matters as much as its presence. #184 verifies Twilio's
 * signature by rebuilding `API_PUBLIC_URL + path`; if the number is registered
 * against anything else, every genuine callback is refused. The expectation
 * below is written as that same concatenation on purpose.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

const SID = 'AC_unit_test_account';
const TOKEN = 'unit_test_auth_token';
const BASE = 'https://api.example.test';
const NUMBER = '+420777000111';

interface Call {
  url: string;
  method: string | undefined;
  params: URLSearchParams;
}

/** A fetch that records what it was asked to send and answers as Twilio would. */
function stubFetch(response: { ok: boolean; status?: number; sid?: string }) {
  const calls: Call[] = [];
  const impl = (async (url: unknown, init?: unknown) => {
    const opts = (init ?? {}) as { method?: string; body?: unknown };
    calls.push({
      url: String(url),
      method: opts.method,
      params: new URLSearchParams(String(opts.body ?? '')),
    });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 201 : 400),
      json: async () => ({ sid: response.sid ?? 'PN_stub' }),
    };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

/**
 * config/env.ts parses process.env once at import, so API_PUBLIC_URL has to be
 * in place before the module is loaded — the same reason sms.test.ts re-imports
 * per case.
 */
async function provisionWith(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL, TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, ...overrides };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
  }
  vi.resetModules();
  const mod = await import('./numbers.js');
  return mod.provisionNumberWithProvider;
}

describe('provisionNumberWithProvider', () => {
  it('points the number at our inbound SMS webhook', async () => {
    const provision = await provisionWith({ API_PUBLIC_URL: BASE });
    const { impl, calls } = stubFetch({ ok: true, sid: 'PN123' });

    const result = await provision('twilio', NUMBER, { fetchImpl: impl });

    // The stub really ran — without this the assertions below would also hold
    // for a function that never called Twilio at all.
    expect(calls, 'Twilio was never called').toHaveLength(1);
    expect(calls[0]!.url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/IncomingPhoneNumbers.json`,
    );
    expect(calls[0]!.method).toBe('POST');

    const sent = calls[0]!.params;
    expect(sent.get('PhoneNumber')).toBe(NUMBER);
    expect(sent.get('SmsUrl')).toBe(`${BASE}/api/v1/sms/webhooks/twilio/inbound`);
    expect(sent.get('SmsMethod')).toBe('POST');

    expect(result.providerSid).toBe('PN123');
  });

  it('refuses to buy a number it cannot point at us', async () => {
    // Negative control on the configuration: the failure has to be legible and
    // has to happen BEFORE the purchase, not after — a number bought without a
    // webhook costs money every month and receives nothing.
    const provision = await provisionWith({ API_PUBLIC_URL: undefined });
    const { impl, calls } = stubFetch({ ok: true });

    await expect(provision('twilio', NUMBER, { fetchImpl: impl })).rejects.toThrow(
      /API_PUBLIC_URL/,
    );
    expect(calls, 'the number was bought despite the refusal').toHaveLength(0);
  });

  it('a refusal from Twilio reaches the caller instead of a null sid', async () => {
    // Was: `return { providerSid: null, monthlyRateUsd: null }`, and the route
    // wrote the row anyway — a number in phone_numbers that Twilio never sold.
    const provision = await provisionWith({ API_PUBLIC_URL: BASE });
    const { impl, calls } = stubFetch({ ok: false, status: 402 });

    await expect(provision('twilio', NUMBER, { fetchImpl: impl })).rejects.toThrow(/402/);
    expect(calls).toHaveLength(1);
  });

  it('a network failure is a refusal too', async () => {
    const provision = await provisionWith({ API_PUBLIC_URL: BASE });
    const impl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    await expect(provision('twilio', NUMBER, { fetchImpl: impl })).rejects.toThrow(
      /did not complete/,
    );
  });

  it('without Twilio credentials nothing is bought and nothing is claimed', async () => {
    // Unchanged behaviour, pinned so the refusals above cannot be mistaken for
    // it: with no credentials the function has never called Twilio, and the
    // route records a number the operator brought themselves.
    const provision = await provisionWith({
      API_PUBLIC_URL: BASE,
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
    });
    const { impl, calls } = stubFetch({ ok: true });

    const result = await provision('twilio', NUMBER, { fetchImpl: impl });
    expect(calls).toHaveLength(0);
    expect(result).toEqual({ providerSid: null, monthlyRateUsd: null });
  });
});
