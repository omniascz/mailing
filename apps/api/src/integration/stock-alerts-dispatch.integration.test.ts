/**
 * Back-in-stock and price-drop alerts, from the feed that notices the change to
 * the subscription that is spent only once something actually went out.
 *
 * What was there before: `notifyRestock` marked EVERY pending subscriber
 * `notifiedAt` and returned a count. No queue, no event, no message. Because
 * `notifiedAt` was set, the subscription was spent and could never fire again —
 * so the feature did not merely fail to send, it destroyed the list while
 * reporting a number that looked like success. `notifyPriceChange` was the same
 * function with a price comparison.
 *
 * Two rules the tests hold to:
 *
 *   1. A subscription is spent only for a subscriber whose notification was
 *      really dispatched. Nothing sent, nothing marked — per subscriber, not in
 *      one blanket UPDATE.
 *   2. The transition is what fires, not the state. A feed that reports the
 *      same stock twice is not a restock, so the second ingest is silent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  products,
  workflows,
  workflowRuns,
  workflowEvents,
  backInStockSubscriptions,
  priceDropSubscriptions,
} from '../db/schema/index.js';
import { ecommerceConnections, ecommerceOrders } from '../db/schema/ecommerce-integrations.js';
import { ingestProducts } from '../services/product-catalog/feed-ingestion.js';
import { notifyRestock } from '../services/back-in-stock/index.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

async function makeOrg(label: string): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `st ${label} ${tag}`, slug: `st-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  return org!.id;
}

async function makeContact(orgId: string, label: string): Promise<string> {
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `${label}-${tag}@example.test`, status: 'active' })
    .returning({ id: contacts.id });
  return c!.id;
}

/** An active workflow listening for one of our event names. */
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
        {
          id: 'e',
          type: 'send_email',
          config: { subject: 'It is back', html: '<p>Back in stock.</p>' },
        },
      ],
      edges: [{ id: 'x', source: 't', target: 'e' }],
    })
    .returning({ id: workflows.id });
  return wf!.id;
}

/** One feed item in the normalized shape the adapters produce. */
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

const runCount = async (workflowId: string) =>
  (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
  )[0]!.n;

/** Triggers are fire-and-forget: wait for one, then hold and re-read. */
async function settledRunCount(workflowId: string, timeoutMs = 15_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await runCount(workflowId)) >= 1) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 1000));
  return runCount(workflowId);
}

const stockSub = async (id: string) =>
  (await db.select().from(backInStockSubscriptions).where(eq(backInStockSubscriptions.id, id)))[0];

const priceSub = async (id: string) =>
  (await db.select().from(priceDropSubscriptions).where(eq(priceDropSubscriptions.id, id)))[0];

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

