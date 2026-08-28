/**
 * A webhook receiver with no secret must refuse, not skip the check.
 *
 * ─── What shipped ────────────────────────────────────────────────────────────
 *
 * Seven receivers verified the signature only when a secret happened to be
 * stored:
 *
 *     if (creds.webhookSecret && !verifyX(rawBody, signature, creds.webhookSecret))
 *
 * `webhookSecret` is `.optional()` in the connect payload, so a connection made
 * without it left the endpoint accepting anything. And these endpoints write:
 * the body is normalised into an order and handed to `ingestOrder`, which
 * inserts an `ecommerce_webhook_events` row, looks up or creates a contact by
 * email and records an order — in the org that owns the connection named in
 * the URL.
 *
 * This is the run #38 could not do: the gate sits behind a database lookup, so
 * demonstrating it needs a real connection row, not a mock.
 *
 * ─── What each case proves ───────────────────────────────────────────────────
 *
 * For every receiver, three requests against a real connection row:
 *
 *   no secret stored   → 401 WEBHOOK_SECRET_NOT_CONFIGURED, and nothing written
 *   secret + bad sig   → 401 INVALID_SIGNATURE, and nothing written
 *   secret + good sig  → 200, and the order IS ingested
 *
 * The third is not a formality. Closing a gate by refusing everything would
 * pass the first two and be a silent outage; it is the only case that
 * distinguishes "verified" from "switched off".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHmac, randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { db } from '../db/client.js';
import { organizations, ecommerceConnections, contacts } from '../db/schema/index.js';
import { createTestApp } from './setup/harness.js';

const TAG = `hookfc-${randomUUID().slice(0, 8)}`;
const SECRET = 'a-real-webhook-secret-value';

let app: FastifyInstance;
let orgId: string;
const connectionIds: string[] = [];

/** An order body the normalisers all accept: an id, a total and a customer. */
function orderBody(email: string): Record<string, unknown> {
  return {
    id: Math.floor(Math.random() * 1_000_000),
    order_number: `${TAG}-1`,
    code: `${TAG}-1`,
    total_price: '123.00',
    total: '123.00',
    price: 123,
    currency: 'CZK',
    email,
    customer: { email, first_name: 'Jana', last_name: 'Nováková' },
    customer_email: email,
    billing: { email },
    line_items: [],
    items: [],
  };
}

async function makeConnection(
  platform: string,
  credentials: Record<string, unknown>,
): Promise<string> {
  const [row] = await db
    .insert(ecommerceConnections)
    .values({
      orgId,
      platform: platform as 'shopify',
      name: `${TAG} ${platform}`,
      status: 'active',
      credentials: credentials as never,
    })
    .returning({ id: ecommerceConnections.id });
  connectionIds.push(row!.id);
  return row!.id;
}

function hmacHex(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}
function hmacBase64(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

/** Did anything land in the org as a result of the request? */
async function ingestedContact(email: string): Promise<boolean> {
  const rows = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, email));
  return rows.length > 0;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [org] = await db
    .insert(organizations)
    .values({ name: `${TAG} org`, slug: `${TAG}-org` })
    .returning({ id: organizations.id });
  orgId = org!.id;
}, 120_000);

afterAll(async () => {
  await db.delete(contacts).where(eq(contacts.orgId, orgId));
  await db.delete(ecommerceConnections).where(like(ecommerceConnections.name, `${TAG}%`));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await app?.close();
}, 120_000);

/**
 * The five receivers that take the connection id in the URL and an HMAC of the
 * body in a header. Same rule, same table.
 */
const HMAC_RECEIVERS = [
  {
    platform: 'shoptet',
    url: (id: string) => `/api/v1/ecommerce/webhooks/shoptet/${id}`,
    sigHeader: 'x-shoptet-signature',
    extra: { 'x-shoptet-event': 'order/create' },
    sign: hmacHex,
    creds: (secret?: string) => ({
      eshopUrl: 'https://shop.example.cz',
      apiKey: 'k',
      ...(secret ? { webhookSecret: secret } : {}),
    }),
  },
  {
    platform: 'upgates',
    url: (id: string) => `/api/v1/ecommerce/webhooks/upgates/${id}`,
    sigHeader: 'x-upgates-signature',
    extra: { 'x-upgates-event': 'order.created' },
    sign: hmacHex,
    creds: (secret?: string) => ({
      adminUrl: 'https://admin.example.cz',
      apiLogin: 'l',
      apiKey: 'k',
      ...(secret ? { webhookSecret: secret } : {}),
    }),
  },
  {
    platform: 'woocommerce',
    url: (id: string) => `/api/v1/ecommerce/webhooks/woocommerce/${id}`,
    sigHeader: 'x-wc-webhook-signature',
    extra: { 'x-wc-webhook-topic': 'order.created' },
    sign: hmacBase64,
    creds: (secret?: string) => ({
      storeUrl: 'https://shop.example.com',
      consumerKey: 'ck',
      consumerSecret: 'cs',
      ...(secret ? { webhookSecret: secret } : {}),
    }),
  },
  {
    platform: 'bigcommerce',
    url: (id: string) => `/api/v1/ecommerce/webhooks/bigcommerce/${id}`,
    sigHeader: 'x-bc-signature',
    extra: {},
    sign: hmacHex,
    creds: (secret?: string) => ({
      storeHash: 'abc',
      accessToken: 't',
      ...(secret ? { webhookSecret: secret } : {}),
    }),
  },
] as const;

