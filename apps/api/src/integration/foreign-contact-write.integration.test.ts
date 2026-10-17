/**
 * A write that takes a contact id from the caller accepts only a live contact
 * of the caller's organisation (Z182).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * POST /api/v1/lists/:id/contacts checked the list and not the contact, so a
 * contact id of another organisation went onto org A's list (Z173 MIMO 10).
 * The same held for POST /commerce/invoices, POST /commerce/subscriptions,
 * POST /browse/track and POST /browse/associate: the id from the body was
 * stored on org A's row as it came (Z169 Sonda 2). Z169 stopped the flows that
 * those rows start (onApiEvent refuses a contact of another org); the rows
 * themselves were still written, and a person of org B became a member, a
 * customer or a visitor of org A without org A ever having them. Now each of
 * these answers 404 `Contact` and writes nothing — for a contact of another
 * organisation, an id no contact has and a deleted contact alike, so the answer
 * does not tell an id of another org from one that does not exist.
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Through the real app (buildApp, inject, the real database and Redis). Org A
 * and org B are organisations of this file; org A's owner session comes from
 * POST /api/v1/me/orgs/switch and its API key from POST /api-keys. Org A has
 * one active flow with an inline e-mail on each of subscription_created,
 * subscription_canceled and invoice_reminder.
 *
 *   X   org B's contact, per route: answer, rows written, e-mail jobs;
 *   N   a uuid no contact has;
 *   D   org A's own contact after DELETE /contacts/:id;
 *   K   org A's own live contact: answer, rows, e-mail jobs, as on master;
 *   KA  an anonymous view (visitorToken only), as on master;
 *   R   Resend-compat POST /audiences/:id/contacts (the other caller of
 *       addContactToList): an own new address, and org B's address;
 *   E   reach: an invoice and a subscription of org A that name org B's
 *       contact (written straight to the table, as rows written before this
 *       change are): the reminder sweep, a subscription's next invoice and its
 *       cancellation, followed to the MTA queue; the same for org A's own;
 *   G   reads of org A that show such rows: do they show org B's person;
 *   C   the statements one call makes, per route, X and K.
 *
 * Mocked: nothing. Flow e-mail jobs are replayed into the API's own dispatch
 * route (the workflow-email worker forwards a job's data to it unchanged); the
 * engine is not reached from this process. Everything measured is printed once
 * as `Z182_API_CELLS_JSON {…}`.
 *
 * WHAT THIS FILE CANNOT SEE
 * - A campaign of org A to a list that carries a row of org B's contact, to
 *   the engine: apps/workers/src/integration/foreign-contact-list-campaign.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { JobType, Queue } from 'bullmq';
import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { observeQueries } from '../db/explain-guard.js';
import { sendDueReminders } from '../services/commerce/invoicing.js';
import { generateNextInvoice } from '../services/commerce/subscriptions.js';
import { emailQueue as emailQueueTyped, mtaOtherQueue } from '../lib/queues.js';
import {
  apiKeys,
  contactLists,
  contacts,
  invoices,
  organizations,
  productPageViews,
  subscriptions,
  workflowEvents,
  workflowRuns,
  workflows,
} from '../db/schema/index.js';

const TAG = `z182-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const SKU = `${TAG}-sku`;
const B_NAME = `Bnameq${TAG.slice(5)}`;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };
const NOT_FOUND = { code: 'NOT_FOUND', message: 'Contact not found', statusCode: 404 };
const ALL: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
  'failed',
];

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId: string;
let seedBefore: Record<string, unknown> = {};
let orgA = '';
let orgB = '';
let ownerA: Record<string, string> = {};
let keyA: Record<string, string> = {};
let listA = '';
const missingId = randomUUID();
const contact = { b: '', own: '', del: '', ownE: '' };
const emails = { b: '', own: '', del: '', ownE: '' };
const flowIds: string[] = [];
const cells: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'nothing; flow e-mail jobs replayed into the API dispatch route; no engine in this process',
};

const emailQueue = emailQueueTyped as unknown as Queue;

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];

const scrub = (s: string) =>
  s
    .split(TAG)
    .join('<TAG>')
    .split(TAG.slice(5))
    .join('<T>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TIME>')
    .replace(/INV-\d{4}-\d{4}/g, '<INV>')
    .replace(/SUB-[A-Z0-9-]+/g, '<SUB>');

async function inject(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; body: string }> {
  const res = await app.inject({
    method: method as 'POST',
    url,
    headers,
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
  return { status: res.statusCode, body: res.body };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id = ${seedOrgId}::uuid) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN lists l ON l.id = cl.list_id WHERE l.org_id = ${seedOrgId}::uuid) AS memberships,
           (SELECT count(*)::int FROM invoices WHERE org_id = ${seedOrgId}::uuid) AS invoices,
           (SELECT coalesce(sum(reminders_sent), 0)::int FROM invoices WHERE org_id = ${seedOrgId}::uuid) AS reminders,
           (SELECT count(*)::int FROM subscriptions WHERE org_id = ${seedOrgId}::uuid) AS subscriptions,
           (SELECT count(*)::int FROM product_page_views WHERE org_id = ${seedOrgId}::uuid) AS page_views,
           (SELECT count(*)::int FROM workflows WHERE org_id = ${seedOrgId}::uuid) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = ${seedOrgId}::uuid) AS runs,
           (SELECT count(*)::int FROM workflow_events WHERE org_id = ${seedOrgId}::uuid) AS events,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrgId}::uuid) AS users
  `);
  return r!;
}

/** Rows of org A that carry `id`, by table. */
async function footprint(id: string): Promise<Record<string, number>> {
  const n = async (p: Promise<unknown[]>) => (await p).length;
  return {
    contact_lists: await n(
      db
        .select({ c: contactLists.contactId })
        .from(contactLists)
        .where(and(eq(contactLists.listId, listA), eq(contactLists.contactId, id))),
    ),
    invoices: await n(
      db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgA), eq(invoices.contactId, id))),
    ),
    subscriptions: await n(
      db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.orgId, orgA), eq(subscriptions.contactId, id))),
    ),
    product_page_views: await n(
      db
        .select({ id: productPageViews.id })
        .from(productPageViews)
        .where(and(eq(productPageViews.orgId, orgA), eq(productPageViews.contactId, id))),
    ),
    workflow_events: await n(
      db
        .select({ id: workflowEvents.id })
        .from(workflowEvents)
        .where(eq(workflowEvents.contactId, id)),
    ),
    workflow_runs: await n(
      db
        .select({ id: workflowRuns.id })
        .from(workflowRuns)
        .where(and(inArray(workflowRuns.workflowId, flowIds), eq(workflowRuns.contactId, id))),
    ),
  };
}