describe('a product coming back into stock notifies its subscribers', () => {
  it('out of stock → in stock fires the flow and spends the subscription', async () => {
    const orgId = await makeOrg('restock');
    const contactId = await makeContact(orgId, 'waiting');
    const wf = await alertWorkflow(orgId, 'back_in_stock');
    const sku = `SKU-RS-${tag}`;

    // The feed's first pass: the product exists and is out of stock.
    await ingestProducts(orgId, [item(sku, 999, 0)]);

    const [sub] = await db
      .insert(backInStockSubscriptions)
      .values({ orgId, contactId, sku })
      .returning({ id: backInStockSubscriptions.id });
    expect((await stockSub(sub!.id))!.notifiedAt, 'pending to begin with').toBeNull();

    // The next feed says it is back.
    await ingestProducts(orgId, [item(sku, 999, 7)]);

    expect(await settledRunCount(wf), 'the subscriber must be notified').toBe(1);

    const events = await db
      .select()
      .from(workflowEvents)
      .where(
        and(eq(workflowEvents.contactId, contactId), eq(workflowEvents.eventName, 'back_in_stock')),
      );
    expect(events.length, 'the event is on record').toBe(1);
    expect(events[0]!.properties).toMatchObject({ sku });

    // Spent — but only now that something actually went out.
    expect((await stockSub(sub!.id))!.notifiedAt, 'spent after dispatch').not.toBeNull();
  }, 60_000);

  it('the same stock level twice is not a restock', async () => {
    const orgId = await makeOrg('same');
    const contactId = await makeContact(orgId, 'twice');
    const wf = await alertWorkflow(orgId, 'back_in_stock');
    const sku = `SKU-SM-${tag}`;

    await ingestProducts(orgId, [item(sku, 100, 0)]);
    await db.insert(backInStockSubscriptions).values({ orgId, contactId, sku });

    await ingestProducts(orgId, [item(sku, 100, 5)]);
    expect(await settledRunCount(wf)).toBe(1);

    // The feed runs again an hour later, unchanged. Nothing transitioned.
    await ingestProducts(orgId, [item(sku, 100, 5)]);
    await ingestProducts(orgId, [item(sku, 100, 5)]);
    await new Promise((r) => setTimeout(r, 1000));

    expect(await runCount(wf), 'the state is the same; only a transition fires').toBe(1);
  }, 60_000);

  it('a subscription is NOT spent when nothing could be sent', async () => {
    // No workflow listens for back_in_stock in this org, so the dispatch has
    // nowhere to go. The old code marked the subscriber notified regardless and
    // the alert was lost for good.
    const orgId = await makeOrg('nowf');
    const contactId = await makeContact(orgId, 'orphan');
    const sku = `SKU-NW-${tag}`;

    await ingestProducts(orgId, [item(sku, 250, 0)]);
    const [sub] = await db
      .insert(backInStockSubscriptions)
      .values({ orgId, contactId, sku })
      .returning({ id: backInStockSubscriptions.id });

    await ingestProducts(orgId, [item(sku, 250, 3)]);
    await new Promise((r) => setTimeout(r, 1200));

    expect(
      (await stockSub(sub!.id))!.notifiedAt,
      'nothing was sent, so nothing may be spent',
    ).toBeNull();
  }, 60_000);

  it('one subscriber being suppressed does not spend the others', async () => {
    const orgId = await makeOrg('mixed');
    const wf = await alertWorkflow(orgId, 'back_in_stock');
    const sku = `SKU-MX-${tag}`;
    await ingestProducts(orgId, [item(sku, 500, 0)]);

    const buyerId = await makeContact(orgId, 'bought');
    const waiterId = await makeContact(orgId, 'still-waiting');
    const [boughtSub] = await db
      .insert(backInStockSubscriptions)
      .values({ orgId, contactId: buyerId, sku })
      .returning({ id: backInStockSubscriptions.id });
    const [waitSub] = await db
      .insert(backInStockSubscriptions)
      .values({ orgId, contactId: waiterId, sku })
      .returning({ id: backInStockSubscriptions.id });

    // One of them bought the thing elsewhere in the meantime.
    const [conn] = await db
      .insert(ecommerceConnections)
      .values({
        orgId,
        platform: 'shopify',
        status: 'active',
        credentials: { shopDomain: `m-${tag}.myshopify.com`, accessToken: 'a' },
        name: 'shop',
      })
      .returning({ id: ecommerceConnections.id });
    await db.insert(ecommerceOrders).values({
      connectionId: conn!.id,
      orgId,
      externalOrderId: `o-${tag}`,
      contactId: buyerId,
      customerEmail: `bought-${tag}@example.test`,
      totalAmount: '500.00',
      currency: 'CZK',
      items: [{ sku, name: 'Kávovar', qty: 1, price: 500 }],
      orderedAt: new Date(),
    });

    await ingestProducts(orgId, [item(sku, 500, 4)]);
    expect(await settledRunCount(wf), 'only the one who still wants it').toBe(1);

    // Suppressed, and left pending: they were not notified, so the row must not
    // claim they were. A blanket UPDATE could not tell these two apart.
    expect((await stockSub(boughtSub!.id))!.notifiedAt, 'suppressed, not notified').toBeNull();
    expect((await stockSub(waitSub!.id))!.notifiedAt, 'notified, so spent').not.toBeNull();

    const runs = await db
      .select({ contactId: workflowRuns.contactId })
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, wf));
    expect(runs[0]!.contactId, 'and it is the right person').toBe(waiterId);
  }, 60_000);
});

describe('the dispatch itself, called directly', () => {
  it('a returned count of 1 means one message really went out', async () => {
    // This is the shape of the original defect, and the reason it hid: the old
    // function returned { notified: 1 } and set notifiedAt while starting zero
    // runs and recording zero events. The return value looked like success, so
    // nothing upstream could tell that the list had just been consumed for
    // nothing. Measured on the old code:
    //
    //   returned: { notified: 1 }   subscription_notifiedAt: SET
    //   workflow_runs_started: 0    workflow_events_recorded: 0
    const orgId = await makeOrg('direct');
    const contactId = await makeContact(orgId, 'direct');
    const wf = await alertWorkflow(orgId, 'back_in_stock');
    const sku = `SKU-DR-${tag}`;

    await db
      .insert(products)
      .values({ orgId, sku, name: 'Kávovar', price: '999.00', currency: 'CZK', stock: 5 });
    const [sub] = await db
      .insert(backInStockSubscriptions)
      .values({ orgId, contactId, sku })
      .returning({ id: backInStockSubscriptions.id });

    const result = await notifyRestock(orgId, sku);
    expect(result.notified).toBe(1);

    expect(await settledRunCount(wf), 'the count must correspond to a real run').toBe(1);
    const events = await db
      .select()
      .from(workflowEvents)
      .where(
        and(eq(workflowEvents.contactId, contactId), eq(workflowEvents.eventName, 'back_in_stock')),
      );
    expect(events.length, 'and to a real event').toBe(1);
    expect((await stockSub(sub!.id))!.notifiedAt).not.toBeNull();
  }, 60_000);
});

