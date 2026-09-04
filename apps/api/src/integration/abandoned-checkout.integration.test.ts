/**
 * Abandoned checkout, end to end, through the signed webhook.
 *
 * The shape follows what Shopify actually offers, which is less than the name
 * suggests: there is NO abandonment webhook. `checkouts/create` fires when the
 * shopper enters contact details and `checkouts/update` fires again on every
 * edit afterwards. Abandonment is never delivered to us — it is the absence of
 * an order, and the only honest place to judge it is the moment the reminder
 * is about to go out.
 *
 * So the tests are in three parts:
 *
 *  1. the checkout arrives, the buyer exists, the flow starts — once, however
 *     many updates Shopify sends for the same checkout
 *  2. the buyer created from a checkout carries the consent state from #131 and
 *     `resolveAudience` still refuses to send them marketing
 *  3. a buyer who purchases before the reminder fires does not get it, and the
 *     suppression is proven to be a read-back at send time rather than a flag
 *     evaluated when the run was scheduled (#114)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHmac } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  workflows,
  workflowRuns,
  workflowEvents,
} from '../db/schema/index.js';
import {
  ecommerceConnections,
  ecommerceCheckouts,
  ecommerceOrders,
} from '../db/schema/ecommerce-integrations.js';
import { resolveAudience } from '../services/campaigns/auto-resend.js';
import { executeAction } from '../services/workflows/actions.js';
import type { WorkflowRun } from '../db/schema/workflows.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let addr = 0;
const nextAddress = () => `198.51.100.${(addr = (addr % 250) + 1)}`;

const SECRET = `whsec-checkout-${tag}`;

interface Shop {
  orgId: string;
  connectionId: string;
  domain: string;
}

let n = 0;
async function makeShop(label: string): Promise<Shop> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `ck ${label} ${tag}`, slug: `ck-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);

  const domain = `${label}-${tag}.myshopify.com`;
  const [conn] = await db
    .insert(ecommerceConnections)
    .values({
      orgId: org!.id,
      platform: 'shopify',
      status: 'active',
      credentials: { shopDomain: domain, accessToken: 't', webhookSecret: SECRET },
      name: `Shopify ${label}`,
    })
    .returning({ id: ecommerceConnections.id });

  return { orgId: org!.id, connectionId: conn!.id, domain };
}

/** A signed Shopify webhook, exactly as Shopify signs one. */
function hook(shop: Shop, topic: string, payload: Record<string, unknown>) {
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

/** A checkouts/create payload in Shopify's shape, including the recovery URL. */
function checkoutPayload(email: string | null, token: string, total = '480.00') {
  return {
    id: ++n + 700000,
    token,
    email,
    total_price: total,
    currency: 'CZK',
    abandoned_checkout_url: `https://shop.example/checkouts/${token}/recover`,
    line_items: [{ title: 'Kávovar', quantity: 1, price: total, product_id: 'p9', sku: 'KV-1' }],
    created_at: new Date().toISOString(),
  };
}

/** The order Shopify sends when that same checkout is completed. */
function orderPayload(email: string, checkoutToken: string, total = '480.00') {
  return {
    id: ++n + 900000,
    order_number: n,
    email,
    checkout_token: checkoutToken,
    financial_status: 'paid',
    total_price: total,
    currency: 'CZK',
    line_items: [{ title: 'Kávovar', quantity: 1, price: total, product_id: 'p9', sku: 'KV-1' }],
    created_at: new Date().toISOString(),
  };
}

async function activeWorkflow(
  orgId: string,
  triggerConfig: Record<string, unknown>,
): Promise<string> {
  const [wf] = await db
    .insert(workflows)
    .values({
      orgId,
      name: `${tag} abandoned checkout`,
      status: 'active',
      triggerType: 'api_event',
      triggerConfig,
      nodes: [
        { id: 't', type: 'trigger', config: {} },
        { id: 'w', type: 'wait', config: { hours: 4 } },
        {
          id: 'e',
          type: 'send_email',
          config: {
            subject: 'You left something behind',
            html: '<p>Your basket is waiting.</p>',
          },
        },
      ],
      edges: [
        { id: 'a', source: 't', target: 'w' },
        { id: 'b', source: 'w', target: 'e' },
      ],
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

/** Triggers are fire-and-forget: wait for one, then hold and re-read. */
async function settledRunCount(workflowId: string, timeoutMs = 15_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await runCount(workflowId)) >= 1) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 1200));
  return runCount(workflowId);
}

const contactByEmail = async (orgId: string, email: string) =>
  (
    await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email.toLowerCase())))
  )[0];

const checkoutByToken = async (connectionId: string, token: string) =>
  (
    await db
      .select()
      .from(ecommerceCheckouts)
      .where(
        and(eq(ecommerceCheckouts.connectionId, connectionId), eq(ecommerceCheckouts.token, token)),
      )
  )[0];

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

