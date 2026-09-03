/**
 * The address we hand to Shopify has to be an address we answer on.
 *
 * `registerShopifyWebhooks` built it as `${base}/${topic.replace('/','_')}` —
 * `/api/v1/ecommerce/webhooks/shopify/orders_create`. The only mounted route is
 * the exact path `/api/v1/ecommerce/webhooks/shopify`: no parameter, no
 * wildcard. Every webhook we registered pointed at a 404, so the Shopify
 * integration only ever worked for a shop whose owner had set the URL by hand.
 *
 * The first test is the one that matters, and it is deliberately not a string
 * comparison: it takes the URL the registration actually sends to Shopify and
 * resolves it against the running app's own routing table via `findRoute`.
 * #124 established that boot-level measurement against the real table catches
 * what grep does not — grep would have happily matched the shared prefix.
 *
 * The rest holds the other half of the promise: a topic we register is a topic
 * we process. Anything we cannot process, we stop registering.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHmac } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations } from '../db/schema/index.js';
import {
  ecommerceConnections,
  ecommerceOrders,
  ecommerceWebhookEvents,
} from '../db/schema/ecommerce-integrations.js';
import { registerShopifyWebhooks } from '../services/ecommerce/index.js';

let app: FastifyInstance;
/** Fastify's real router, not a string match. */
let findRoute: (opts: { method: string; url: string }) => unknown;

const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 250) + 1)}`;

const SECRET = `whsec-${tag}`;

interface Shop {
  orgId: string;
  connectionId: string;
  domain: string;
}

async function makeShop(label: string): Promise<Shop> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `reg ${label} ${tag}`, slug: `reg-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);

  const domain = `${label}-${tag}.myshopify.com`;
  const [conn] = await db
    .insert(ecommerceConnections)
    .values({
      orgId: org!.id,
      platform: 'shopify',
      status: 'active',
      credentials: { shopDomain: domain, accessToken: `tok-${label}`, webhookSecret: SECRET },
      name: `Shopify ${label}`,
    })
    .returning({ id: ecommerceConnections.id });

  return { orgId: org!.id, connectionId: conn!.id, domain };
}

/**
 * Run the registration against a stubbed `fetch` and collect what it would
 * have told Shopify. This is the registration's real output, not a re-derived
 * copy of it.
 */
async function captureRegistration(
  base: string | undefined,
): Promise<{ topic: string; address: string }[]> {
  const sent: { topic: string; address: string }[] = [];
  const stub = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as {
      webhook?: { topic?: string; address?: string };
    };
    sent.push({ topic: body.webhook?.topic ?? '', address: body.webhook?.address ?? '' });
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  });

  const realFetch = globalThis.fetch;
  const realBase = process.env.API_BASE_URL;
  globalThis.fetch = stub as unknown as typeof fetch;
  if (base === undefined) delete process.env.API_BASE_URL;
  else process.env.API_BASE_URL = base;

  try {
    await registerShopifyWebhooks(`shop-${tag}.myshopify.com`, 'tok');
  } finally {
    globalThis.fetch = realFetch;
    if (realBase === undefined) delete process.env.API_BASE_URL;
    else process.env.API_BASE_URL = realBase;
  }
  return sent;
}

/** A signed Shopify webhook, the way Shopify signs one. */
function post(shop: Shop, topic: string, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const hmac = createHmac('sha256', SECRET).update(body, 'utf8').digest('base64');
  return app.inject({
    method: 'POST',
    url: '/api/v1/ecommerce/webhooks/shopify',
    payload: body,
    headers: {
      'content-type': 'application/json',
      'x-shopify-shop-domain': shop.domain,
      'x-shopify-topic': topic,
      'x-shopify-hmac-sha256': hmac,
    },
    remoteAddress: nextAddress(),
  });
}

function order(id: number, email: string) {
  return {
    id,
    order_number: id,
    email,
    total_price: '10.00',
    currency: 'USD',
    line_items: [{ sku: 'S1', title: 'Thing', quantity: 1, price: '10.00' }],
    created_at: new Date().toISOString(),
  };
}

const ordersFor = (connectionId: string) =>
  db.select().from(ecommerceOrders).where(eq(ecommerceOrders.connectionId, connectionId));
const eventsFor = (connectionId: string) =>
  db
    .select()
    .from(ecommerceWebhookEvents)
    .where(eq(ecommerceWebhookEvents.connectionId, connectionId));
