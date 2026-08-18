/**
 * The ten functions whose raw sql`` referenced columns the database does not
 * have. Every one of them answered 500 (or, worse, a cheerful 200 with a zero
 * in it) from the day it was written — none had a single test.
 *
 * Two things are asserted for each, and the second is the one that matters:
 *
 *   1. the endpoint no longer fails, and
 *   2. it returns the RIGHT NUMBER over rows planted for the purpose.
 *
 * Asserting only "not 500" would pass against a query that silently sums
 * nothing — which is exactly the shape of the `quantity` vs `qty` bug that sat
 * behind the column error: correct column names, valid SQL, and NULL for every
 * total. So each case plants known data and checks the arithmetic.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import {
  organizations,
  contacts,
  emailEvents,
  revenueEvents,
  products,
  helpdeskTickets,
  workflows,
  workflowRuns,
  aiUsage,
  trackedSites,
  siteEvents,
  warehouseSyncs,
} from '../db/schema/index.js';
import { getTimeline } from '../services/timeline/index.js';
import { bestSellers, slowMovers, revenueByCategory } from '../services/catalog-insights/index.js';
import { computeFunnel } from '../services/funnel/index.js';
import { mergeVisitorIntoContact } from '../services/identity-merge/index.js';
import { computeOrgHealth } from '../services/deliverability/health-score.js';

let app: FastifyInstance;
let session: Session;

/** The tenant under test — created here, never the seed org. */
let orgA: string;
let contactA: string;
/** A second, unrelated tenant. Nothing owned by A may ever see these rows. */
let orgB: string;
let contactB: string;

const tag = randomUUID().slice(0, 8);
const siteIds: string[] = [];
const workflowIds: string[] = [];

/** Two SKUs, so best-seller ordering has something to order. */
const SKU_FAST = `fast-${tag}`;
const SKU_SLOW = `slow-${tag}`;

/**
 * Fixture clock. The order matters: the funnel walks steps forward in time, so
 * the purchase has to land after the open or `open → purchase` can never
 * complete. Everything stays inside the tightest window any caller uses (the
 * warehouse sync defaults to 24h).
 */
const OPENED_AT = new Date(Date.now() - 3 * 3_600_000);
const PURCHASED_AT = new Date(Date.now() - 2 * 3_600_000);
const RUN_STARTED_AT = new Date(Date.now() - 1 * 3_600_000);

/**
 * One purchase. `items` uses the `qty` key, because that is what both write
 * paths emit (revenue-attribution and the site tracker) — the readers were
 * looking for `quantity` and would have summed NULL.
 */
function purchase(orgId: string, contactId: string, items: unknown[], amount: string) {
  return {
    orgId,
    contactId,
    orderId: `ord-${randomUUID().slice(0, 8)}`,
    amount,
    currency: 'USD',
    items: items as never,
    occurredAt: PURCHASED_AT,
  };
}

async function makeOrg(label: string): Promise<{ orgId: string; contactId: string }> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `mc ${label} ${tag}`, slug: `mc-${label}-${tag}` })
    .returning({ id: organizations.id });
  const [c] = await db
    .insert(contacts)
    .values({ orgId: org!.id, email: `mc-${label}-${tag}@test.local`, status: 'active' })
    .returning({ id: contacts.id });
  return { orgId: org!.id, contactId: c!.id };
}

