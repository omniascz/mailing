/**
 * The browser SDK reports what the API said, and never throws into the page.
 *
 * apiFetch used to answer `null` for every non-2xx, and track() resolved to
 * nothing either way — so a call the API refused looked exactly like one it
 * accepted. That is how track() sent the wrong field name for as long as it
 * existed (probe Z112). The other half of the constraint is just as hard: this
 * runs on a shop's page, so an exception escaping into the shop's own code is
 * worse than a lost event. The outcome is therefore RETURNED — `{ ok, status,
 * error }` — and never thrown.
 *
 * The SDK is the real source, over HTTP, with a publishable key.
 *
 * ─── Negative controls ──────────────────────────────────────────────────────
 *
 * The other SDK calls go through the same apiFetch, and each read its result
 * as `res !== null`. With apiFetch now always returning an object that check
 * would be true for a refusal too, so each is asserted on BOTH sides: accepted
 * → true and the row exists; refused → false.
 *
 * WHAT THIS TEST CANNOT SEE
 * - Node, not a browser: no CORS, no bundle. "Nothing escapes into the page"
 *   is measured as no unhandled rejection in this process while calls are
 *   left un-awaited, the way a page fires them.
 * - The in-app widget path (fetchMessages, the in-app track) needs `document`
 *   and `location`; it is typechecked, not run here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  apiKeys,
  contacts,
  workflowEvents,
  backInStockSubscriptions,
  priceDropSubscriptions,
} from '../db/schema/index.js';
import { ingestProducts } from '../services/product-catalog/feed-ingestion.js';

const TAG = `z113-err-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let base: string;
let orgId: string;
let publicKey: string;
let contactId: string;

interface Result {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: { code: string; message: string };
}
interface WebSdk {
  init(config: { publicKey: string; apiBase: string }): void;
  identify(contactId: string): void;
  track(event: string, properties?: Record<string, unknown>): Promise<Result>;
  notifyWhenBackInStock(sku: string, email: string): Promise<boolean>;
  notifyOnPriceDrop(sku: string, email: string): Promise<boolean>;
  checkoutStarted(cart: Record<string, unknown>): Promise<boolean>;
}
let ForgeMsg: WebSdk;

async function loadWebSdk(): Promise<WebSdk> {
  const file = path.resolve(__dirname, '../../../../packages/web-sdk/src/index.ts');
  const mod = (await import(pathToFileURL(file).href)) as { ForgeMsg: WebSdk };
  return mod.ForgeMsg;
}

function product(sku: string, price: number, stock: number) {
  return {
    externalId: sku,
    sku,
    name: 'Kávovar',
    description: null,
    price,
    currency: 'CZK',
    imageUrl: null,
    url: `https://shop.example/p/${sku}`,
    categories: [],
    stock,
  };
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}`;

  const [org] = await db
    .insert(organizations)
    .values({ name: `sdk ${TAG}`, slug: TAG })
    .returning({ id: organizations.id });
  orgId = org!.id;

  publicKey = `fm_pub_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `web sdk ${TAG}`,
    keyHash: createHash('sha256').update(publicKey).digest('hex'),
    keyPrefix: publicKey.slice(0, 12),
    scopes: [],
    isPublic: true,
  });

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `${TAG}@example.invalid`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;

  ForgeMsg = await loadWebSdk();
  ForgeMsg.init({ publicKey, apiBase: base });
  ForgeMsg.identify(contactId);
}, 60_000);

afterAll(async () => {
  if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
  await app?.close();
});

describe('track() reports the outcome', () => {
  it('an accepted event resolves ok, with the stored event', async () => {
    const res = await ForgeMsg.track(`${TAG}-ok`, { n: 1 });
    expect(res, 'track() must resolve to a result, not to nothing').toBeDefined();
    expect(res.ok, JSON.stringify(res)).toBe(true);
    expect(res.status).toBe(200);
    const event = (res.data as { data: { event: { id: string; eventName: string } } }).data.event;
    expect(event.eventName).toBe(`${TAG}-ok`);

    const [row] = await db.select().from(workflowEvents).where(eq(workflowEvents.id, event.id));
    expect(row?.contactId).toBe(contactId);
  }, 30_000);

  it('a refused event is recognisable: ok false, the status and the API’s own code', async () => {
    // An event name over the route's 255-character limit: a request the API
    // refuses with 400, the same kind of refusal the old field name earned.
    const res = await ForgeMsg.track('x'.repeat(256));
    expect(res, 'track() must resolve to a result, not to nothing').toBeDefined();
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error?.code).toBe('VALIDATION_ERROR');
  }, 30_000);

  it('a contact the org does not have is a 404, not a silent success', async () => {
    ForgeMsg.identify(randomUUID());
    try {
      const res = await ForgeMsg.track(`${TAG}-ghost`);
      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);
      expect(res.error?.code).toBe('NOT_FOUND');
    } finally {
      ForgeMsg.identify(contactId);
    }
  }, 30_000);

  it('nothing escapes into the page — not a refusal, not an unreachable API', async () => {
    const escaped: unknown[] = [];
    const onRejection = (reason: unknown) => escaped.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      // Fired and forgotten, the way a page calls it.
      void ForgeMsg.track('x'.repeat(256));

      // An API that does not answer at all: a port nothing listens on.
      ForgeMsg.init({ publicKey, apiBase: 'http://127.0.0.1:9' });
      ForgeMsg.identify(contactId);
      const unreachable = await ForgeMsg.track(`${TAG}-offline`);
      expect(unreachable.ok).toBe(false);
      expect(unreachable.status).toBe(0);
      expect(unreachable.error?.code).toBe('NETWORK_ERROR');

      await new Promise((r) => setTimeout(r, 500));
      expect(escaped, 'no rejection may reach the page').toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
      ForgeMsg.init({ publicKey, apiBase: base });
      ForgeMsg.identify(contactId);
    }
  }, 30_000);
});

describe('negative control — the other SDK calls still work, and still say when they do not', () => {
  it('notifyWhenBackInStock: accepted → true and a subscription; refused → false', async () => {
    const sku = `SKU-${TAG}`;
    await ingestProducts(orgId, [product(sku, 990, 0)]);

    expect(await ForgeMsg.notifyWhenBackInStock(sku, `bis-${TAG}@example.test`)).toBe(true);
    const subs = await db
      .select()
      .from(backInStockSubscriptions)
      .where(eq(backInStockSubscriptions.orgId, orgId));
    expect(subs).toHaveLength(1);

    expect(await ForgeMsg.notifyWhenBackInStock(sku, 'not-an-address')).toBe(false);
  }, 30_000);

  it('notifyOnPriceDrop: accepted → true and a subscription; refused → false', async () => {
    const sku = `SKU-PD-${TAG}`;
    await ingestProducts(orgId, [product(sku, 800, 5)]);

    expect(await ForgeMsg.notifyOnPriceDrop(sku, `pd-${TAG}@example.test`)).toBe(true);
    const subs = await db
      .select()
      .from(priceDropSubscriptions)
      .where(eq(priceDropSubscriptions.orgId, orgId));
    expect(subs).toHaveLength(1);

    expect(await ForgeMsg.notifyOnPriceDrop(sku, 'not-an-address')).toBe(false);
  }, 30_000);

  it('checkoutStarted (#205): accepted → true and the checkout_started event; refused → false', async () => {
    const email = `cart-${TAG}@example.test`;
    const ok = await ForgeMsg.checkoutStarted({
      email,
      amount: 1299,
      currency: 'CZK',
      itemCount: 3,
      recoveryUrl: 'https://shop.example/kosik',
    });
    expect(ok).toBe(true);

    const [shopper] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)));
    expect(shopper, 'the shopper became a contact').toBeDefined();
    const events = await db
      .select()
      .from(workflowEvents)
      .where(
        and(
          eq(workflowEvents.contactId, shopper!.id),
          eq(workflowEvents.eventName, 'checkout_started'),
        ),
      );
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.properties).toMatchObject({ amount: 1299, itemCount: 3, currency: 'CZK' });

    expect(await ForgeMsg.checkoutStarted({ email: 'not-an-address' })).toBe(false);
  }, 30_000);
});