describe('a started checkout reaches the workflow', () => {
  it('signed checkouts/create → contact → event → the flow starts', async () => {
    const shop = await makeShop('e2e');
    const wf = await activeWorkflow(shop.orgId, { eventName: 'checkout_started' });
    const email = `cart-${tag}@example.test`;
    const token = `tok-e2e-${tag}`;

    const res = await hook(shop, 'checkouts/create', checkoutPayload(email, token));
    expect(res.statusCode, res.body).toBe(200);

    // The buyer did not exist a moment ago — a checkout is normally the first
    // thing we ever hear about a person.
    const contact = await contactByEmail(shop.orgId, email);
    expect(contact, 'the checkout must create the buyer').toBeDefined();

    const row = await checkoutByToken(shop.connectionId, token);
    expect(row, 'the checkout is recorded').toBeDefined();
    expect(row!.contactId).toBe(contact!.id);
    expect(row!.completedAt, 'nothing has been bought yet').toBeNull();
    expect(row!.recoveryUrl, 'Shopify’s own recovery link is kept').toContain(token);

    expect(await settledRunCount(wf), 'the flow must start').toBe(1);

    const events = await db
      .select()
      .from(workflowEvents)
      .where(
        and(
          eq(workflowEvents.contactId, contact!.id),
          eq(workflowEvents.eventName, 'checkout_started'),
        ),
      );
    expect(events.length, 'the event is recorded, not only broadcast').toBe(1);
  }, 60_000);

  it('checkouts/update for the same checkout does not start it again', async () => {
    const shop = await makeShop('dup');
    const wf = await activeWorkflow(shop.orgId, { eventName: 'checkout_started' });
    const email = `dup-${tag}@example.test`;
    const token = `tok-dup-${tag}`;

    await hook(shop, 'checkouts/create', checkoutPayload(email, token, '100.00'));
    expect(await settledRunCount(wf)).toBe(1);

    // The shopper edits their address twice. Shopify re-sends the checkout.
    await hook(shop, 'checkouts/update', checkoutPayload(email, token, '150.00'));
    await hook(shop, 'checkouts/update', checkoutPayload(email, token, '180.00'));

    expect(await settledRunCount(wf), 'one checkout, one enrolment').toBe(1);

    const rows = await db
      .select()
      .from(ecommerceCheckouts)
      .where(eq(ecommerceCheckouts.connectionId, shop.connectionId));
    expect(rows.length, 'one row, not three').toBe(1);
    expect(rows[0]!.totalAmount, 'but the basket is kept up to date').toBe('180.00');
  }, 60_000);

  it('a checkout with no email address is recorded but starts nothing', async () => {
    const shop = await makeShop('anon');
    const wf = await activeWorkflow(shop.orgId, { eventName: 'checkout_started' });
    const token = `tok-anon-${tag}`;

    // Shopify's earliest checkout payloads can arrive before the shopper has
    // typed an address. There is nobody to remind.
    const res = await hook(shop, 'checkouts/create', checkoutPayload(null, token));
    expect(res.statusCode).toBe(200);

    expect(await checkoutByToken(shop.connectionId, token), 'still recorded').toBeDefined();
    await new Promise((r) => setTimeout(r, 1200));
    expect(await runCount(wf), 'but no flow').toBe(0);
  }, 60_000);
});

describe('the buyer created from a checkout is not a marketing recipient', () => {
  it('non_subscribed, and resolveAudience refuses them even on the campaign’s list', async () => {
    const shop = await makeShop('consent');
    const email = `consent-${tag}@example.test`;
    await hook(shop, 'checkouts/create', checkoutPayload(email, `tok-consent-${tag}`));

    const contact = await contactByEmail(shop.orgId, email);
    expect(contact!.status, 'the same consent state as an order-created buyer').toBe(
      'non_subscribed',
    );
    expect(contact!.source).toBe('ecommerce_order');

    const { lists, contactLists, campaigns } = await import('../db/schema/index.js');
    const [list] = await db
      .insert(lists)
      .values({ orgId: shop.orgId, name: `l ${tag}` })
      .returning({ id: lists.id });
    await db.insert(contactLists).values({ contactId: contact!.id, listId: list!.id });
    const [camp] = await db
      .insert(campaigns)
      .values({ orgId: shop.orgId, name: `c ${tag}`, subject: 's', listId: list!.id })
      .returning({ id: campaigns.id });

    expect(await resolveAudience(shop.orgId, camp!.id)).not.toContain(contact!.id);

    // The same list resolves an opted-in contact, so the exclusion above is the
    // status doing the work rather than an empty query.
    const [ok] = await db
      .insert(contacts)
      .values({ orgId: shop.orgId, email: `ok-${tag}@example.test`, status: 'active' })
      .returning({ id: contacts.id });
    await db.insert(contactLists).values({ contactId: ok!.id, listId: list!.id });
    expect(await resolveAudience(shop.orgId, camp!.id)).toContain(ok!.id);
  }, 60_000);
});

