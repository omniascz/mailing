/**
 * One rule for "is this webhook really from who it says", written once.
 *
 * ─── What it replaces ────────────────────────────────────────────────────────
 *
 * Seven receivers each had their own copy of this shape:
 *
 *     if (creds.webhookSecret && !verifyX(rawBody, signature, creds.webhookSecret)) {
 *       return reply.code(401).send({ code: 'INVALID_SIGNATURE', … });
 *     }
 *
 * Read it again with the secret unset. The `&&` short-circuits, the check does
 * not run, and the body is accepted — so an endpoint whose whole job is to
 * authenticate the caller authenticates nobody exactly when it has nothing to
 * authenticate with. `webhookSecret` is `.optional()` in the connect payload,
 * so "unset" is not hypothetical; it is what you get by connecting a shop and
 * leaving the field blank.
 *
 * What those endpoints then do is not read-only: they normalise the body into
 * an order and call `ingestOrder`, which writes `ecommerce_webhook_events`,
 * looks up or creates a contact by email, and records an order against the
 * connection's org. The connection is chosen from the URL or from headers in
 * the body's own claim, so the caller picks the org too.
 *
 * ─── The rule ────────────────────────────────────────────────────────────────
 *
 * No secret is a refusal, not a bypass. Same shape as the Twilio receiver
 * (services/phone/voip.ts:189), which throws on a missing signature OR a
 * missing auth token before it compares anything.
 *
 * A missing secret and a bad signature are reported as different codes on
 * purpose. `INVALID_SIGNATURE` is the sender's problem; a
 * `WEBHOOK_SECRET_NOT_CONFIGURED` is ours, and the operator reading the shop's
 * webhook log needs to be able to tell those apart — otherwise the answer to
 * "why did my orders stop arriving" is a 401 that says nothing.
 *
 * ─── Why it returns instead of throwing ──────────────────────────────────────
 *
 * The receivers already answer with an explicit `reply.code(...)`, and some of
 * them answer 204 on cases that are not errors (unknown shop, no connection).
 * Returning a value keeps that shape visible in the route instead of moving
 * half the control flow into an error handler.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export interface SignatureOk {
  ok: true;
}

export interface SignatureRefused {
  ok: false;
  status: 401;
  code: 'WEBHOOK_SECRET_NOT_CONFIGURED' | 'INVALID_SIGNATURE';
  message: string;
}

export type SignatureCheck = SignatureOk | SignatureRefused;

export interface WebhookSignatureInput {
  /** Names the integration in the refusal message — the operator reads it. */
  integration: string;
  /** The shared secret as stored. `null`/`undefined`/blank all mean "not configured". */
  secret: string | null | undefined;
  /** Whatever the sender presented: an HMAC header, or the secret itself. */
  signature: string | null | undefined;
  rawBody: string;
  /** The integration's own comparison. Must not be reached without a secret. */
  verify: (rawBody: string, signature: string, secret: string) => boolean;
}

export function checkWebhookSignature(input: WebhookSignatureInput): SignatureCheck {
  const secret = input.secret?.trim();
  if (!secret) {
    return {
      ok: false,
      status: 401,
      code: 'WEBHOOK_SECRET_NOT_CONFIGURED',
      message:
        `This ${input.integration} connection has no webhook secret, so the request ` +
        `cannot be verified and is refused. Set one on the connection and configure ` +
        `the same value in ${input.integration}.`,
    };
  }

  const signature = input.signature?.trim();
  if (!signature) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_SIGNATURE',
      message: `Missing ${input.integration} webhook signature`,
    };
  }

  if (!input.verify(input.rawBody, signature, secret)) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_SIGNATURE',
      message: `${input.integration} webhook signature mismatch`,
    };
  }

  return { ok: true };
}

/**
 * Constant-time string comparison, for the receivers that compare a shared
 * secret directly rather than an HMAC of the body.
 *
 * `timingSafeEqual` throws when the two buffers differ in length, which would
 * both crash the route and leak the length through the error. Both sides are
 * hashed to a fixed width first, which is the standard way round it: equal
 * digests mean equal inputs, and the comparison is over 32 bytes either way.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}
