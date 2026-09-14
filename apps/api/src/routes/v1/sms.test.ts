/**
 * The Twilio signature check, on its own.
 *
 * Two of its answers cannot be produced against a running app: config/env.ts
 * parses the environment once at import (`const base = loadEnv()`), so a test
 * that deletes TWILIO_AUTH_TOKEN or API_PUBLIC_URL from process.env changes
 * nothing the route can see. Both are reached here by re-importing the module
 * with a different environment, which is the same technique env.test.ts and
 * beyond-core-groups use.
 *
 * The rest of the behaviour — unsigned, forged, correctly signed — is proved
 * through the real endpoints in
 * src/integration/sms-webhook-signature.integration.test.ts.
 *
 * Not asserted here: that the dev flag is unreachable in production. Importing
 * config/env.ts with NODE_ENV=production and nothing else set exits the process
 * before the check is reached — correctly. The lock belongs to
 * unsignedWebhooksAllowed() and is pinned in lib/meta-signature.test.ts.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { twilioSignatureRefusal } from './sms.js';

const AUTH_TOKEN = 'twilio_auth_token_for_the_unit_test';
const BASE = 'https://api.example.test';
const PATH = '/api/v1/sms/webhooks/twilio/inbound';
const PARAMS = { MessageSid: 'SM1', From: '+420111222333', To: '+420999888777', Body: 'ahoj' };

/** The documented canonicalisation: URL, then sorted name+value pairs. */
function signature(token: string): string {
  const canonical = Object.keys(PARAMS)
    .sort()
    .reduce((acc, key) => acc + key + PARAMS[key as keyof typeof PARAMS], `${BASE}${PATH}`);
  return createHmac('sha1', token).update(canonical).digest('base64');
}

/** Only the three fields the function reads. */
const req = (sig?: string) =>
  ({
    url: PATH,
    body: PARAMS,
    headers: sig === undefined ? {} : { 'x-twilio-signature': sig },
  }) as unknown as FastifyRequest;

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

/** Boots the route module against a given environment and hands back the check. */
async function refusalWith(
  overrides: Record<string, string | undefined>,
): Promise<typeof twilioSignatureRefusal> {
  process.env = { ...ORIGINAL, ...overrides };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
  }
  vi.resetModules();
  const mod = await import('./sms.js');
  return mod.twilioSignatureRefusal;
}

describe('twilioSignatureRefusal', () => {
  it('accepts a correctly signed request', async () => {
    const check = await refusalWith({ TWILIO_AUTH_TOKEN: AUTH_TOKEN, API_PUBLIC_URL: BASE });
    expect(check(req(signature(AUTH_TOKEN)))).toBeNull();
  });

  it('refuses a signature made with another token', async () => {
    const check = await refusalWith({ TWILIO_AUTH_TOKEN: AUTH_TOKEN, API_PUBLIC_URL: BASE });
    expect(check(req(signature('some-other-token')))?.code).toBe('INVALID_SIGNATURE');
  });

  it('refuses a request with no signature at all', async () => {
    const check = await refusalWith({ TWILIO_AUTH_TOKEN: AUTH_TOKEN, API_PUBLIC_URL: BASE });
    expect(check(req())?.code).toBe('INVALID_SIGNATURE');
  });

  it('an unset Auth Token is a refusal, not a pass', async () => {
    // The shape #180 removed elsewhere: nothing to verify with is not the same
    // as verified.
    const check = await refusalWith({ TWILIO_AUTH_TOKEN: undefined, API_PUBLIC_URL: BASE });
    expect(check(req(signature(AUTH_TOKEN)))?.code).toBe('WEBHOOK_SECRET_NOT_CONFIGURED');
  });

  it('an unset API_PUBLIC_URL is a refusal too', async () => {
    // The URL is half of what Twilio signs; without it there is nothing to
    // compare against, and the operator needs to be told which of the two is
    // missing.
    const check = await refusalWith({ TWILIO_AUTH_TOKEN: AUTH_TOKEN, API_PUBLIC_URL: undefined });
    const refusal = check(req(signature(AUTH_TOKEN)));
    expect(refusal?.code).toBe('WEBHOOK_URL_NOT_CONFIGURED');
    expect(refusal?.message).toMatch(/API_PUBLIC_URL/);
  });

  it('the dev flag opens a missing token, and only a missing token', async () => {
    const check = await refusalWith({
      TWILIO_AUTH_TOKEN: undefined,
      API_PUBLIC_URL: BASE,
      ALLOW_UNSIGNED_WEBHOOKS: 'true',
    });
    expect(check(req())).toBeNull();

    // A configured token with a forged signature is still refused — the hatch
    // covers "we cannot verify", not "this did not verify".
    const withToken = await refusalWith({
      TWILIO_AUTH_TOKEN: AUTH_TOKEN,
      API_PUBLIC_URL: BASE,
      ALLOW_UNSIGNED_WEBHOOKS: 'true',
    });
    expect(withToken(req(signature('some-other-token')))?.code).toBe('INVALID_SIGNATURE');
  });
});
