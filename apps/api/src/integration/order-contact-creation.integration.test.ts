/**
 * A first-time buyer must become a contact — and must not become a marketing
 * recipient.
 *
 * `ingestOrder`'s comment said "Find or create contact" and the code only
 * found. On a miss the order was stored with `contactId: null`, which silently
 * skipped everything downstream of it: revenue attribution, the engagement
 * aggregate, and the `order_placed` / `purchase_event` workflow triggers. A
 * customer's first order therefore started no automation at all — and a first
 * order is the normal case for a shop that has just connected, because nothing
 * imports the shop's customers into contacts.
 *
 * The other half is consent. The contact is created `non_subscribed`: it has an
 * address but no marketing opt-in, which is precisely what the enum comment
 * says that status means. Two independent things then keep marketing away from
 * it — `resolveAudience` excludes `non_subscribed` in SQL, and the contact
 * belongs to no list — while transactional and behaviour-triggered messages,
 * which rest on contract rather than consent, still work. That is the same
 * posture Klaviyo, Omnisend and Shopify itself take for a guest checkout.
 *
 * No GDPR consent record is written. We have none to write: the order payload
 * carries no opt-in we read, and processing purposes are defined per org. A
 * fabricated consent row would be worse than the silent null it replaces.
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
  contactEngagement,
  workflows,
  workflowRuns,
} from '../db/schema/index.js';
import {
  ecommerceConnections,
  ecommerceOrders,
  type EcommerceConnection,
} from '../db/schema/ecommerce-integrations.js';
import { ingestOrder } from '../services/ecommerce/index.js';
import { resolveAudience } from '../services/campaigns/auto-resend.js';
import { checkSendConsent } from '../services/gdpr/send-guardrail.js';

let app: FastifyInstance;
const tag = randomUUID().slice(0, 8);
const orgIds: string[] = [];

let orgId: string;
let conn: EcommerceConnection;

async function makeOrg(label: string): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `ord ${label} ${tag}`, slug: `ord-${label}-${tag}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  return org!.id;
}

async function makeConnection(forOrg: string): Promise<EcommerceConnection> {
  const [row] = await db
    .insert(ecommerceConnections)
    .values({
      orgId: forOrg,
      platform: 'shopify',
      status: 'active',
      credentials: { shopDomain: `s-${tag}.myshopify.com`, accessToken: 't', webhookSecret: 'w' },
      name: `Shopify ${tag}`,
    })
    .returning();
  return row!;
}

let orderSeq = 0;
function order(email: string | null, amount = '250.00') {
  return {
    externalOrderId: `${tag}-${++orderSeq}`,
    customerEmail: email,
    status: 'paid',
    totalAmount: amount,
    currency: 'CZK',
    items: [{ sku: 'SKU-1', name: 'Thing', qty: 1, price: parseFloat(amount), productId: 'p1' }],
    orderedAt: new Date(),
  };
}

const contactByEmail = async (forOrg: string, email: string) =>
  (
    await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, forOrg), eq(contacts.email, email.toLowerCase())))
  )[0];

const orderRow = async (externalOrderId: string) =>
  (
    await db
      .select()
      .from(ecommerceOrders)
      .where(eq(ecommerceOrders.externalOrderId, externalOrderId))
  )[0];

/** Insert an active workflow straight into the org — the triggers read this table. */
async function activeWorkflow(
  forOrg: string,
  triggerType: 'purchase_event' | 'api_event',
  triggerConfig: Record<string, unknown> = {},
): Promise<string> {
  const [wf] = await db
    .insert(workflows)
    .values({
      orgId: forOrg,
      name: `${tag} ${triggerType}`,
      status: 'active',
      triggerType,
      triggerConfig,
      nodes: [
        { id: 't', type: 'trigger', config: {} },
        { id: 'e1', type: 'send_email', config: { subject: 'probe' } },
      ],
      edges: [{ id: 'x', source: 't', target: 'e1' }],
    })
    .returning({ id: workflows.id });
  return wf!.id;
}