describe('a price drop notifies whoever was watching that price', () => {
  it('a cheaper feed price fires the flow and spends the subscription', async () => {
    const orgId = await makeOrg('drop');
    const contactId = await makeContact(orgId, 'watcher');
    const wf = await alertWorkflow(orgId, 'price_dropped');
    const sku = `SKU-PD-${tag}`;

    await ingestProducts(orgId, [item(sku, 1000, 5)]);
    const [sub] = await db
      .insert(priceDropSubscriptions)
      .values({ orgId, contactId, sku, priceAtSubscribe: '1000.00' })
      .returning({ id: priceDropSubscriptions.id });

    await ingestProducts(orgId, [item(sku, 799, 5)]);

    expect(await settledRunCount(wf)).toBe(1);
    const events = await db
      .select()
      .from(workflowEvents)
      .where(
        and(eq(workflowEvents.contactId, contactId), eq(workflowEvents.eventName, 'price_dropped')),
      );
    expect(events[0]!.properties, 'both prices travel with the event').toMatchObject({
      sku,
      oldPrice: 1000,
      newPrice: 799,
    });
    expect((await priceSub(sub!.id))!.notifiedAt).not.toBeNull();
  }, 60_000);

  it('a price RISE notifies nobody', async () => {
    const orgId = await makeOrg('rise');
    const contactId = await makeContact(orgId, 'riser');
    const wf = await alertWorkflow(orgId, 'price_dropped');
    const sku = `SKU-UP-${tag}`;

    await ingestProducts(orgId, [item(sku, 500, 5)]);
    const [sub] = await db
      .insert(priceDropSubscriptions)
      .values({ orgId, contactId, sku, priceAtSubscribe: '500.00' })
      .returning({ id: priceDropSubscriptions.id });

    await ingestProducts(orgId, [item(sku, 650, 5)]);
    await new Promise((r) => setTimeout(r, 1200));

    expect(await runCount(wf)).toBe(0);
    expect((await priceSub(sub!.id))!.notifiedAt, 'still waiting for a drop').toBeNull();
  }, 60_000);

  it('a drop that does not reach the watched price leaves them waiting', async () => {
    const orgId = await makeOrg('partial');
    const contactId = await makeContact(orgId, 'patient');
    const wf = await alertWorkflow(orgId, 'price_dropped');
    const sku = `SKU-PP-${tag}`;

    // They subscribed when it was already discounted to 400; the catalogue
    // price falls from 900 to 500, which is still above what they are waiting
    // for.
    await ingestProducts(orgId, [item(sku, 900, 5)]);
    const [sub] = await db
      .insert(priceDropSubscriptions)
      .values({ orgId, contactId, sku, priceAtSubscribe: '400.00' })
      .returning({ id: priceDropSubscriptions.id });

    await ingestProducts(orgId, [item(sku, 500, 5)]);
    await new Promise((r) => setTimeout(r, 1200));

    expect(await runCount(wf), 'not below their price').toBe(0);
    expect((await priceSub(sub!.id))!.notifiedAt).toBeNull();
  }, 60_000);
});

describe('the products the feed writes are unchanged in every other respect', () => {
  it('a new product is inserted and an existing one updated, as before', async () => {
    const orgId = await makeOrg('upsert');
    const sku = `SKU-UP2-${tag}`;

    const first = await ingestProducts(orgId, [item(sku, 100, 1)]);
    expect(first).toMatchObject({ inserted: 1, updated: 0 });

    const second = await ingestProducts(orgId, [item(sku, 120, 2)]);
    expect(second).toMatchObject({ inserted: 0, updated: 1 });

    const [row] = await db
      .select()
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.sku, sku)));
    expect(row!.price).toBe('120.00');
    expect(row!.stock).toBe(2);
  }, 60_000);
});