interface Reach {
  emailJobs: number;
  replay: string[];
  mta: { stream: string; purpose: string; subject: string; html: string }[];
}

/**
 * The flow e-mail jobs for contact `id`, replayed into the dispatch route, and
 * the MTA jobs to `email` that follow; every one removed once counted.
 */
async function reach(id: string, email: string): Promise<Reach> {
  const jobs = (await emailQueue.getJobs(ALL, 0, 10_000)).filter((j) => j?.data?.contactId === id);
  const replay: string[] = [];
  for (const j of jobs) {
    const r = await inject('POST', '/api/v1/internal/workflow/send-email', INTERNAL, j.data);
    replay.push(`${r.status} ${scrub(r.body).slice(0, 160)}`);
    await j.remove().catch(() => {});
  }
  const mtaJobs = (await mtaOtherQueue.getJobs(ALL, 0, 10_000)).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === email.toLowerCase(),
  );
  const mta = mtaJobs.map((j) => ({
    stream: String(j.data.stream),
    purpose: String(j.data.purpose ?? '-'),
    subject: String(j.data.subject),
    html: createHash('sha256')
      .update(scrub(String(j.data.htmlBody)).replace(/\/[A-Za-z0-9_-]{20,}/g, '/<TOKEN>'))
      .digest('hex')
      .slice(0, 16),
  }));
  for (const j of mtaJobs) await j.remove().catch(() => {});
  return { emailJobs: jobs.length, replay: replay.sort(), mta };
}

/** Statements the app ran during `run`, by their first words. */
async function statements(run: () => Promise<unknown>): Promise<number> {
  let n = 0;
  const stop = observeQueries(() => {
    n += 1;
  });
  try {
    await run();
  } finally {
    stop();
  }
  return n;
}

interface Cell {
  status: number;
  body: string;
  written: Record<string, number>;
  reach: Reach;
  queries: number;
}

const ROUTES = ['list', 'invoice', 'subscription', 'track', 'associate'] as const;
type Route = (typeof ROUTES)[number];

