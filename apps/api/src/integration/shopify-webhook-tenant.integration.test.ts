/**
 * Two organisations, each with an active Shopify connection. A webhook from
 * one shop must reach that shop's organisation.
 *
 * The receiver used to select every active Shopify connection with
 * `.limit(50)`, destructure `const [conn]` — one row, whichever Postgres
 * returned first — and compare ITS shop domain to the header. With more than
 * one active connection that works for exactly one tenant; everyone else gets
 * a silent 204 and simply never receives their orders.
 *
 * Silent is the operative word, and it is why this is asserted on the DATABASE
 * rather than on the status code. The broken receiver answers 204 and the
 * fixed one answers 204 for a genuinely unknown shop, so the response cannot
 * tell them apart. What tells them apart is whether the order landed.
 *
 * Both directions, per #123: a one-sided check passes against a receiver that
 * drops everything.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHmac } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations } from '../db/schema/index.js';
import {
  ecommerceConnections,
  ecommerceWebhookEvents,
} from '../db/schema/ecommerce-integrations.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

interface Shop {
  label: string;
  orgId: string;
  connectionId: string;
  domain: string;
  secret: string;
}
let A: Shop;
let B: Shop;

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 250) + 1)}`;

async function makeShop(label: string): Promise<Shop> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `shop ${label} ${tag}`, slug: `shop-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);

  const domain = `${label}-${tag}.myshopify.com`;
  const secret = `whsec-${label}-${tag}`;
  const [conn] = await db
    .insert(ecommerceConnections)
    .values({
      orgId: org!.id,
      platform: 'shopify',
      status: 'active',
      credentials: { shopDomain: domain, accessToken: `tok-${label}`, webhookSecret: secret },
      name: `Shopify ${label}`,
    })
    .returning({ id: ecommerceConnections.id });

  return { label, orgId: org!.id, connectionId: conn!.id, domain, secret };
}

/** A real Shopify order webhook, signed the way Shopify signs it. */
function post(shop: Shop, opts: { signWith?: string; email?: string } = {}) {
  const body = JSON.stringify({
    id: Math.floor(Math.random() * 1e9),
    order_number: 1001,
    email: opts.email ?? `buyer-${shop.label}-${tag}@example.test`,
    total_price: '42.00',
    currency: 'USD',
    line_items: [{ sku: 'SKU-1', title: 'Thing', quantity: 1, price: '42.00' }],
    created_at: new Date().toISOString(),
  });
  const hmac = createHmac('sha256', opts.signWith ?? shop.secret)
    .update(body, 'utf8')
    .digest('base64');

  return app.inject({
    method: 'POST',
    url: '/api/v1/ecommerce/webhooks/shopify',
    payload: body,
    headers: {
      'content-type': 'application/json',
      'x-shopify-shop-domain': shop.domain,
      'x-shopify-topic': 'orders/create',
      'x-shopify-hmac-sha256': hmac,
    },
    remoteAddress: nextAddress(),
  });
}

/** Webhook events recorded against a connection — the proof the order arrived. */
async function eventsFor(connectionId: string) {
  return db
    .select({ id: ecommerceWebhookEvents.id })
    .from(ecommerceWebhookEvents)
    .where(eq(ecommerceWebhookEvents.connectionId, connectionId));
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  A = await makeShop('a');
  B = await makeShop('b');
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('each shop’s webhook reaches its own organisation', () => {
  it('shop A’s order lands against org A’s connection', async () => {
    const before = (await eventsFor(A.connectionId)).length;
    const res = await post(A);
    expect(res.statusCode, res.body).toBe(200);
    expect((await eventsFor(A.connectionId)).length, 'A’s order must arrive').toBe(before + 1);
  });

  it('shop B’s order lands against org B’s connection — the half that was broken', async () => {
    // With `limit(50)` + `const [conn]`, whichever connection Postgres returned
    // first won: one of these two tenants received nothing at all.
    const beforeB = (await eventsFor(B.connectionId)).length;
    const beforeA = (await eventsFor(A.connectionId)).length;

    const res = await post(B);
    expect(res.statusCode, res.body).toBe(200);

    expect((await eventsFor(B.connectionId)).length, 'B’s order must arrive').toBe(beforeB + 1);
    expect((await eventsFor(A.connectionId)).length, 'and must not be recorded against A').toBe(
      beforeA,
    );
  });

  it('neither shop’s traffic shows up on the other, in either direction', async () => {
    const a0 = (await eventsFor(A.connectionId)).length;
    const b0 = (await eventsFor(B.connectionId)).length;

    await post(A);
    expect((await eventsFor(B.connectionId)).length, 'A must not reach B').toBe(b0);

    await post(B);
    expect((await eventsFor(A.connectionId)).length, 'B must not reach A').toBe(a0 + 1);
  });
});

describe('the signature still belongs to the shop that sent it', () => {
  it('A’s domain signed with B’s secret is refused', async () => {
    const before = (await eventsFor(A.connectionId)).length;
    const res = await post(A, { signWith: B.secret });
    expect(res.statusCode, res.body).toBe(401);
    expect((await eventsFor(A.connectionId)).length, 'nothing may be recorded').toBe(before);
  });

  it('an unknown shop is answered 204 and recorded nowhere', async () => {
    const a0 = (await eventsFor(A.connectionId)).length;
    const b0 = (await eventsFor(B.connectionId)).length;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ecommerce/webhooks/shopify',
      payload: JSON.stringify({ id: 1 }),
      headers: {
        'content-type': 'application/json',
        'x-shopify-shop-domain': `nobody-${tag}.myshopify.com`,
        'x-shopify-topic': 'orders/create',
        'x-shopify-hmac-sha256': 'irrelevant',
      },
      remoteAddress: nextAddress(),
    });

    // 204, not 404: Shopify retries a non-2xx for days and eventually disables
    // the subscription, and an uninstalled shop is not worth that.
    expect(res.statusCode).toBe(204);
    expect((await eventsFor(A.connectionId)).length).toBe(a0);
    expect((await eventsFor(B.connectionId)).length).toBe(b0);
  });

  it('a paused connection stops receiving, without taking the other tenant down', async () => {
    await db
      .update(ecommerceConnections)
      .set({ status: 'paused' })
      .where(eq(ecommerceConnections.id, A.connectionId));

    const a0 = (await eventsFor(A.connectionId)).length;
    const b0 = (await eventsFor(B.connectionId)).length;

    expect((await post(A)).statusCode, 'paused A is ignored').toBe(204);
    expect((await eventsFor(A.connectionId)).length).toBe(a0);

    // B is still active and must be unaffected — under the old lookup, which
    // row came back first depended on the whole active set.
    expect((await post(B)).statusCode, 'B keeps working').toBe(200);
    expect((await eventsFor(B.connectionId)).length).toBe(b0 + 1);

    await db
      .update(ecommerceConnections)
      .set({ status: 'active' })
      .where(eq(ecommerceConnections.id, A.connectionId));
  });
});