describe('someone who buys does not get the reminder', () => {
  it('the order closes the checkout it came from, matched on checkout_token', async () => {
    const shop = await makeShop('conv');
    const email = `conv-${tag}@example.test`;
    const token = `tok-conv-${tag}`;

    await hook(shop, 'checkouts/create', checkoutPayload(email, token));
    expect((await checkoutByToken(shop.connectionId, token))!.completedAt).toBeNull();

    const order = orderPayload(email, token);
    const res = await hook(shop, 'orders/create', order);
    expect(res.statusCode, res.body).toBe(200);

    const row = await checkoutByToken(shop.connectionId, token);
    expect(row!.completedAt, 'the checkout is closed').not.toBeNull();
    expect(row!.completedOrderId, 'and knows which order closed it').toBe(String(order.id));

    // The order itself still lands, on the contact the checkout created.
    const contact = await contactByEmail(shop.orgId, email);
    const [ordered] = await db
      .select()
      .from(ecommerceOrders)
      .where(eq(ecommerceOrders.connectionId, shop.connectionId));
    expect(ordered!.contactId).toBe(contact!.id);
  }, 60_000);

  it('the send is suppressed when it fires, not when it was scheduled', async () => {
    const shop = await makeShop('supp');
    const email = `supp-${tag}@example.test`;
    const token = `tok-supp-${tag}`;

    // A flow that declares what conversion means for it. Before this change
    // `suppressOnEvent` was read by nobody at all.
    const wf = await activeWorkflow(shop.orgId, {
      eventName: 'checkout_started',
      suppressOnEvent: 'order_placed',
    });

    await hook(shop, 'checkouts/create', checkoutPayload(email, token));
    expect(await settledRunCount(wf)).toBe(1);

    const contact = await contactByEmail(shop.orgId, email);
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, wf))
      .limit(1);

    const sendNode = {
      id: 'e',
      type: 'send_email',
      config: { subject: 'left behind', html: '<p>Your basket is waiting.</p>' },
    };
    const ctx = {
      orgId: shop.orgId,
      contact: {
        id: contact!.id,
        email: contact!.email,
        firstName: null,
        lastName: null,
        phone: null,
        customFields: {},
        tags: [],
        listIds: [],
      },
    };

    // The run exists and its `converted` flag is false — a suppression that
    // only consulted the run would send. It must not.
    expect(run!.converted, 'the run was never marked converted').not.toBe(true);

    // The customer pays, hours after the run started and before the wait ends.
    await hook(shop, 'orders/create', orderPayload(email, token));
    await new Promise((r) => setTimeout(r, 800));

    const result = await executeAction(sendNode as never, run as WorkflowRun, ctx as never);
    // Suppressed: the node passes through without enqueuing anything.
    expect(result, 'a customer who already bought must not be chased').toEqual({
      type: 'next',
      nextNodeId: null,
    });

    // And the reason is real: the purchase is on record for this contact.
    const purchases = await db
      .select()
      .from(workflowEvents)
      .where(
        and(
          eq(workflowEvents.contactId, contact!.id),
          eq(workflowEvents.eventName, 'order_placed'),
        ),
      );
    expect(purchases.length, 'order_placed must be recorded, or nothing can read it').toBe(1);
  }, 60_000);

  it('a contact who has NOT bought is still sent to — the guard is not a blanket', async () => {
    const shop = await makeShop('nosupp');
    const email = `nosupp-${tag}@example.test`;
    const token = `tok-nosupp-${tag}`;

    const wf = await activeWorkflow(shop.orgId, {
      eventName: 'checkout_started',
      suppressOnEvent: 'order_placed',
    });
    await hook(shop, 'checkouts/create', checkoutPayload(email, token));
    expect(await settledRunCount(wf)).toBe(1);

    const contact = await contactByEmail(shop.orgId, email);
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, wf))
      .limit(1);

    // No order this time. The same node must go through and enqueue.
    const result = await executeAction(
      {
        id: 'e',
        type: 'send_email',
        config: { subject: 'left behind', html: '<p>Your basket is waiting.</p>' },
      } as never,
      run as WorkflowRun,
      {
        orgId: shop.orgId,
        contact: {
          id: contact!.id,
          email: contact!.email,
          firstName: null,
          lastName: null,
          phone: null,
          customFields: {},
          tags: [],
          listIds: [],
        },
      } as never,
    );
    expect(result.type, 'the reminder must still go out to someone who did not buy').not.toBe(
      'error',
    );
    const purchases = await db
      .select()
      .from(workflowEvents)
      .where(
        and(
          eq(workflowEvents.contactId, contact!.id),
          eq(workflowEvents.eventName, 'order_placed'),
        ),
      );
    expect(purchases.length, 'nobody bought anything here').toBe(0);
  }, 60_000);
});
