/**
 * Twilio's signature, checked the way Twilio documents it.
 *
 * <https://www.twilio.com/docs/usage/security>: take the full URL through the
 * end of the query string; sort the POST parameters alphabetically (Unix-style,
 * case-sensitive); append each name and value to that URL with no delimiters;
 * HMAC-SHA1 the result with the account Auth Token; base64-encode it; compare
 * with the `X-Twilio-Signature` header. Note what is signed: not the body, the
 * URL plus the parameters. A verifier that HMACs the raw body — as
 * services/phone/voip.ts:188 does, uncalled — never matches a real Twilio POST.
 *
 * The URL has to be the one configured in the Twilio console, and this process
 * cannot see it: behind a proxy `req.url` is only the path. API_PUBLIC_URL is
 * the deployment's own statement of its public base, so the URL is rebuilt from
 * it. That makes a wrong API_PUBLIC_URL a reason every genuine callback is
 * refused — which is why the refusal says which of the two causes it was, and
 * why it is logged.
 *
 * A missing Auth Token or a missing public base means NOT VERIFIED, not
 * verified. The only way past that is unsignedWebhooksAllowed(), which cannot
 * be reached in production.
 *
 * ─── Why this lives in lib/ ─────────────────────────────────────────────────
 *
 * It was a private function in routes/v1/sms.ts, called by the two SMS/WhatsApp
 * callbacks. routes/v1/voice.ts needed the same check — its callback had none
 * at all, and an unsigned POST rewrote the status, duration and recording URL
 * of any call whose ids the caller knew (measured). A second copy of a
 * signature verifier is how two callbacks end up disagreeing about what
 * "verified" means, so the one that already existed moved here instead.
 * routes/v1/sms.ts re-exports it, because its unit test boots that module to
 * reach it.
 */

import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { checkWebhookSignature, timingSafeEqualString } from './webhook-signature.js';
import { unsignedWebhooksAllowed } from './webhook-switches.js';

export function twilioSignatureRefusal(
  req: FastifyRequest,
): { code: string; message: string } | null {
  const base = (env.API_PUBLIC_URL ?? '').replace(/\/+$/, '');
  if (!base) {
    if (unsignedWebhooksAllowed()) return null;
    return {
      code: 'WEBHOOK_URL_NOT_CONFIGURED',
      message:
        'API_PUBLIC_URL is not set, so the URL Twilio signed cannot be reconstructed and the ' +
        'request cannot be verified. Set it to the public base of this API — the same origin ' +
        'as the webhook URL configured in the Twilio console.',
    };
  }

  // Twilio posts application/x-www-form-urlencoded; @fastify/formbody parses it
  // into a flat object of strings, which is exactly the parameter set to sort.
  const params = (req.body ?? {}) as Record<string, unknown>;
  const canonical = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + String(params[key] ?? ''), `${base}${req.url}`);

  const check = checkWebhookSignature({
    integration: 'Twilio',
    secret: env.TWILIO_AUTH_TOKEN,
    signature: req.headers['x-twilio-signature'] as string | undefined,
    rawBody: canonical,
    verify: (signedString, signature, authToken) =>
      timingSafeEqualString(
        createHmac('sha1', authToken).update(signedString).digest('base64'),
        signature,
      ),
  });

  if (check.ok) return null;
  // The escape hatch covers "we have nothing to verify with", not "this did not
  // verify" — a forged signature is refused in development too.
  if (check.code === 'WEBHOOK_SECRET_NOT_CONFIGURED' && unsignedWebhooksAllowed()) return null;
  return { code: check.code, message: check.message };
}