/** One call of `route` with contact id `id`; for associate, an anonymous view first. */
function call(route: Route, id: string, label: string) {
  switch (route) {
    case 'list':
      return () => inject('POST', `/api/v1/lists/${listA}/contacts`, ownerA, { contactId: id });
    case 'invoice':
      return () =>
        inject('POST', '/api/v1/commerce/invoices', ownerA, {
          contactId: id,
          currency: 'CZK',
          lineItems: [{ sku: SKU, name: 'Z182 položka', qty: 1, unitPrice: 100 }],
          notes: label,
        });
    case 'subscription':
      return () =>
        inject('POST', '/api/v1/commerce/subscriptions', ownerA, {
          contactId: id,
          currency: 'CZK',
          lineItems: [{ description: 'Z182 tarif', quantity: 1, unitPrice: 100, currency: 'CZK' }],
          metadata: { label },
        });
    case 'track':
      return () =>
        inject('POST', '/api/v1/browse/track', keyA, {
          contactId: id,
          sku: `${SKU}-${label}`,
          productName: 'Z182 produkt',
        });
    case 'associate':
      return () =>
        inject('POST', '/api/v1/browse/associate', keyA, {
          visitorToken: `${TAG}-vt-${label}`,
          contactId: id,
        });
  }
}

async function measure(route: Route, id: string, email: string | null, label: string) {
  if (route === 'associate') {
    const anon = await inject('POST', '/api/v1/browse/track', keyA, {
      visitorToken: `${TAG}-vt-${label}`,
      sku: `${SKU}-a-${label}`,
      productName: 'Z182 anonym',
    });
    expect(anon.status, anon.body).toBe(201);
  }
  const before = await footprint(id);
  let res = { status: 0, body: '' };
  const queries = await statements(async () => {
    res = await call(route, id, label)();
  });
  // A flow e-mail is queued after the answer (onApiEvent runs in the request).
  await new Promise((r) => setTimeout(r, 300));
  const after = await footprint(id);
  const written = Object.fromEntries(
    Object.entries(after).map(([k, v]) => [k, v - (before[k] ?? 0)]),
  );
  const cell: Cell = {
    status: res.status,
    body: scrub(res.body),
    written,
    reach: email ? await reach(id, email) : { emailJobs: 0, replay: [], mta: [] },
    queries,
  };
  cells[`${label}`] = cell;
  console.log(`[z182] ${label}: ${JSON.stringify(cell)}`);
  return cell;
}

const NOTHING_WRITTEN = {
  contact_lists: 0,
  invoices: 0,
  subscriptions: 0,
  product_page_views: 0,
  workflow_events: 0,
  workflow_runs: 0,
};

