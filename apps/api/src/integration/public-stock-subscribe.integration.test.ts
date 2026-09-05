/**
 * A shopper on a product page asking to be told when it is back.
 *
 * `POST /api/v1/back-in-stock/subscribe` required a `contactId` behind
 * `app.authenticate`, so the only caller that could reach it was the merchant's
 * own backend holding a secret key. #133 repaired the half that sends; this is
 * the half that lets a person ask, and the whole chain is exercised here:
 *
 *   fm_pub_ key + email  ->  contact  ->  subscription
 *                        ->  feed reports the SKU back in stock
 *                        ->  the flow runs and the subscription is spent
 *
 * Three things beyond that, and each is a rule the change would be wrong
 * without:
 *
 *   1. secret keys and sessions still work — opening a route must not be a
 *      swap (#86)
 *   2. one org's key cannot subscribe anybody in another, asserted from both
 *      sides (#123)
 *   3. a public endpoint that accepts an address is a way to sign someone else
 *      up, so the bounds on that are asserted rather than described
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  apiKeys,
  suppressions,
  workflows,
  workflowRuns,
  backInStockSubscriptions,
  priceDropSubscriptions,
} from '../db/schema/index.js';
import { ingestProducts } from '../services/product-catalog/feed-ingestion.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 200) + 1)}`;

interface Tenant {
  orgId: string;
  publicKey: string;
  secretKey: string;
}

/** The key store holds sha256(key); the raw value is never persisted. */
async function issueKey(orgId: string, isPublic: boolean): Promise<string> {
  const raw = `${isPublic ? 'fm_pub_' : 'fm_live_'}${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `pubsub ${tag} ${isPublic ? 'pub' : 'secret'}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    isPublic,
  });
  return raw;
}

