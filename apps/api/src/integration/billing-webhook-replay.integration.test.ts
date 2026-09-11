/**
 * The billing webhook refuses an event that was signed an hour ago.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * `handleStripeWebhook` in services/billing/index.ts read `t=` out of the
 * Stripe-Signature header, used it to rebuild the signed payload, and never
 * looked at its value. A correctly signed body therefore stayed valid for
 * ever: anyone who captured one — a proxy log, a mirrored request, a support
 * bundle — could post it back at any later time and it would be accepted.
 *
 * The events this endpoint handles make that worse than a duplicate. Replaying
 * an old `customer.subscription.deleted` sets the org's plan to `free` and
 * clears its subscription id (billing/index.ts:225-244), so a paying customer
 * is downgraded by a message they already paid past. Replaying an old
 * `customer.subscription.updated` rewrites plan and period dates from a stale
 * body (:200-223), and an old `checkout.session.completed` re-points
 * `stripeCustomerId` (:182-198).
 *
 * The sibling endpoint in services/commerce has had the check all along —
 * `Math.abs(nowSec - ts) > toleranceSec` at commerce/payments.ts:40, five
 * minutes, and two-sided, so a future timestamp is refused as well.
 *
 * ─── What this asserts ───────────────────────────────────────────────────────
 *
 * Through the real route, because the raw body is part of the path: index.ts
 * preserves `req.rawBody` and the signature is computed over those exact bytes.
 * Each case signs a genuinely valid body with the real secret and varies only
 * `t`, so nothing here tests the HMAC itself — that is what the existing
 * commerce tests cover, and they are left untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from './setup/harness.js';

const SECRET = 'whsec_test_billing_replay_probe';

let app: FastifyInstance;

/**
 * A body that is valid but deliberately inert: `orgId` is absent, so every
 * handler returns before touching a row. The subject here is the gate, not
 * what lies behind it.
 */
function signedAt(tsSec: number, secret = SECRET) {
  const payload = JSON.stringify({
    type: 'payment_intent.succeeded',
    data: { object: { id: `pi_${randomUUID().slice(0, 12)}`, amount_received: 100, metadata: {} } },
  });
  const v1 = createHmac('sha256', secret).update(`${tsSec}.${payload}`, 'utf8').digest('hex');
  return { payload, signature: `t=${tsSec},v1=${v1}` };
}

function post(sig: { payload: string; signature: string }) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/billing/webhook',
    headers: { 'stripe-signature': sig.signature, 'content-type': 'application/json' },
    payload: sig.payload,
  });
}

const nowSec = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  app = await createTestApp();
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('an old signature is not a valid signature', () => {
  it('refuses an event signed an hour ago', async () => {
    const res = await post(signedAt(nowSec() - 3600));

    expect(
      res.statusCode,
      'the billing webhook accepted a body signed an hour ago — the t= value is read to rebuild ' +
        'the signed payload and then never compared to the clock, so a captured request stays ' +
        'replayable for ever',
    ).not.toBe(200);
  }, 120_000);
});

describe('the gate still lets real traffic through', () => {
  it('accepts an event signed just now', async () => {
    const res = await post(signedAt(nowSec()));
    expect(res.statusCode, `a fresh event was refused: ${res.body}`).toBe(200);
  }, 120_000);

  it('accepts a timestamp 30 seconds ahead, because clocks drift', async () => {
    // Stripe's own tolerance is two-sided and so is commerce's. A sender whose
    // clock runs slightly fast must not be refused.
    const res = await post(signedAt(nowSec() + 30));
    expect(res.statusCode, `a near-future event was refused: ${res.body}`).toBe(200);
  }, 120_000);

  it('still refuses a fresh timestamp carrying the wrong signature', async () => {
    // The point of the pair: the new check must narrow the gate, not replace
    // the HMAC with a clock.
    const forged = signedAt(nowSec(), 'whsec_not_the_real_secret');
    const res = await post(forged);
    expect(res.statusCode, 'a forged signature with a fresh timestamp was accepted').not.toBe(200);
  }, 120_000);
});