/**
 * Triggers are fire-and-forget. Wait for a run, then hold and re-read: settling
 * early would let a double-fire read as a single.
 */
async function settledRunCount(workflowId: string, timeoutMs = 15_000): Promise<number> {
  const count = async () =>
    (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowId, workflowId))
    )[0]!.n;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await count()) >= 1) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await new Promise((r) => setTimeout(r, 1200));
  return count();
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  orgId = await makeOrg('main');
  conn = await makeConnection(orgId);
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  await app?.close();
});

describe('a first-time buyer becomes a contact', () => {
  it('an order from an unknown address creates one, and the order points at it', async () => {
    const email = `newbuyer-${tag}@example.test`;
    expect(
      await contactByEmail(orgId, email),
      'precondition: nobody by this address',
    ).toBeUndefined();

    const o = order(email);
    await ingestOrder(conn, o);

    const contact = await contactByEmail(orgId, email);
    expect(contact, 'the buyer must exist as a contact').toBeDefined();

    const row = await orderRow(o.externalOrderId);
    expect(row!.contactId, 'the order must point at the contact, not at null').toBe(contact!.id);
  });

  it('created without a marketing opt-in — non_subscribed, not active', async () => {
    const contact = await contactByEmail(orgId, `newbuyer-${tag}@example.test`);
    // "Has an address but no marketing opt-in", per the enum's own comment.
    expect(contact!.status).toBe('non_subscribed');
    expect(contact!.lifecycleStage, 'they bought something').toBe('customer');
    expect(contact!.source).toBe('ecommerce_order');
    expect(contact!.sourceDetails).toMatchObject({
      platform: 'shopify',
      externalOrderId: expect.any(String),
    });
  });

  it('revenue attribution and the engagement aggregate now run', async () => {
    const contact = await contactByEmail(orgId, `newbuyer-${tag}@example.test`);
    const [agg] = await db
      .select()
      .from(contactEngagement)
      .where(eq(contactEngagement.contactId, contact!.id));

    // All of this sat behind `if (contactId && ...)` and was skipped entirely.
    expect(agg, 'the aggregate is written only when there is a contact').toBeDefined();
    expect(agg!.totalOrders).toBe(1);
    expect(Number(agg!.totalRevenue)).toBe(250);
  });

  it('an order with no email address creates nobody', async () => {
    const before = (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
    )[0]!.n;

    const o = order(null);
    await ingestOrder(conn, o);

    const after = (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
    )[0]!.n;
    expect(after, 'there is nothing to key a contact on').toBe(before);
    expect((await orderRow(o.externalOrderId))!.contactId).toBeNull();
  });
});

describe('the workflow triggers fire for that buyer', () => {
  it('purchase_event starts a run — the whole point of the fix', async () => {
    const org2 = await makeOrg('wf');
    const conn2 = await makeConnection(org2);
    const wf = await activeWorkflow(org2, 'purchase_event');

    await ingestOrder(conn2, order(`wfbuyer-${tag}@example.test`));

    // Before the fix contactId was null, the whole `if` was skipped, and this
    // stayed at 0: a first-time buyer started no automation at all.
    expect(await settledRunCount(wf), 'a first order must start the workflow').toBe(1);
  }, 40_000);

  it('order_placed reaches an api_event workflow too', async () => {
    const org3 = await makeOrg('ev');
    const conn3 = await makeConnection(org3);
    const wf = await activeWorkflow(org3, 'api_event', { eventName: 'order_placed' });

    await ingestOrder(conn3, order(`evbuyer-${tag}@example.test`));

    expect(await settledRunCount(wf)).toBe(1);
  }, 40_000);
});

