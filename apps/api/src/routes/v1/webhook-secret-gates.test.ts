import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../index.js';

/**
 * The other two copies of the Stripe gate's shape, on endpoints we ARE
 * launching with. Both read the secret at request time, so the switches can be
 * moved between cases without rebuilding the app.
 *
 *   newsletter-tiers  `if (secret) { verify }`               subscription state
 *   dmarc             `if (secret && header !== secret)`     report ingest
 *
 * The DMARC one was covered in production only because config/env.ts happens to
 * mark DMARC_INBOUND_SECRET prodRequired — a rule in another module, not a
 * property of this endpoint. Anywhere that rule does not run, the endpoint
 * accepted a POST writing a DMARC report against any orgId the caller named.
 */

let app: FastifyInstance;
const ORIGINAL = { ...process.env };

beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  if (app) await app.close();
  process.env = { ...ORIGINAL };
});
beforeEach(() => {
  process.env = { ...ORIGINAL };
  delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
});

describe('newsletter-tiers Stripe webhook', () => {
  const post = (headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/newsletter-tiers/stripe-webhook',
      headers,
      payload: { type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } },
    });

  it('refuses a forged event when the secret is missing', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await post();
    expect(res.statusCode, `answered ${res.statusCode}`).toBe(401);
    expect(res.json()).toMatchObject({ error: expect.stringContaining('STRIPE_WEBHOOK_SECRET') });
  });

  it('refuses a forged event when the secret is set but empty', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = '';
    expect((await post()).statusCode).toBe(401);
  });

  it('refuses a bad signature when the secret IS configured', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_value';
    const res = await post({ 'stripe-signature': 't=1,v1=deadbeef' });
    expect(res.statusCode).toBe(401);
  });
});

describe('DMARC aggregate report ingest', () => {
  const post = (headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/t/dmarc/report',
      headers,
      payload: { orgId: '00000000-0000-0000-0000-0000000000ff', xml: '<feedback/>' },
    });

  it('refuses the report when the secret is missing', async () => {
    delete process.env.DMARC_INBOUND_SECRET;
    const res = await post();
    expect(res.statusCode, `answered ${res.statusCode}`).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('refuses the report when the secret is set but empty', async () => {
    process.env.DMARC_INBOUND_SECRET = '';
    expect((await post()).statusCode).toBe(401);
  });

  it('still refuses a wrong header when the secret IS configured', async () => {
    process.env.DMARC_INBOUND_SECRET = 'a-real-dmarc-secret-16+';
    expect((await post({ 'x-dmarc-secret': 'wrong' })).statusCode).toBe(401);
  });
});