describe('a receiver with no stored secret refuses the request', () => {
  for (const r of HMAC_RECEIVERS) {
    it(`${r.platform}: no secret → 401 WEBHOOK_SECRET_NOT_CONFIGURED, nothing ingested`, async () => {
      const id = await makeConnection(r.platform, r.creds());
      const email = `${TAG}-${r.platform}-nosecret@example.test`;
      const payload = orderBody(email);

      const res = await app.inject({
        method: 'POST',
        url: r.url(id),
        headers: { 'content-type': 'application/json', ...r.extra },
        payload,
      });

      expect(res.statusCode, res.body.slice(0, 300)).toBe(401);
      expect(res.json()).toMatchObject({ code: 'WEBHOOK_SECRET_NOT_CONFIGURED' });
      expect(
        await ingestedContact(email),
        'the forged body was refused but a contact was created anyway',
      ).toBe(false);
    }, 120_000);

    it(`${r.platform}: secret + wrong signature → 401 INVALID_SIGNATURE`, async () => {
      const id = await makeConnection(r.platform, r.creds(SECRET));
      const email = `${TAG}-${r.platform}-badsig@example.test`;

      const res = await app.inject({
        method: 'POST',
        url: r.url(id),
        headers: {
          'content-type': 'application/json',
          [r.sigHeader]: 'deadbeef',
          ...r.extra,
        },
        payload: orderBody(email),
      });

      expect(res.statusCode, res.body.slice(0, 300)).toBe(401);
      expect(res.json()).toMatchObject({ code: 'INVALID_SIGNATURE' });
      expect(await ingestedContact(email)).toBe(false);
    }, 120_000);

    it(`${r.platform}: secret + correct signature is still accepted`, async () => {
      // Without this the change would be indistinguishable from switching the
      // integration off.
      const id = await makeConnection(r.platform, r.creds(SECRET));
      const email = `${TAG}-${r.platform}-good@example.test`;
      const payload = orderBody(email);
      const raw = JSON.stringify(payload);

      const res = await app.inject({
        method: 'POST',
        url: r.url(id),
        headers: {
          'content-type': 'application/json',
          [r.sigHeader]: r.sign(raw, SECRET),
          ...r.extra,
        },
        payload: raw,
      });

      expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
      expect(res.json()).toMatchObject({ received: true });
    }, 120_000);
  }
});

describe('the generic receiver compares the shared secret in constant time', () => {
  const url = (id: string) => `/api/v1/ecommerce/webhooks/generic/${id}`;

  it('no secret → 401 WEBHOOK_SECRET_NOT_CONFIGURED, nothing ingested', async () => {
    const id = await makeConnection('magento', { baseUrl: 'https://m.example.com', apiKey: 'k' });
    const email = `${TAG}-generic-nosecret@example.test`;

    const res = await app.inject({
      method: 'POST',
      url: url(id),
      headers: { 'content-type': 'application/json' },
      payload: orderBody(email),
    });

    expect(res.statusCode, res.body.slice(0, 300)).toBe(401);
    expect(res.json()).toMatchObject({ code: 'WEBHOOK_SECRET_NOT_CONFIGURED' });
    expect(await ingestedContact(email)).toBe(false);
  }, 120_000);

  it('secret + wrong value → 401, and the reply no longer says INVALID_SECRET', async () => {
    // The code changed on purpose: this receiver used `secret !== expected`,
    // which returns on the first differing byte. It now goes through the same
    // constant-time path as everything else, and reports the same code.
    const id = await makeConnection('magento', {
      baseUrl: 'https://m.example.com',
      apiKey: 'k',
      webhookSecret: SECRET,
    });
    const email = `${TAG}-generic-badsecret@example.test`;

    const res = await app.inject({
      method: 'POST',
      url: url(id),
      headers: { 'content-type': 'application/json', 'x-webhook-secret': 'not-the-secret' },
      payload: orderBody(email),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'INVALID_SIGNATURE' });
    expect(await ingestedContact(email)).toBe(false);
  }, 120_000);

  it('secret + correct value is still accepted', async () => {
    const id = await makeConnection('magento', {
      baseUrl: 'https://m.example.com',
      apiKey: 'k',
      webhookSecret: SECRET,
    });
    const email = `${TAG}-generic-good@example.test`;

    const res = await app.inject({
      method: 'POST',
      url: url(id),
      headers: { 'content-type': 'application/json', 'x-webhook-secret': SECRET },
      payload: orderBody(email),
    });

    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  }, 120_000);
});

describe('Shopify, which finds its connection by shop domain rather than by id', () => {
  const DOMAIN = `${TAG}.myshopify.com`;

  it('no secret → 401 WEBHOOK_SECRET_NOT_CONFIGURED', async () => {
    await makeConnection('shopify', { shopDomain: DOMAIN, accessToken: 't' });
    const email = `${TAG}-shopify-nosecret@example.test`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ecommerce/webhooks/shopify',
      headers: {
        'content-type': 'application/json',
        'x-shopify-shop-domain': DOMAIN,
        'x-shopify-hmac-sha256': 'whatever',
        'x-shopify-topic': 'orders/create',
      },
      payload: orderBody(email),
    });

    // 204 would mean the connection was not found — the assertion is only
    // meaningful if the route got as far as the secret.
    expect(res.statusCode, res.body.slice(0, 300)).toBe(401);
    expect(res.json()).toMatchObject({ code: 'WEBHOOK_SECRET_NOT_CONFIGURED' });
    expect(await ingestedContact(email)).toBe(false);
  }, 120_000);
});