describe('the new contact cannot receive marketing', () => {
  it('resolveAudience excludes it even when it is on the campaign’s list', async () => {
    const orgM = await makeOrg('mkt');
    const connM = await makeConnection(orgM);
    await ingestOrder(connM, order(`mkt-${tag}@example.test`));
    const contact = await contactByEmail(orgM, `mkt-${tag}@example.test`);
    expect(contact!.status).toBe('non_subscribed');

    // Put it on a list and point a campaign at that list — the most favourable
    // possible conditions for it to be picked up.
    const { lists, contactLists } = await import('../db/schema/index.js');
    const { campaigns } = await import('../db/schema/index.js');
    const [list] = await db
      .insert(lists)
      .values({ orgId: orgM, name: `list ${tag}` })
      .returning({ id: lists.id });
    await db.insert(contactLists).values({ contactId: contact!.id, listId: list!.id });
    const [camp] = await db
      .insert(campaigns)
      .values({ orgId: orgM, name: `camp ${tag}`, subject: 's', listId: list!.id })
      .returning({ id: campaigns.id });

    const audience = await resolveAudience(orgM, camp!.id);
    expect(audience, 'a non_subscribed contact is not a marketing recipient').not.toContain(
      contact!.id,
    );

    // And the same list resolves a normally-subscribed contact, so the
    // exclusion above is the status doing the work rather than an empty query.
    const [ok] = await db
      .insert(contacts)
      .values({ orgId: orgM, email: `optin-${tag}@example.test`, status: 'active' })
      .returning({ id: contacts.id });
    await db.insert(contactLists).values({ contactId: ok!.id, listId: list!.id });
    expect(await resolveAudience(orgM, camp!.id)).toContain(ok!.id);
  }, 40_000);

  it('the GDPR guardrail blocks it once the org configures the purpose', async () => {
    const orgG = await makeOrg('gdpr');
    const connG = await makeConnection(orgG);
    await ingestOrder(connG, order(`gdpr-${tag}@example.test`));
    const contact = await contactByEmail(orgG, `gdpr-${tag}@example.test`);

    const { processingPurposes } = await import('../db/schema/index.js');
    await db.insert(processingPurposes).values({
      orgId: orgG,
      slug: 'marketing_emails',
      name: 'Marketing e-mails',
      legalBasis: 'consent',
    });

    const check = await checkSendConsent(orgG, contact!.id, 'marketing_emails');
    // No consent record is written on ingest, so the guardrail has nothing to
    // grant on — which is the honest outcome, not an oversight.
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe('no_consent');
  }, 40_000);
});

describe('an address we already know', () => {
  it('is found, not duplicated, and its status is left alone', async () => {
    const orgE = await makeOrg('dup');
    const connE = await makeConnection(orgE);
    const email = `known-${tag}@example.test`;

    // Someone who opted in earlier, through a signup form.
    const [existing] = await db
      .insert(contacts)
      .values({ orgId: orgE, email, status: 'active', source: 'form', firstName: 'Known' })
      .returning({ id: contacts.id });

    await ingestOrder(connE, order(email));

    const rows = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgE), eq(contacts.email, email)));
    expect(rows.length, 'no duplicate').toBe(1);
    expect(rows[0]!.id).toBe(existing!.id);
    // Buying does not demote a subscriber. Overwriting `active` with
    // `non_subscribed` would silently unsubscribe someone for placing an order.
    expect(rows[0]!.status, 'an existing opt-in survives a purchase').toBe('active');
    expect(rows[0]!.source, 'and its provenance is not rewritten').toBe('form');
  }, 40_000);

  it('an unsubscribed buyer is not resurrected by placing an order', async () => {
    const orgU = await makeOrg('unsub');
    const connU = await makeConnection(orgU);
    const email = `left-${tag}@example.test`;
    await db.insert(contacts).values({ orgId: orgU, email, status: 'unsubscribed' });

    await ingestOrder(connU, order(email));

    const row = await contactByEmail(orgU, email);
    expect(row!.status, 'leaving stays left').toBe('unsubscribed');
  }, 40_000);
});