async function newOrg(label: string): Promise<string> {
  const [o] = await db
    .insert(organizations)
    .values({
      name: `${TAG} ${label}`,
      slug: `${TAG}-${label}`,
      sendingMode: 'production',
      companyName: `Obchod ${label} s.r.o.`,
      postalAddress: 'Nádražní 1, 110 00 Praha',
    })
    .returning({ id: organizations.id });
  await db.execute(sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    VALUES (${o!.id}, ${seedSession.userId}, ${SEED.email}, 'owner', 'active')
  `);
  return o!.id;
}

async function switchTo(orgId: string): Promise<Record<string, string>> {
  const r = await inject(
    'POST',
    '/api/v1/me/orgs/switch',
    { cookie: seedSession.cookie },
    { orgId },
  );
  expect(r.status, r.body).toBe(200);
  return bearer((JSON.parse(r.body) as { data: { token: string } }).data.token);
}

async function newContact(orgId: string, label: string, firstName = 'Petra') {
  const email = `${label}-${TAG}@${DOMAIN}`;
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email, firstName, status: 'active' })
    .returning({ id: contacts.id });
  return { id: c!.id, email };
}

async function flowOn(eventName: string) {
  const [w] = await db
    .insert(workflows)
    .values({
      orgId: orgA,
      name: `${TAG} ${eventName}`,
      status: 'active',
      triggerType: 'api_event',
      triggerConfig: { eventName },
      nodes: [
        { id: 'trigger', type: 'trigger', config: { triggerType: 'api_event', eventName } },
        {
          id: 'n',
          type: 'send_email',
          config: { subject: `Z182 ${eventName}`, html: '<p>Dobrý den, {{first_name}}.</p>' },
        },
      ] as never,
      edges: [{ id: 'e0', source: 'trigger', target: 'n' }] as never,
    })
    .returning({ id: workflows.id });
  flowIds.push(w!.id);
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();

  orgA = await newOrg('a');
  orgB = await newOrg('b');
  ownerA = await switchTo(orgA);
  const key = await inject('POST', '/api/v1/api-keys', ownerA, { name: `${TAG} key` });
  expect(key.status, key.body).toBeLessThan(300);
  keyA = { 'x-api-key': (JSON.parse(key.body) as { data: { rawKey: string } }).data.rawKey };

  await db.execute(sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${orgA}, ${DOMAIN}, 'fm1', true, true, true, true)
  `);
  const l = await inject('POST', '/api/v1/lists', ownerA, { name: `${TAG} list` });
  expect(l.status, l.body).toBeLessThan(300);
  listA = (JSON.parse(l.body) as { data: { id: string } }).data.id;

  const b = await newContact(orgB, 'b', B_NAME);
  const own = await newContact(orgA, 'own');
  const del = await newContact(orgA, 'del');
  const ownE = await newContact(orgA, 'own-e');
  Object.assign(contact, { b: b.id, own: own.id, del: del.id, ownE: ownE.id });
  Object.assign(emails, { b: b.email, own: own.email, del: del.email, ownE: ownE.email });
  const d = await inject('DELETE', `/api/v1/contacts/${del.id}`, ownerA);
  expect(d.status, d.body).toBeLessThan(300);
  const [delRow] = await db
    .select({ deletedAt: contacts.deletedAt })
    .from(contacts)
    .where(eq(contacts.id, del.id));
  report.deletion = { answer: d.status, deletedAtSet: delRow?.deletedAt != null };

  for (const ev of ['subscription_created', 'subscription_canceled', 'invoice_reminder'])
    await flowOn(ev);
}, 120_000);

