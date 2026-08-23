import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';

/**
 * Pay for the module graph in a hook, not in the first test.
 *
 * These files import the module under test lazily — after vi.mock and after the
 * env for the case is in place — so the whole graph (queues, bullmq, the db
 * client, …) is transformed and executed inside whichever test ran first, and
 * charged to its 10s budget. Measured on an idle machine this file needed
 * 8-22s in the full suite while taking under 2s alone: the cost is contention
 * during that first load, not the assertions.
 *
 * Loading it once here moves that to setup, where it belongs. vitest caches the
 * transform, so the per-test vi.resetModules() re-executes a warm graph
 * (measured: 1719ms cold, 309ms after a reset) and the tests time what they
 * are actually about.
 *
 * The explicit budget is on this hook alone. Loading a module graph under
 * contention is setup and needs room; the tests keep the suite's strict 10s,
 * because a test that needs longer than that is telling you something.
 */
beforeAll(async () => {
  await import('./payments.js');
}, 60_000);

/**
 * The Stripe webhook gate.
 *
 * Both handlers used to read `if (secret) { verify }`. An unset or empty
 * STRIPE_WEBHOOK_SECRET therefore skipped verification rather than refusing the
 * request, and docker-compose.prod.yml passed `${STRIPE_WEBHOOK_SECRET:-}`,
 * which substitutes on unset AND on empty — so that was the deployed state, not
 * a theoretical one. A forged `payment_intent.succeeded` marked an invoice paid.
 *
 * A probe against the previous code recorded exactly this:
 *
 *   STRIPE verifyStripeSignature(forged, "bogus", "") -> false
 *   STRIPE handleStripeWebhook, secret="" , bogus signature -> ACCEPTED (no throw)
 *
 * The verifier was never the problem. The condition around it was.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const forged = () =>
  Buffer.from(
    JSON.stringify({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_x', metadata: {} } },
    }),
  );

async function callWebhook(): Promise<string> {
  const { handleStripeWebhook } = await import('./payments.js');
  try {
    await handleStripeWebhook(forged(), 'totally-invalid-signature');
    return 'ACCEPTED';
  } catch (err) {
    return 'REJECTED: ' + (err as Error).message;
  }
}

describe('handleStripeWebhook — verification is mandatory', () => {
  it('rejects a forged event when the secret is missing', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.ALLOW_UNSIGNED_WEBHOOKS;

    const outcome = await callWebhook();
    expect(outcome, 'an unconfigured secret must refuse the request, not wave it through').toMatch(
      /^REJECTED/,
    );
    expect(outcome).toMatch(/STRIPE_WEBHOOK_SECRET/);
  });

  it('rejects a forged event when the secret is set but empty', async () => {
    // The case `??` and `if (secret)` both read as "not configured", and the
    // one docker-compose actually produced.
    process.env.STRIPE_WEBHOOK_SECRET = '';
    delete process.env.ALLOW_UNSIGNED_WEBHOOKS;

    expect(await callWebhook()).toMatch(/^REJECTED/);
  });

  it('rejects a forged signature when the secret IS configured', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_value';
    const outcome = await callWebhook();
    expect(outcome).toMatch(/^REJECTED/);
    expect(outcome).toMatch(/Invalid Stripe webhook signature/);
  });

  it('does not treat a missing secret as permission, even with the dev flag set in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
    delete process.env.STRIPE_WEBHOOK_SECRET;

    expect(await callWebhook(), 'the dev escape hatch must be unreachable in production').toMatch(
      /^REJECTED/,
    );
  });

  it('lets the explicit dev flag through outside production — and only the explicit flag', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
    delete process.env.STRIPE_WEBHOOK_SECRET;

    // Accepted here because an operator asked for it by name, not because a
    // secret happened to be absent. `payment_intent.succeeded` with no
    // invoiceId in metadata touches no database.
    expect(await callWebhook()).toBe('ACCEPTED');
  });
});