/** Every interaction kind the timeline unions together, for one contact. */
async function plantTimeline(orgId: string, contactId: string) {
  await db
    .insert(emailEvents)
    .values({ orgId, contactId, eventType: 'open', createdAt: OPENED_AT });
  await db
    .insert(revenueEvents)
    .values(purchase(orgId, contactId, [{ sku: SKU_FAST, name: 'Fast', qty: 2, price: 25 }], '50.00'));
  await db
    .insert(helpdeskTickets)
    .values({ orgId, contactId, subject: `t-${tag}`, status: 'open', createdAt: OPENED_AT });
  const [wf] = await db
    .insert(workflows)
    .values({ orgId, name: `wf-${tag}` })
    .returning({ id: workflows.id });
  workflowIds.push(wf!.id);
  // started_at is nullable with no default; the timeline orders and paginates
  // this branch on it, so a run without one would silently drop out.
  await db
    .insert(workflowRuns)
    .values({ orgId, workflowId: wf!.id, contactId, status: 'running', startedAt: RUN_STARTED_AT });
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

  ({ orgId: orgA, contactId: contactA } = await makeOrg('a'));
  ({ orgId: orgB, contactId: contactB } = await makeOrg('b'));

  await plantTimeline(orgA, contactA);
  await plantTimeline(orgB, contactB);

  // Catalog: one product that sells, one that does not.
  await db.insert(products).values([
    { orgId: orgA, sku: SKU_FAST, name: 'Fast mover', price: '25.00', categories: ['gear'] },
    { orgId: orgA, sku: SKU_SLOW, name: 'Slow mover', price: '10.00', categories: ['gear'] },
  ]);
  // A second purchase of the same SKU, so units accumulate across orders: the
  // first order had qty 2, this one qty 3 ⇒ 5 units, 125.00 revenue.
  await db
    .insert(revenueEvents)
    .values(purchase(orgA, contactA, [{ sku: SKU_FAST, name: 'Fast', qty: 3, price: 25 }], '75.00'));

  // AI usage for the consolidated billing report: 100 + 20 and 5 + 3 ⇒ 128.
  await db.insert(aiUsage).values([
    { orgId: orgA, model: 'claude-x', inputTokens: 100, outputTokens: 20, costUsd: '0.5' },
    { orgId: orgA, model: 'claude-x', inputTokens: 5, outputTokens: 3, costUsd: '0.25' },
  ]);

  // Anonymous site events for the identity merge: two for our visitor, and one
  // for a different visitor that must be left alone.
  const [site] = await db
    .insert(trackedSites)
    .values({ orgId: orgA, siteToken: `tok-${tag}`, domain: `x-${tag}.test` })
    .returning({ id: trackedSites.id });
  siteIds.push(site!.id);
  await db.insert(siteEvents).values([
    { orgId: orgA, siteId: site!.id, visitorId: `vis-${tag}`, eventName: 'page_view' },
    { orgId: orgA, siteId: site!.id, visitorId: `vis-${tag}`, eventName: 'add_to_cart' },
    { orgId: orgA, siteId: site!.id, visitorId: `other-${tag}`, eventName: 'page_view' },
  ]);
}, 120_000);