const statusOf = async (connectionId: string) =>
  (
    await db
      .select({ s: ecommerceConnections.status })
      .from(ecommerceConnections)
      .where(eq(ecommerceConnections.id, connectionId))
  )[0]!.s;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  findRoute = (opts) =>
    (app as unknown as { findRoute: (o: { method: string; url: string }) => unknown }).findRoute(
      opts,
    );
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('the registered address resolves against the app’s own route table', () => {
  it('every address we send to Shopify is one this app answers on', async () => {
    const sent = await captureRegistration('https://api.example.test');
    expect(sent.length, 'registration must send something').toBeGreaterThan(0);

    for (const { topic, address } of sent) {
      const path = new URL(address).pathname;
      expect(
        findRoute({ method: 'POST', url: path }),
        `topic ${topic} registers ${path}, which no route answers`,
      ).toBeTruthy();
    }
  });

  it('the address is absolute — Shopify rejects a relative one at the door', async () => {
    const sent = await captureRegistration('https://api.example.test');
    for (const { address } of sent) {
      expect(() => new URL(address)).not.toThrow();
      expect(address.startsWith('https://api.example.test/')).toBe(true);
    }
  });
});

describe('we register exactly the topics we can process', () => {
  it('orders/create, orders/updated and app/uninstalled — and nothing else', async () => {
    const sent = await captureRegistration('https://api.example.test');
    expect(sent.map((s) => s.topic).sort()).toEqual([
      'app/uninstalled',
      'orders/create',
      'orders/updated',
    ]);
  });

  it('customers/create is no longer registered — nothing reads it', async () => {
    // It was registered and silently dropped. Creating contacts out of a shop's
    // customer list is a consent decision, not plumbing: this codebase does not
    // create a contact even from a paid order. Registering a topic nobody reads
    // is a promise without delivery, so the registration stops making it.
    const sent = await captureRegistration('https://api.example.test');
    expect(sent.map((s) => s.topic)).not.toContain('customers/create');
  });
});

describe('every topic we register is processed on arrival', () => {
  it('orders/create records the order', async () => {
    const shop = await makeShop('oc');
    const res = await post(shop, 'orders/create', order(90001, `a-${tag}@example.test`));
    expect(res.statusCode, res.body).toBe(200);

    const rows = await ordersFor(shop.connectionId);
    expect(rows.length, 'the order must be recorded').toBe(1);
    expect(rows[0]!.externalOrderId).toBe('90001');
  });

  it('orders/updated records it too', async () => {
    const shop = await makeShop('ou');
    const res = await post(shop, 'orders/updated', order(90002, `b-${tag}@example.test`));
    expect(res.statusCode, res.body).toBe(200);
    expect((await ordersFor(shop.connectionId)).length).toBe(1);
  });

  it('app/uninstalled revokes the connection instead of leaving it active', async () => {
    const shop = await makeShop('un');
    expect(await statusOf(shop.connectionId)).toBe('active');

    const res = await post(shop, 'app/uninstalled', { shop_domain: shop.domain });
    expect(res.statusCode, res.body).toBe(200);

    // `revoked` already exists in the enum — "OAuth token revoked / API key
    // deleted" is exactly what an uninstall is. No migration needed.
    expect(await statusOf(shop.connectionId), 'an uninstalled app must not stay active').toBe(
      'revoked',
    );

    const events = await eventsFor(shop.connectionId);
    expect(
      events.some((e) => e.topic === 'app/uninstalled' && e.processed),
      'the uninstall must be recorded as handled',
    ).toBe(true);
  });

  it('a revoked connection stops receiving — the uninstall actually takes effect', async () => {
    const shop = await makeShop('un2');
    await post(shop, 'app/uninstalled', { shop_domain: shop.domain });

    const res = await post(shop, 'orders/create', order(90003, `c-${tag}@example.test`));
    expect(res.statusCode, 'the shop is gone; 204 and nothing recorded').toBe(204);
    expect((await ordersFor(shop.connectionId)).length).toBe(0);
  });
});

describe('a topic we did not ask for', () => {
  it('is answered 200 and changes nothing', async () => {
    const shop = await makeShop('unk');

    // 200, not 4xx: Shopify retries a non-2xx for days and disables the
    // subscription afterwards. An unexpected topic is not worth losing orders.
    const res = await post(shop, 'products/update', { id: 5 });
    expect(res.statusCode, res.body).toBe(200);

    expect((await ordersFor(shop.connectionId)).length, 'must not be read as an order').toBe(0);
    expect(await statusOf(shop.connectionId), 'must not change the connection').toBe('active');
  });
});

describe('without API_BASE_URL the registration refuses rather than guessing', () => {
  it('throws, and sends nothing to Shopify', async () => {
    // It used to fall back to '' and register the relative address
    // `/api/v1/ecommerce/webhooks/shopify/orders_create`. Shopify refuses that,
    // and both callers swallowed the refusal, so the install looked successful
    // and no webhook was ever delivered.
    await expect(captureRegistration(undefined)).rejects.toMatchObject({
      code: 'API_BASE_URL_NOT_CONFIGURED',
    });
  });

  it('a relative or non-absolute value is refused the same way', async () => {
    await expect(captureRegistration('/api')).rejects.toMatchObject({
      code: 'API_BASE_URL_NOT_CONFIGURED',
    });
  });
});