async function makeTenant(label: string): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `ps ${label} ${tag}`, slug: `ps-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  return {
    orgId: org!.id,
    publicKey: await issueKey(org!.id, true),
    secretKey: await issueKey(org!.id, false),
  };
}

function subscribe(
  key: string,
  payload: Record<string, unknown>,
  path = '/api/v1/back-in-stock/subscribe',
) {
  return app.inject({
    method: 'POST',
    url: path,
    payload,
    headers: { 'x-api-key': key },
    remoteAddress: nextAddress(),
  });
}

function item(sku: string, price: number, stock: number | null) {
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

async function alertWorkflow(orgId: string, eventName: string): Promise<string> {
  const [wf] = await db
    .insert(workflows)
    .values({
      orgId,
      name: `${tag} ${eventName}`,
      status: 'active',
      triggerType: 'api_event',
      triggerConfig: { eventName },
      nodes: [
        { id: 't', type: 'trigger', config: {} },
        { id: 'e', type: 'send_email', config: { subject: 'Back', html: '<p>Back.</p>' } },
      ],
      edges: [{ id: 'x', source: 't', target: 'e' }],
    })
    .returning({ id: workflows.id });
  return wf!.id;
}

const runCount = async (workflowId: string) =>
  (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
  )[0]!.n;

async function settledRunCount(workflowId: string, timeoutMs = 15_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await runCount(workflowId)) >= 1) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 1000));
  return runCount(workflowId);
}

const contactByEmail = async (orgId: string, email: string) =>
  (
    await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email.toLowerCase())))
  )[0];

const subsFor = async (orgId: string) =>
  db.select().from(backInStockSubscriptions).where(eq(backInStockSubscriptions.orgId, orgId));

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('a shopper can ask, and the whole chain runs', () => {
  it('publishable key + email → contact → subscription → restock → notification', async () => {
    const t = await makeTenant('e2e');
    const wf = await alertWorkflow(t.orgId, 'back_in_stock');
    const sku = `SKU-PUB-${tag}`;
    const email = `shopper-${tag}@example.test`;

    await ingestProducts(t.orgId, [item(sku, 990, 0)]);

    const res = await subscribe(t.publicKey, { sku, email });
    expect(res.statusCode, res.body).toBe(202);
    expect(res.json().data.subscribed).toBe(true);

    // The shopper was not a contact a moment ago — this is usually the first
    // thing the shop ever hears about them.
    const contact = await contactByEmail(t.orgId, email);
    expect(contact, 'the address becomes a contact').toBeDefined();
    // The consent decision from #131, unchanged: an address handed over for one
    // notification is not a marketing opt-in.
    expect(contact!.status).toBe('non_subscribed');
    expect(contact!.source).toBe('stock_alert_form');

    const subs = await subsFor(t.orgId);
    expect(subs.length).toBe(1);
    expect(subs[0]!.contactId).toBe(contact!.id);
    expect(subs[0]!.notifiedAt).toBeNull();

    // And #133's half takes it from here.
    await ingestProducts(t.orgId, [item(sku, 990, 6)]);
    expect(await settledRunCount(wf), 'the shopper is notified').toBe(1);
    expect((await subsFor(t.orgId))[0]!.notifiedAt, 'and the subscription is spent').not.toBeNull();
  }, 90_000);

  it('price-drop works the same way from a page', async () => {
    const t = await makeTenant('pd');
    const sku = `SKU-PDP-${tag}`;
    await ingestProducts(t.orgId, [item(sku, 800, 5)]);

    const res = await subscribe(
      t.publicKey,
      { sku, email: `pd-${tag}@example.test` },
      '/api/v1/price-drop/subscribe',
    );
    expect(res.statusCode, res.body).toBe(202);

    const rows = await db
      .select()
      .from(priceDropSubscriptions)
      .where(eq(priceDropSubscriptions.orgId, t.orgId));
    expect(rows.length).toBe(1);
    // The price it watches is the one on the shelf when they asked.
    expect(rows[0]!.priceAtSubscribe).toBe('800.00');
  }, 60_000);
});

describe('opening the route is not a swap', () => {
  it('a secret key still subscribes by contactId, as merchant backends do', async () => {
    const t = await makeTenant('secret');
    const sku = `SKU-SEC-${tag}`;
    const [c] = await db
      .insert(contacts)
      .values({ orgId: t.orgId, email: `sec-${tag}@example.test`, status: 'active' })
      .returning({ id: contacts.id });

    const res = await subscribe(t.secretKey, { sku, contactId: c!.id });
    expect(res.statusCode, res.body).toBe(202);

    const subs = await subsFor(t.orgId);
    expect(subs.length).toBe(1);
    expect(subs[0]!.contactId).toBe(c!.id);
  }, 60_000);

  it('a session still works too', async () => {
    const { login } = await import('./setup/harness.js');
    const session = await login(app);
    const sku = `SKU-SESS-${tag}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/back-in-stock/subscribe',
      payload: { sku, email: `sess-${tag}@example.test` },
      headers: { cookie: session.cookie },
      remoteAddress: nextAddress(),
    });
    expect(res.statusCode, res.body).toBe(202);
  }, 60_000);

  it('no key at all is still refused', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/back-in-stock/subscribe',
      payload: { sku: 'x', email: `anon-${tag}@example.test` },
      remoteAddress: nextAddress(),
    });
    expect(res.statusCode).toBe(401);
  }, 60_000);
});