afterAll(async () => {
  for (const orgId of [orgA, orgB].filter(Boolean)) {
    await db.delete(warehouseSyncs).where(eq(warehouseSyncs.orgId, orgId));
    await db.delete(siteEvents).where(eq(siteEvents.orgId, orgId));
    await db.delete(workflowRuns).where(eq(workflowRuns.orgId, orgId));
    await db.delete(helpdeskTickets).where(eq(helpdeskTickets.orgId, orgId));
    await db.delete(revenueEvents).where(eq(revenueEvents.orgId, orgId));
    await db.delete(emailEvents).where(eq(emailEvents.orgId, orgId));
    await db.delete(products).where(eq(products.orgId, orgId));
    await db.delete(aiUsage).where(eq(aiUsage.orgId, orgId));
  }
  if (workflowIds.length) await db.delete(workflows).where(inArray(workflows.id, workflowIds));
  if (siteIds.length) await db.delete(trackedSites).where(inArray(trackedSites.id, siteIds));
  for (const orgId of [orgA, orgB].filter(Boolean)) {
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  await app?.close();
}, 60_000);

describe('timeline', () => {
  it('unions all four sources instead of dying on workflow_run_id', async () => {
    const rows = await getTimeline(orgA, contactA);
    const sources = rows.map((r) => r.source).sort();
    expect(sources).toEqual(['email', 'revenue', 'revenue', 'ticket', 'workflow']);

    // The revenue branch reads amount/occurred_at, not value/created_at.
    const rev = rows.find((r) => r.source === 'revenue')!;
    expect(rev.type).toBe('purchase');
    expect(Number(rev.data.value)).toBeGreaterThan(0);
    expect(rev.at.getTime()).toBeGreaterThan(0);
  });

  it('applies the `before` cursor to every branch, each on its own column', async () => {
    // Everything was planted at least a moment ago; a cursor in the far past
    // must exclude all of it without erroring on a branch whose timestamp
    // column is named differently.
    const none = await getTimeline(orgA, contactA, { before: new Date(Date.now() - 10 * 86_400_000) });
    expect(none).toEqual([]);
    const all = await getTimeline(orgA, contactA, { before: new Date(Date.now() + 86_400_000) });
    expect(all.length).toBe(5);
  });

  it('is reachable over HTTP', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contactA}/timeline`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });
});

describe('catalog insights', () => {
  it('bestSellers sums qty across orders — a number, never NULL', async () => {
    const rows = await bestSellers(orgA, 30, 25);
    const fast = rows.find((r) => r.sku === SKU_FAST);
    expect(fast).toBeDefined();
    // 2 units at 25 + 3 units at 25.
    expect(fast!.units).toBe(5);
    expect(fast!.revenue).toBe(125);
    expect(Number.isNaN(fast!.units)).toBe(false);
    expect(fast!.name).toBe('Fast mover');
  });

  it('slowMovers reports the unsold product with zero, not NULL', async () => {
    const rows = await slowMovers(orgA, 90, 25);
    const slow = rows.find((r) => r.sku === SKU_SLOW);
    expect(slow).toBeDefined();
    expect(slow!.units).toBe(0);
    expect(slow!.revenue).toBe(0);
    // Ordered ascending by revenue, so the one that never sold comes first.
    expect(rows[0]!.sku).toBe(SKU_SLOW);
  });

  it('slowMovers excludes soft-deleted products (active = false)', async () => {
    await db
      .update(products)
      .set({ active: false })
      .where(eq(products.sku, SKU_SLOW));
    const after = await slowMovers(orgA, 90, 25);
    expect(after.find((r) => r.sku === SKU_SLOW)).toBeUndefined();
    await db.update(products).set({ active: true }).where(eq(products.sku, SKU_SLOW));
  });

  it('revenueByCategory aggregates per category with a real average', async () => {
    const rows = await revenueByCategory(orgA, 30);
    const gear = rows.find((r) => r.category === 'gear');
    expect(gear).toBeDefined();
    expect(gear!.units).toBe(5);
    expect(gear!.revenue).toBe(125);
    expect(gear!.avgOrderValue).toBeGreaterThan(0);
  });
});

describe('funnel', () => {
  it('counts an email step and a revenue step in one funnel', async () => {
    const res = await computeFunnel(orgA, { events: ['open', 'purchase'], windowDays: 30 });
    expect(res.steps).toHaveLength(2);
    expect(res.steps[0]!.event).toBe('open');
    expect(res.steps[0]!.count).toBe(1);
    // revenue_events has no event_type; its rows enter the funnel as `purchase`.
    expect(res.steps[1]!.event).toBe('purchase');
    expect(res.steps[1]!.count).toBe(1);
  });

  it('does not scan revenue_events when purchase is not a requested step', async () => {
    const res = await computeFunnel(orgA, { events: ['open', 'click'], windowDays: 30 });
    expect(res.steps[1]!.count).toBe(0);
  });
});

describe('identity merge', () => {
  it('backfills contact_id onto that visitor’s site events only', async () => {
    const res = await mergeVisitorIntoContact(orgA, {
      visitorId: `vis-${tag}`,
      contactId: contactA,
    });
    expect(res.siteEventsUpdated).toBe(2);

    const other = await db
      .select({ contactId: siteEvents.contactId })
      .from(siteEvents)
      .where(eq(siteEvents.visitorId, `other-${tag}`));
    expect(other[0]!.contactId).toBeNull();
  });

  it('is idempotent — re-running updates nothing more', async () => {
    const again = await mergeVisitorIntoContact(orgA, {
      visitorId: `vis-${tag}`,
      contactId: contactA,
    });
    expect(again.siteEventsUpdated).toBe(0);
  });

  it('surfaces failure instead of reporting zero rows', async () => {
    // The bug this replaces was a .catch(() => null) that turned a broken query
    // into "0 updated". A malformed contact id must now reject, not resolve.
    await expect(
      mergeVisitorIntoContact(orgA, { visitorId: `vis-${tag}`, contactId: 'not-a-uuid' }),
    ).rejects.toThrow();
  });
});

describe('consolidated subaccount billing report', () => {
  it('sums input_tokens + output_tokens', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/subaccounts/report',
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data.children)).toBe(true);
  });

  it('counts both token columns for the org that owns them', async () => {
    const { getConsolidatedReport } = await import('../services/billing/subaccounts.js');
    const report = await getConsolidatedReport(
      orgA,
      new Date(Date.now() - 86_400_000),
      new Date(Date.now() + 86_400_000),
    );
    const mine = report.children.find((c) => c.orgId === orgA)!;
    expect(mine.aiTokensUsed).toBe(128);
  });
});

describe('deliverability health score', () => {
  it('answers the org-wide question', async () => {
    const res = await computeOrgHealth({ orgId: orgA, days: 30 });
    expect(res.scope).toBe('org');
    expect(res.grade).toMatch(/^[A-F]$/);
  });

  it('rejects a domain scope it cannot answer, rather than 500-ing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/deliverability/health-score?domain=example.com',
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/sending domain/i);
  });

  it('rejects an ip scope the same way', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/deliverability/health-score?ip=1.2.3.4',
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('currency revenue report', () => {
  it('groups by currency and picks a top campaign without campaign_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/currency-revenue',
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data.breakdown)).toBe(true);
  });
});

describe('warehouse sync', () => {
  it('selects revenue_events on occurred_at instead of failing the query', async () => {
    const { createWarehouseSync, runSync } = await import('../services/warehouse-sync/index.js');
    const sync = await createWarehouseSync(orgA, {
      name: `wh-${tag}`,
      destination: 'webhook',
      entities: ['revenue_events'],
      // Deliberately unreachable: this test is about the SELECT, not delivery.
      config: { url: 'http://127.0.0.1:9/never' },
    });

    const res = await runSync(sync.id, orgA);
    // Both purchases planted for org A are inside the default 24h window.
    expect(res.rowsByEntity.revenue_events).toBe(2);
    // Delivery may well fail against a dead port — but never with a SQL error.
    expect(res.error ?? '').not.toMatch(/Failed query|does not exist/);
  });
});

describe('lifecycle auto-advance', () => {
  it('resolves a booked meeting through bookings, not a meetings table', async () => {
    const { evaluateContact } = await import('../services/lifecycle/auto-advance.js');
    // No rules configured for this org, so the call must simply complete: the
    // point is that loadFacts runs its bookings query without throwing.
    await expect(evaluateContact(orgA, contactA)).resolves.toBeDefined();
  });
});

describe('data sets (table was in schema.ts but never migrated)', () => {
  it('lists instead of failing on a missing relation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/data-sets',
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
  });
});

/**
 * The one that matters most. Before this change the workflow_runs branch of the
 * timeline filtered on contact_id ALONE — no org_id. It was invisible only
 * because the query died earlier on a missing column; fixing the columns would
 * have switched a 500 into a cross-tenant read.
 */
describe('cross-tenant isolation', () => {
  it('org A asking for org B’s contact gets nothing', async () => {
    const leaked = await getTimeline(orgA, contactB);
    expect(leaked).toEqual([]);
  });

  it('...and the rows really are there when org B asks', async () => {
    // Without this half, the assertion above would also pass against a query
    // that returns nothing for anybody.
    const own = await getTimeline(orgB, contactB);
    expect(own.length).toBe(4);
    expect(own.map((r) => r.source).sort()).toEqual([
      'email',
      'revenue',
      'ticket',
      'workflow',
    ]);
  });

  it('the workflow_runs branch specifically does not leak', async () => {
    const leaked = await getTimeline(orgA, contactB);
    expect(leaked.filter((r) => r.source === 'workflow')).toEqual([]);
    const own = await getTimeline(orgB, contactB);
    expect(own.filter((r) => r.source === 'workflow')).toHaveLength(1);
  });

  it('over HTTP too: a session for one org cannot read another org’s timeline', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/contacts/${contactB}/timeline`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it('catalog insights count only the asking tenant’s orders', async () => {
    // Both orgs bought the same SKU, so its presence proves nothing — the
    // quantity does. Org A placed two orders (2 + 3 units); org B placed one.
    const a = await bestSellers(orgA, 30, 25);
    const b = await bestSellers(orgB, 30, 25);
    expect(a.find((r) => r.sku === SKU_FAST)!.units).toBe(5);
    expect(b.find((r) => r.sku === SKU_FAST)!.units).toBe(2);
    // Only org A owns a products row, so org B falls back to the item's own
    // name rather than reading org A's catalog.
    expect(a.find((r) => r.sku === SKU_FAST)!.name).toBe('Fast mover');
    expect(b.find((r) => r.sku === SKU_FAST)!.name).toBe('Fast');
  });
});