afterAll(async () => {
  const ids = [contact.b, contact.own, contact.del, contact.ownE, missingId].filter(Boolean);
  for (const j of await emailQueue.getJobs(ALL, 0, 10_000))
    if (ids.includes(j?.data?.contactId ?? '')) await j.remove().catch(() => {});
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000))
    if (j?.data?.toEmail?.toLowerCase().endsWith(`@${DOMAIN}`)) await j.remove().catch(() => {});
  await db.delete(workflowRuns).where(inArray(workflowRuns.contactId, ids));
  await db.delete(workflowEvents).where(inArray(workflowEvents.contactId, ids));
  const orgs = [orgA, orgB].filter(Boolean);
  await db.delete(productPageViews).where(inArray(productPageViews.orgId, orgs));
  await db.delete(invoices).where(inArray(invoices.orgId, orgs));
  await db.delete(subscriptions).where(inArray(subscriptions.orgId, orgs));
  await db.delete(apiKeys).where(inArray(apiKeys.orgId, orgs));
  await db.execute(sql`DELETE FROM audit_logs WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)`);
  // Everything else of org A and org B goes with the organisation (ON DELETE CASCADE).
  await db.delete(organizations).where(inArray(organizations.id, orgs));
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id IN (${orgA}::uuid, ${orgB}::uuid)) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS lists,
           (SELECT count(*)::int FROM invoices WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS invoices,
           (SELECT count(*)::int FROM subscriptions WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS subscriptions,
           (SELECT count(*)::int FROM product_page_views WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS page_views,
           (SELECT count(*)::int FROM workflow_events WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS events,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS runs,
           (SELECT count(*)::int FROM api_keys WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS api_keys,
           (SELECT count(*)::int FROM organization_members WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS members
  `);
  let jobsLeft = 0;
  for (const j of await emailQueue.getJobs(ALL, 0, 10_000))
    if (ids.includes(j?.data?.contactId ?? '')) jobsLeft += 1;
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000))
    if (j?.data?.toEmail?.toLowerCase().endsWith(`@${DOMAIN}`)) jobsLeft += 1;
  const seedAfter = await seedState();
  report.cells = cells;
  report.leftover = { ...left, jobs: jobsLeft };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  console.log(`Z182_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    lists: 0,
    invoices: 0,
    subscriptions: 0,
    page_views: 0,
    events: 0,
    runs: 0,
    api_keys: 0,
    members: 0,
  });
  expect(jobsLeft).toBe(0);
  // The seed org exactly as this file found it — a snapshot, not zeros.
  expect(seedAfter).toEqual(seedBefore);
}, 120_000);

describe('a write with a contact id that is not a live contact of the org: 404, nothing written (Z182)', () => {
  for (const route of ROUTES) {
    it(`X ${route} — org B’s contact: 404 Contact, no row, no e-mail`, async () => {
      const c = await measure(route, contact.b, emails.b, `X-${route}`);
      expect(c.status, c.body).toBe(404);
      expect(JSON.parse(c.body)).toEqual(NOT_FOUND);
      expect(c.written).toEqual(NOTHING_WRITTEN);
      expect(c.reach.emailJobs).toBe(0);
      expect(c.reach.mta).toEqual([]);
    });

    it(`N ${route} — an id no contact has: the same answer as X, nothing written`, async () => {
      const c = await measure(route, missingId, null, `N-${route}`);
      expect(c.status, c.body).toBe(404);
      expect(JSON.parse(c.body)).toEqual(NOT_FOUND);
      expect(c.written).toEqual(NOTHING_WRITTEN);
    });

    it(`D ${route} — org A’s deleted contact: the same answer as X, nothing written`, async () => {
      const c = await measure(route, contact.del, emails.del, `D-${route}`);
      expect(c.status, c.body).toBe(404);
      expect(JSON.parse(c.body)).toEqual(NOT_FOUND);
      expect(c.written).toEqual(NOTHING_WRITTEN);
      expect(c.reach.emailJobs).toBe(0);
    });
  }
});

describe('controls — org A’s own contact, the same on master and the branch (Z182)', () => {
  it('K list — own contact: 204, one membership', async () => {
    const c = await measure('list', contact.own, emails.own, 'K-list');
    expect(c.status, c.body).toBe(204);
    expect(c.body).toBe('');
    expect(c.written).toEqual({ ...NOTHING_WRITTEN, contact_lists: 1 });
  });

  it('K invoice — own contact: 201, one invoice, no e-mail (creation sends nothing)', async () => {
    const c = await measure('invoice', contact.own, emails.own, 'K-invoice');
    expect(c.status, c.body).toBe(201);
    const body = JSON.parse(c.body) as { data: Record<string, unknown> };
    expect(body.data.contactId).toBe('<UUID>');
    expect(body.data.status).toBe('draft');
    expect(c.written).toEqual({ ...NOTHING_WRITTEN, invoices: 1 });
    expect(c.reach.emailJobs).toBe(0);
  });

  it('K subscription — own contact: 201, one subscription, the subscription_created e-mail', async () => {
    const c = await measure('subscription', contact.own, emails.own, 'K-subscription');
    expect(c.status, c.body).toBe(201);
    expect(c.written).toEqual({
      ...NOTHING_WRITTEN,
      subscriptions: 1,
      workflow_events: 1,
      workflow_runs: 1,
    });
    expect(c.reach.emailJobs).toBe(1);
    expect(c.reach.mta.map((m) => m.subject)).toEqual(['Z182 subscription_created']);
  });

  it('K track — own contact: 201, one page view', async () => {
    const c = await measure('track', contact.own, emails.own, 'K-track');
    expect(c.status, c.body).toBe(201);
    expect(c.written).toEqual({ ...NOTHING_WRITTEN, product_page_views: 1 });
  });

  it('K associate — own contact: 200, the anonymous view becomes the contact’s', async () => {
    const c = await measure('associate', contact.own, emails.own, 'K-associate');
    expect(c.status, c.body).toBe(200);
    // As on master: the view is the contact's, but the answer counts 0 — the
    // service reads `rowCount`, which postgres-js does not set (Z182 MIMO).
    expect(JSON.parse(c.body)).toEqual({ data: { updatedViews: 0 } });
    expect(c.written).toEqual({ ...NOTHING_WRITTEN, product_page_views: 1 });
  });

  it('KA — an anonymous view (visitorToken, no contactId): 201, as before', async () => {
    const vt = `${TAG}-vt-anon`;
    let res = { status: 0, body: '' };
    const queries = await statements(async () => {
      res = await inject('POST', '/api/v1/browse/track', keyA, {
        visitorToken: vt,
        sku: `${SKU}-anon`,
        productName: 'Z182 anonym',
      });
    });
    const views = await db
      .select({ id: productPageViews.id })
      .from(productPageViews)
      .where(
        and(
          eq(productPageViews.orgId, orgA),
          eq(productPageViews.visitorToken, vt),
          isNull(productPageViews.contactId),
        ),
      );
    const cell = { status: res.status, body: scrub(res.body), views: views.length, queries };
    cells.KA = cell;
    console.log(`[z182] KA: ${JSON.stringify(cell)}`);
    expect(cell.status, cell.body).toBe(201);
    expect(cell.views).toBe(1);
  });
});

describe('E — rows that already name org B’s contact reach no one; org A’s own as before (Z182)', () => {
  const dueIn7 = () => new Date(Date.now() + 7 * 86_400_000);

  async function invoiceRow(contactId: string, label: string): Promise<string> {
    const [r] = await db
      .insert(invoices)
      .values({
        orgId: orgA,
        contactId,
        invoiceNumber: `${TAG}-${label}`,
        status: 'sent',
        currency: 'CZK',
        lineItems: [{ sku: SKU, name: 'Z182', qty: 1, unitPrice: 100, total: 100 }],
        subtotal: '100',
        taxTotal: '0',
        total: '100',
        amountDue: '100',
        dueDate: dueIn7(),
      })
      .returning({ id: invoices.id });
    return r!.id;
  }

  async function subscriptionRow(contactId: string, label: string): Promise<string> {
    const now = new Date();
    const [r] = await db
      .insert(subscriptions)
      .values({
        orgId: orgA,
        contactId,
        subscriptionNumber: `${TAG}-${label}`,
        status: 'active',
        currency: 'CZK',
        lineItems: [{ description: 'Z182 tarif', quantity: 1, unitPrice: 100, currency: 'CZK' }],
        mrr: '100',
        billingInterval: 'month',
        billingIntervalCount: 1,
        startDate: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
        nextInvoiceAt: now,
      })
      .returning({ id: subscriptions.id });
    return r!.id;
  }

  it('E invoice reminder — the sweep: no e-mail to org B’s contact, one to org A’s own', async () => {
    const xb = await invoiceRow(contact.b, 'eb');
    const xk = await invoiceRow(contact.ownE, 'ek');
    await sendDueReminders();
    await new Promise((r) => setTimeout(r, 300));
    const marks = await db
      .select({ id: invoices.id, sent: invoices.remindersSent })
      .from(invoices)
      .where(inArray(invoices.id, [xb, xk]));
    const cell = {
      claimed: Object.fromEntries(marks.map((m) => [m.id === xb ? 'b' : 'own', m.sent])),
      b: await reach(contact.b, emails.b),
      own: await reach(contact.ownE, emails.ownE),
      eventsB: (await footprint(contact.b)).workflow_events,
    };
    cells.E_reminder = cell;
    console.log(`[z182] E reminder: ${JSON.stringify(cell)}`);
    expect(cell.b.emailJobs).toBe(0);
    expect(cell.b.mta).toEqual([]);
    expect(cell.own.emailJobs).toBe(1);
    expect(cell.own.mta.map((m) => m.subject)).toEqual(['Z182 invoice_reminder']);
  });

  it('E invoice send — POST /invoices/:id/send sends nothing to anyone (status only)', async () => {
    const xb = await invoiceRow(contact.b, 'sb');
    const xk = await invoiceRow(contact.ownE, 'sk');
    await db
      .update(invoices)
      .set({ status: 'draft' })
      .where(inArray(invoices.id, [xb, xk]));
    const out: Record<string, unknown> = {};
    for (const [label, id, cid, email] of [
      ['b', xb, contact.b, emails.b],
      ['own', xk, contact.ownE, emails.ownE],
    ] as const) {
      const r = await inject('POST', `/api/v1/commerce/invoices/${id}/send`, ownerA);
      await new Promise((res) => setTimeout(res, 300));
      out[label] = { status: r.status, reach: await reach(cid, email) };
    }
    cells.E_send = out;
    console.log(`[z182] E send: ${JSON.stringify(out)}`);
    expect((out.b as { reach: Reach }).reach.emailJobs).toBe(0);
    expect((out.b as { reach: Reach }).reach.mta).toEqual([]);
  });

  it('E subscription — next invoice and cancellation: no e-mail to org B’s contact, one to org A’s own', async () => {
    const sb = await subscriptionRow(contact.b, 'b');
    const sk = await subscriptionRow(contact.ownE, 'k');
    const out: Record<string, unknown> = {};
    for (const [label, id, cid, email] of [
      ['b', sb, contact.b, emails.b],
      ['own', sk, contact.ownE, emails.ownE],
    ] as const) {
      const before = await footprint(cid);
      const next = await generateNextInvoice(orgA, id);
      const cancel = await inject('POST', `/api/v1/commerce/subscriptions/${id}/cancel`, ownerA, {
        when: 'immediate',
      });
      await new Promise((res) => setTimeout(res, 300));
      const after = await footprint(cid);
      out[label] = {
        nextInvoice: next ? 'created' : null,
        invoicesWritten: (after.invoices ?? 0) - (before.invoices ?? 0),
        cancel: cancel.status,
        reach: await reach(cid, email),
      };
    }
    cells.E_subscription = out;
    console.log(`[z182] E subscription: ${JSON.stringify(out)}`);
    const b = out.b as { reach: Reach };
    const own = out.own as { reach: Reach; cancel: number };
    expect(b.reach.emailJobs).toBe(0);
    expect(b.reach.mta).toEqual([]);
    expect(own.cancel).toBe(200);
    expect(own.reach.mta.map((m) => m.subject)).toEqual(['Z182 subscription_canceled']);
  });

  it('G — reads of org A: do they show org B’s person (recorded)', async () => {
    const inv = await invoiceRow(contact.b, 'g');
    const sub = await subscriptionRow(contact.b, 'g');
    await db
      .insert(productPageViews)
      .values({ orgId: orgA, contactId: contact.b, sku: `${SKU}-g`, productName: 'Z182 g' });
    const out: Record<string, unknown> = {};
    for (const [label, url] of [
      ['browseContact', `/api/v1/browse/contact/${contact.b}`],
      ['invoice', `/api/v1/commerce/invoices/${inv}`],
      ['invoices', '/api/v1/commerce/invoices'],
      ['subscription', `/api/v1/commerce/subscriptions/${sub}`],
      ['subscriptions', `/api/v1/commerce/subscriptions?contactId=${contact.b}`],
      ['audienceContacts', `/api/v1/audiences/${listA}/contacts`],
    ] as const) {
      const r = await inject('GET', url, ownerA);
      out[label] = {
        status: r.status,
        showsBId: r.body.includes(contact.b),
        showsBEmail: r.body.toLowerCase().includes(emails.b.toLowerCase()),
        showsBName: r.body.includes(B_NAME),
      };
    }
    cells.G = out;
    console.log(`[z182] G: ${JSON.stringify(out)}`);
    for (const v of Object.values(out) as { showsBEmail: boolean; showsBName: boolean }[]) {
      expect(v.showsBEmail).toBe(false);
      expect(v.showsBName).toBe(false);
    }
  });
});

describe('R — Resend-compat audiences, the other caller of addContactToList (Z182)', () => {
  it('R — Resend-compat audiences: an own new address is added as before; org B’s address becomes a new own contact', async () => {
    const out: Record<string, unknown> = {};
    for (const [label, email] of [
      ['own', `r-own-${TAG}@${DOMAIN}`],
      ['bAddress', emails.b],
    ] as const) {
      const bBefore = (await footprint(contact.b)).contact_lists;
      let res = { status: 0, body: '' };
      const queries = await statements(async () => {
        res = await inject('POST', `/api/v1/audiences/${listA}/contacts`, keyA, {
          email,
          first_name: 'Resend',
        });
      });
      const created = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgA), eq(contacts.email, email)));
      const onList = created.length
        ? (
            await db
              .select({ c: contactLists.contactId })
              .from(contactLists)
              .where(
                and(eq(contactLists.listId, listA), eq(contactLists.contactId, created[0]!.id)),
              )
          ).length
        : 0;
      out[label] = {
        status: res.status,
        body: scrub(res.body),
        orgAContacts: created.length,
        onList,
        // org B's contact put on the list by this call (not by an earlier cell).
        bOnList: ((await footprint(contact.b)).contact_lists ?? 0) - (bBefore ?? 0),
        queries,
      };
    }
    cells.R = out;
    console.log(`[z182] R: ${JSON.stringify(out)}`);
    const own = out.own as { status: number; orgAContacts: number; onList: number };
    expect(own.status).toBe(200);
    expect(own.orgAContacts).toBe(1);
    expect(own.onList).toBe(1);
    const bAddr = out.bAddress as { status: number; bOnList: number; onList: number };
    expect(bAddr.status).toBe(200);
    expect(bAddr.onList).toBe(1);
    expect(bAddr.bOnList).toBe(0);
  });
});