describe('one org’s key cannot reach another', () => {
  it('neither direction — A’s key subscribes nobody in B, and B’s none in A', async () => {
    const a = await makeTenant('iso-a');
    const b = await makeTenant('iso-b');
    const sku = `SKU-ISO-${tag}`;

    await subscribe(a.publicKey, { sku, email: `iso-a-${tag}@example.test` });
    expect((await subsFor(b.orgId)).length, 'A must not reach B').toBe(0);

    await subscribe(b.publicKey, { sku, email: `iso-b-${tag}@example.test` });
    expect((await subsFor(a.orgId)).length, 'and A gained nothing from B').toBe(1);
    expect((await subsFor(b.orgId)).length).toBe(1);

    // The address exists in both orgs now, as two separate contacts. Neither
    // subscription may point at the other tenant's contact.
    const inA = await contactByEmail(a.orgId, `iso-a-${tag}@example.test`);
    expect((await subsFor(a.orgId))[0]!.contactId).toBe(inA!.id);
  }, 90_000);

  it('a contactId belonging to another org reads as absent, not as theirs', async () => {
    const a = await makeTenant('x-a');
    const b = await makeTenant('x-b');
    const [victim] = await db
      .insert(contacts)
      .values({ orgId: b.orgId, email: `victim-${tag}@example.test`, status: 'active' })
      .returning({ id: contacts.id });

    // A secret key, so contactId is allowed at all — and it still must not
    // resolve outside its own org.
    const res = await subscribe(a.secretKey, { sku: `SKU-X-${tag}`, contactId: victim!.id });
    expect(res.statusCode).toBe(404);
    expect((await subsFor(b.orgId)).length, 'nothing written into B').toBe(0);
    expect((await subsFor(a.orgId)).length, 'and nothing into A either').toBe(0);
  }, 60_000);
});

describe('what bounds the harm of a public subscribe', () => {
  it('a publishable key may not name a contactId at all', async () => {
    const t = await makeTenant('nocid');
    const [c] = await db
      .insert(contacts)
      .values({ orgId: t.orgId, email: `known-${tag}@example.test`, status: 'active' })
      .returning({ id: contacts.id });

    // The key is visible in page source. If it could name a contact id, a page
    // could enumerate ids and subscribe strangers by handle rather than by an
    // address that at least identifies who is being signed up.
    const res = await subscribe(t.publicKey, { sku: `SKU-NC-${tag}`, contactId: c!.id });
    expect(res.statusCode, res.body).toBe(403);
    expect((await subsFor(t.orgId)).length).toBe(0);
  }, 60_000);

  it('asking a hundred times is one subscription, so it is one message', async () => {
    const t = await makeTenant('dedup');
    const sku = `SKU-DUP-${tag}`;
    const email = `dup-${tag}@example.test`;
    await ingestProducts(t.orgId, [item(sku, 100, 0)]);

    for (let i = 0; i < 5; i++) {
      const res = await subscribe(t.publicKey, { sku, email });
      expect(res.statusCode, res.body).toBe(202);
    }

    // The partial unique index is what enforces this, not a read-then-write
    // that two concurrent submissions would both pass.
    expect((await subsFor(t.orgId)).length, 'one pending subscription').toBe(1);
  }, 90_000);

  it('an address that unsubscribed is not re-enrolled by a form', async () => {
    const t = await makeTenant('unsub');
    const email = `left-${tag}@example.test`;
    await db
      .insert(contacts)
      .values({ orgId: t.orgId, email, status: 'unsubscribed' })
      .returning({ id: contacts.id });

    const res = await subscribe(t.publicKey, { sku: `SKU-UN-${tag}`, email });
    // 202 with subscribed:false — the same status code as a success, because
    // answering differently would make this a way to test who is on the list.
    expect(res.statusCode).toBe(202);
    expect(res.json().data.subscribed).toBe(false);
    expect((await subsFor(t.orgId)).length, 'somebody who left stays gone').toBe(0);
  }, 60_000);

  it('a suppressed address is refused the same way', async () => {
    const t = await makeTenant('supp');
    const email = `bounced-${tag}@example.test`;
    await db.insert(contacts).values({ orgId: t.orgId, email, status: 'active' });
    await db.insert(suppressions).values({ orgId: t.orgId, email, reason: 'hard_bounce' });

    const res = await subscribe(t.publicKey, { sku: `SKU-SP-${tag}`, email });
    expect(res.statusCode).toBe(202);
    expect(res.json().data.subscribed).toBe(false);
    expect((await subsFor(t.orgId)).length).toBe(0);
  }, 60_000);

  it('the request must carry an identifier at all', async () => {
    const t = await makeTenant('noid');
    const res = await subscribe(t.publicKey, { sku: `SKU-NI-${tag}` });
    expect(res.statusCode).toBe(400);
  }, 60_000);
});
