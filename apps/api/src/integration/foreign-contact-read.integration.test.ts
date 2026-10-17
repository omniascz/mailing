/**
 * A route that reads or writes by a contact id from the caller accepts only a
 * live contact of the caller's organisation — round 2 (Z183).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * Z182 closed the list, invoice, subscription and page-view writes. Its probe
 * found more routes that take a contact id and never ask whose it is:
 *
 *   - POST /ai/generate-per-recipient read the contact by id alone, so the
 *     name, the surname and the custom fields of org B's person went into
 *     org A's AI prompt, and org A got the text written from them;
 *   - GET /back-in-stock/contact/:id and GET /price-drop/contact/:id listed
 *     the person's alerts by contact id alone;
 *   - POST /cdp/traits/:id and POST /send-optimization/record-open upsert ON
 *     CONFLICT (contact_id), so org A overwrote org B's traits and raised
 *     org B's open histogram (org B picks its send time from it);
 *   - POST /commerce/quotes stored the id, and converting the quote copied it
 *     onto an invoice — around the check Z182 put on POST /commerce/invoices;
 *   - POST /workflows/:id/trigger started org A's flow for org B's person: a
 *     run, org A's tag and org A's list on org B's contact.
 *
 * Now each answers 404 `Contact` before it reads or writes anything — for a
 * contact of another organisation, an id no contact has and a deleted contact
 * alike, so the answer does not tell one from the other.
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Through the real app (buildApp, inject, the real database and Redis). Org A
 * and org B are organisations of this file; org A's owner session comes from
 * POST /api/v1/me/orgs/switch, its secret and publishable keys from POST
 * /api-keys.
 *
 *   X   org B's contact, per route: answer, org B's data in the answer and in
 *       the AI prompt, rows written, org B's rows changed, e-mails;
 *   XK  the same with org A's secret key; P with its publishable key;
 *   N   a uuid no contact has;
 *   D   org A's own contact after DELETE /contacts/:id;
 *   K   org A's own live contact: answer, rows, e-mails, prompt hash — and
 *       an archived, an unsubscribed and a bounced one (KS);
 *   E   the e-mails of org A's flow at org B's address;
 *   C   the statements one call makes, per route, X and K.
 *
 * Mocked: ONLY callClaude (lib/ai-client.ts) — a paid external service. The
 * mock keeps each prompt and answers a fixed JSON text. Flow e-mail jobs are
 * replayed into the API's own dispatch route (the workflow-email worker
 * forwards a job's data to it unchanged); the engine is not reached from this
 * process. Everything measured is printed once as `Z183_API_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { JobType, Queue } from 'bullmq';
import type * as AiClient from '../lib/ai-client.js';

const prompts = vi.hoisted(() => [] as { tenantId: string; user: string }[]);
vi.mock('../lib/ai-client.js', async (orig) => ({
  ...(await orig<typeof AiClient>()),
  callClaude: async (opts: { user: string; tenantId?: string }) => {
    prompts.push({ tenantId: opts.tenantId ?? '', user: opts.user });
    return {
      text: JSON.stringify({
        subject: 'Z183 předmět',
        preheader: 'Z183',
        greeting: 'Dobrý den',
        body_html: '<p>Z183</p>',
        cta_text: 'Více',
        personalization_signals_used: ['first_name'],
      }),
      cached: false,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  },
}));

const { createTestApp, login, SEED } = await import('./setup/harness.js');
const { db } = await import('../db/client.js');
const { observeQueries } = await import('../db/explain-guard.js');
const { emailQueue: emailQueueTyped, mtaOtherQueue } = await import('../lib/queues.js');
const { redis } = await import('@forgemsg/shared/redis');
const { apiKeys, contacts, organizations, signupForms, workflowEvents, workflowRuns, workflows } =
  await import('../db/schema/index.js');

type Session = Awaited<ReturnType<typeof login>>;

const TAG = `z183-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const TAG_NAME = `${TAG}-tag`;
const T = TAG.slice(5);
// Org B's person: every value is unique to this run, so a hit is a leak.
const B = {
  first: `Bfirst${T}`,
  last: `Blast${T}`,
  field: `Bfield${T}`,
  sku: `Bsku${T}`,
  trait: `Btrait${T}`,
};
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };
// This file's own address for the public form submit: its own bucket.
const IP = `100.64.183.${1 + Math.floor(Math.random() * 250)}`;
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
const OPEN_AT = '2026-10-13T09:15:00.000Z'; // a Tuesday, 09 UTC

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId: string;
let seedBefore: Record<string, unknown> = {};
let orgA = '';
let orgB = '';
let ownerA: Record<string, string> = {};
let keyA: Record<string, string> = {};
let pubA: Record<string, string> = {};
let listA = '';
let flowM = '';
let flowT = '';
const missingId = randomUUID();
const contact: Record<string, string> = {};
const emails: Record<string, string> = {};
const cells: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag: TAG,
  mock: 'callClaude only (fixed JSON text, prompt kept); flow e-mail jobs replayed into the API dispatch route; no engine in this process',
};

const emailQueue = emailQueueTyped as unknown as Queue;

const rows = async <R>(q: SQL) => (await db.execute(q)) as unknown as R[];

const scrub = (s: string) =>
  s
    .split(TAG)
    .join('<TAG>')
    .split(T)
    .join('<T>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TIME>')
    .replace(/"version":"\d+"/g, '"version":"<V>"')
    .replace(/(INV|Q|QUO)-\d{4}-\d{4,}/g, '<NUM>');

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

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
  const o = seedOrgId;
  const [r] = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT count(*)::int FROM contacts WHERE org_id = ${o}::uuid) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id = ${o}::uuid) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN lists l ON l.id = cl.list_id WHERE l.org_id = ${o}::uuid) AS memberships,
           (SELECT count(*)::int FROM tags WHERE org_id = ${o}::uuid) AS tags,
           (SELECT count(*)::int FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE t.org_id = ${o}::uuid) AS contact_tags,
           (SELECT count(*)::int FROM quotes WHERE org_id = ${o}::uuid) AS quotes,
           (SELECT count(*)::int FROM invoices WHERE org_id = ${o}::uuid) AS invoices,
           (SELECT count(*)::int FROM contact_traits WHERE org_id = ${o}::uuid) AS traits,
           (SELECT coalesce(sum(total_opens), 0)::int FROM contact_engagement WHERE org_id = ${o}::uuid) AS opens,
           (SELECT count(*)::int FROM back_in_stock_subscriptions WHERE org_id = ${o}::uuid) AS stock_alerts,
           (SELECT count(*)::int FROM price_drop_subscriptions WHERE org_id = ${o}::uuid) AS price_alerts,
           (SELECT count(*)::int FROM signup_forms WHERE org_id = ${o}::uuid) AS forms,
           (SELECT count(*)::int FROM workflows WHERE org_id = ${o}::uuid) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = ${o}::uuid) AS runs,
           (SELECT count(*)::int FROM workflow_events WHERE org_id = ${o}::uuid) AS events,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${o}::uuid) AS api_keys,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${o}::uuid) AS members,
           (SELECT count(*)::int FROM users WHERE org_id = ${o}::uuid) AS users
  `);
  return r!;
}

/** What one call can leave behind for contact `id`, as numbers. */
async function footprint(id: string): Promise<Record<string, number | string>> {
  const [r] = await rows<Record<string, number | string>>(sql`
    SELECT (SELECT count(*)::int FROM quotes WHERE org_id = ${orgA}::uuid AND contact_id = ${id}::uuid) AS quotes,
           (SELECT count(*)::int FROM invoices WHERE org_id = ${orgA}::uuid AND contact_id = ${id}::uuid) AS invoices,
           (SELECT count(*)::int FROM workflow_runs WHERE workflow_id IN (${flowM}::uuid, ${flowT}::uuid) AND contact_id = ${id}::uuid) AS workflow_runs,
           (SELECT count(*)::int FROM contact_tags WHERE contact_id = ${id}::uuid) AS contact_tags,
           (SELECT count(*)::int FROM contact_lists WHERE contact_id = ${id}::uuid) AS contact_lists,
           (SELECT coalesce(max(version), '') FROM contact_traits WHERE contact_id = ${id}::uuid) AS traits_version,
           (SELECT coalesce(max(total_opens), 0)::int FROM contact_engagement WHERE contact_id = ${id}::uuid) AS opens
  `);
  return r!;
}

function delta(
  before: Record<string, number | string>,
  after: Record<string, number | string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(after)) {
    const b = before[k];
    if (k === 'traits_version') out.contact_traits = v === b ? 0 : 1;
    else if (k === 'opens') out.contact_engagement_opens = Number(v) - Number(b);
    else out[k] = Number(v) - Number(b);
  }
  return out;
}

const NOTHING_WRITTEN = {
  quotes: 0,
  invoices: 0,
  workflow_runs: 0,
  contact_tags: 0,
  contact_lists: 0,
  contact_traits: 0,
  contact_engagement_opens: 0,
};

/** Org B's rows that org A must never change: snapshot as text. */
async function orgBRows(): Promise<string> {
  const b = contact.b!;
  const r = await rows<Record<string, unknown>>(sql`
    SELECT (SELECT row_to_json(t) FROM (SELECT org_id, values, version, computed_at FROM contact_traits WHERE contact_id = ${b}::uuid) t) AS traits,
           (SELECT row_to_json(e) FROM (SELECT org_id, open_hour_histogram, open_day_histogram, total_opens, updated_at FROM contact_engagement WHERE contact_id = ${b}::uuid) e) AS engagement,
           (SELECT count(*)::int FROM contact_tags WHERE contact_id = ${b}::uuid) AS tags,
           (SELECT count(*)::int FROM contact_lists WHERE contact_id = ${b}::uuid) AS lists,
           (SELECT count(*)::int FROM workflow_runs WHERE contact_id = ${b}::uuid) AS runs
  `);
  return JSON.stringify(r[0]);
}

interface Reach {
  emailJobs: number;
  replay: string[];
  mta: { stream: string; purpose: string; subject: string }[];
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
  }));
  for (const j of mtaJobs) await j.remove().catch(() => {});
  return { emailJobs: jobs.length, replay: replay.sort(), mta };
}

/** Statements the app ran during `run`. */
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

const ROUTES = ['ai', 'aiBatch', 'stock', 'price', 'traits', 'open', 'quote', 'trigger'] as const;
type Route = (typeof ROUTES)[number];

/** One call of `route` for contact `id`, as `who`. */
function call(route: Route, id: string, who: Record<string, string>, goal: string) {
  switch (route) {
    case 'ai':
      return inject('POST', '/api/v1/ai/generate-per-recipient', who, {
        contactId: id,
        campaignGoal: goal,
        ctaUrl: 'https://obchod.example/akce',
      });
    case 'aiBatch':
      // An own live contact first, then the id under test.
      return inject('POST', '/api/v1/ai/generate-per-recipient', who, {
        contactIds: [contact.ownbatch, id],
        campaignGoal: goal,
        ctaUrl: 'https://obchod.example/akce',
      });
    case 'stock':
      return inject('GET', `/api/v1/back-in-stock/contact/${id}`, who);
    case 'price':
      return inject('GET', `/api/v1/price-drop/contact/${id}`, who);
    case 'traits':
      return inject('POST', `/api/v1/cdp/traits/${id}`, who);
    case 'open':
      return inject('POST', '/api/v1/send-optimization/record-open', who, {
        contactId: id,
        at: OPEN_AT,
      });
    case 'quote':
      return inject('POST', '/api/v1/commerce/quotes', who, {
        contactId: id,
        title: 'Z183 nabídka',
        currency: 'CZK',
        lineItems: [{ sku: 'Z183', name: 'Z183 položka', qty: 1, unitPrice: 100 }],
      });
    case 'trigger':
      return inject('POST', `/api/v1/workflows/${flowM}/trigger`, who, { contactId: id });
  }
}

interface Cell {
  status: number;
  body: string;
  /** org B's data in the answer, per field. */
  answerShowsB: Record<string, boolean>;
  /** AI calls this cell made, and whether a prompt carried org B's data. */
  aiCalls: number;
  promptShowsB: boolean;
  promptHash: string[];
  written: Record<string, number>;
  orgBChanged: boolean;
  reach: Reach;
  queries: number;
}

function showsB(text: string): Record<string, boolean> {
  return {
    email: text.toLowerCase().includes((emails.b ?? '').toLowerCase()),
    firstName: text.includes(B.first),
    lastName: text.includes(B.last),
    customField: text.includes(B.field),
    sku: text.includes(B.sku),
    trait: text.includes(B.trait),
    id: text.includes(contact.b ?? ''),
  };
}

async function measure(
  route: Route,
  id: string,
  email: string | null,
  label: string,
  who: Record<string, string> = ownerA,
): Promise<Cell> {
  const before = await footprint(id);
  const bBefore = await orgBRows();
  const p0 = prompts.length;
  let res = { status: 0, body: '' };
  // The goal is the start of the cache key: one per cell, without the run's tag
  // so the prompt of an own contact is the same text on master and the branch.
  const goal = `${label} Z183 kampaň pro zákazníka`;
  const queries = await statements(async () => {
    res = await call(route, id, who, goal);
  });
  await new Promise((r) => setTimeout(r, 300));
  const after = await footprint(id);
  const made = prompts.slice(p0);
  const cell: Cell = {
    status: res.status,
    body: scrub(res.body).slice(0, 2000),
    answerShowsB: showsB(res.body),
    aiCalls: made.length,
    promptShowsB: made.some((p) => p.user.includes(B.first) || p.user.includes(B.field)),
    promptHash: made.map((p) => sha(p.user)).sort(),
    written: delta(before, after),
    orgBChanged: (await orgBRows()) !== bBefore,
    reach: email ? await reach(id, email) : { emailJobs: 0, replay: [], mta: [] },
    queries,
  };
  cells[label] = cell;
  console.log(`[z183] ${label}: ${JSON.stringify(cell)}`);
  return cell;
}

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

async function newKey(isPublic: boolean): Promise<Record<string, string>> {
  const r = await inject('POST', '/api/v1/api-keys', ownerA, {
    name: `${TAG} ${isPublic ? 'public' : 'secret'}`,
    ...(isPublic ? { isPublic: true } : {}),
  });
  expect(r.status, r.body).toBeLessThan(300);
  return { 'x-api-key': (JSON.parse(r.body) as { data: { rawKey: string } }).data.rawKey };
}

async function newContact(
  orgId: string,
  label: string,
  values: Partial<typeof contacts.$inferInsert> = {},
): Promise<void> {
  const email = `${label}-${TAG}@${DOMAIN}`;
  const [c] = await db
    .insert(contacts)
    .values({
      orgId,
      email,
      firstName: 'Petra',
      lastName: 'Nováková',
      customFields: { plan: 'gold' },
      status: 'active',
      ...values,
    })
    .returning({ id: contacts.id });
  contact[label] = c!.id;
  emails[label] = email;
}

async function newFlow(
  label: string,
  triggerType: 'manual' | 'api_event',
  triggerConfig: Record<string, unknown>,
  actions: { id: string; type: string; config: Record<string, unknown> }[],
): Promise<string> {
  const nodes: { id: string; type: string; config: Record<string, unknown> }[] = [
    { id: 'trigger', type: 'trigger', config: { triggerType, ...triggerConfig } },
  ];
  const edges: { id: string; source: string; target: string }[] = [];
  let prev = 'trigger';
  for (const a of actions) {
    nodes.push(a);
    edges.push({ id: `e-${a.id}`, source: prev, target: a.id });
    prev = a.id;
  }
  const [w] = await db
    .insert(workflows)
    .values({
      orgId: orgA,
      name: `${TAG} ${label}`,
      status: 'active',
      triggerType,
      triggerConfig,
      nodes: nodes as never,
      edges: edges as never,
    })
    .returning({ id: workflows.id });
  return w!.id;
}

async function perRecipientKeys(): Promise<string[]> {
  const out: string[] = [];
  for (const org of [orgA, orgB].filter(Boolean)) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `per-recipient:${org}:*`,
        'COUNT',
        500,
      );
      cursor = next;
      out.push(...keys);
    } while (cursor !== '0');
  }
  return out;
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
  keyA = await newKey(false);
  pubA = await newKey(true);

  await db.execute(sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${orgA}, ${DOMAIN}, 'fm1', true, true, true, true)
  `);
  const l = await inject('POST', '/api/v1/lists', ownerA, { name: `${TAG} list` });
  expect(l.status, l.body).toBeLessThan(300);
  listA = (JSON.parse(l.body) as { data: { id: string } }).data.id;
  // The tag org A's flow adds (add_tag finds it by name in org A).
  await db.execute(sql`INSERT INTO tags (org_id, name) VALUES (${orgA}::uuid, ${TAG_NAME})`);

  await newContact(orgB, 'b', {
    firstName: B.first,
    lastName: B.last,
    customFields: { note: B.field },
  });
  for (const label of ['own', 'ownbatch', 'ownt', 'ownsf', 'del']) await newContact(orgA, label);
  await newContact(orgA, 'archived', { status: 'archived', archivedFrom: 'active' });
  await newContact(orgA, 'unsubscribed', { status: 'unsubscribed' });
  await newContact(orgA, 'bounced', { status: 'bounced' });
  const d = await inject('DELETE', `/api/v1/contacts/${contact.del}`, ownerA);
  expect(d.status, d.body).toBeLessThan(300);
  const [delRow] = await db
    .select({ deletedAt: contacts.deletedAt })
    .from(contacts)
    .where(eq(contacts.id, contact.del!));
  report.deletion = { answer: d.status, deletedAtSet: delRow?.deletedAt != null };

  // Org B's own rows that org A must never read or change, and org A's own.
  await db.execute(sql`
    INSERT INTO back_in_stock_subscriptions (org_id, contact_id, sku)
    VALUES (${orgB}::uuid, ${contact.b}::uuid, ${B.sku})
  `);
  await db.execute(sql`
    INSERT INTO price_drop_subscriptions (org_id, contact_id, sku, price_at_subscribe)
    VALUES (${orgB}::uuid, ${contact.b}::uuid, ${B.sku}, 100)
  `);
  for (const label of ['own', 'del', 'archived', 'unsubscribed', 'bounced']) {
    await db.execute(sql`
      INSERT INTO back_in_stock_subscriptions (org_id, contact_id, sku)
      VALUES (${orgA}::uuid, ${contact[label]}::uuid, ${`a-${label}-sku`})
    `);
    await db.execute(sql`
      INSERT INTO price_drop_subscriptions (org_id, contact_id, sku, price_at_subscribe)
      VALUES (${orgA}::uuid, ${contact[label]}::uuid, ${`a-${label}-sku`}, 100)
    `);
  }
  await db.execute(sql`
    INSERT INTO contact_traits (contact_id, org_id, values, version)
    VALUES (${contact.b}::uuid, ${orgB}::uuid, ${JSON.stringify({ marker: B.trait })}::jsonb, '1')
  `);
  await db.execute(sql`
    INSERT INTO contact_engagement (contact_id, org_id, total_opens)
    VALUES (${contact.b}::uuid, ${orgB}::uuid, 5)
  `);

  flowM = await newFlow('manual', 'manual', {}, [
    { id: 'tag', type: 'add_tag', config: { tagName: TAG_NAME } },
    { id: 'list', type: 'move_to_list', config: { listId: listA } },
    {
      id: 'mail',
      type: 'send_email',
      config: { subject: 'Z183 ruční flow', html: '<p>Dobrý den, {{first_name}}.</p>' },
    },
  ]);
  flowT = await newFlow('transactional', 'api_event', { eventName: 'order_shipped' }, [
    {
      id: 'mail',
      type: 'send_email',
      config: {
        subject: 'Z183 odesláno',
        html: '<p>Vaše objednávka je na cestě.</p>',
        priority: 'transactional',
      },
    },
  ]);
}, 120_000);

afterAll(async () => {
  const ids = [...Object.values(contact), missingId];
  for (const j of await emailQueue.getJobs(ALL, 0, 10_000))
    if (ids.includes(j?.data?.contactId ?? '')) await j.remove().catch(() => {});
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000))
    if (j?.data?.toEmail?.toLowerCase().endsWith(`@${DOMAIN}`)) await j.remove().catch(() => {});
  const keys = await perRecipientKeys();
  // What the AI cells left in the cache, by whose contact, before it is removed.
  report.perRecipientCacheBeforeCleanup = {
    total: keys.length,
    orgBContact: keys.filter((k) => k.includes(`:${contact.b}:`)).length,
    deletedContact: keys.filter((k) => k.includes(`:${contact.del}:`)).length,
  };
  if (keys.length) await redis.del(...keys);
  const orgs = [orgA, orgB].filter(Boolean);
  await db.delete(workflowRuns).where(inArray(workflowRuns.contactId, ids));
  await db.delete(workflowEvents).where(inArray(workflowEvents.contactId, ids));
  await db.execute(sql`DELETE FROM invoices WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)`);
  await db.execute(sql`DELETE FROM quotes WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)`);
  await db.delete(signupForms).where(inArray(signupForms.orgId, orgs));
  await db.delete(apiKeys).where(inArray(apiKeys.orgId, orgs));
  await db.execute(sql`DELETE FROM audit_logs WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)`);
  // Everything else of org A and org B goes with the organisation (ON DELETE CASCADE).
  await db.delete(organizations).where(inArray(organizations.id, orgs));
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id IN (${orgA}::uuid, ${orgB}::uuid)) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS lists,
           (SELECT count(*)::int FROM tags WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS tags,
           (SELECT count(*)::int FROM quotes WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS quotes,
           (SELECT count(*)::int FROM invoices WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS invoices,
           (SELECT count(*)::int FROM contact_traits WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS traits,
           (SELECT count(*)::int FROM contact_engagement WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS engagement,
           (SELECT count(*)::int FROM back_in_stock_subscriptions WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS stock_alerts,
           (SELECT count(*)::int FROM price_drop_subscriptions WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS price_alerts,
           (SELECT count(*)::int FROM signup_forms WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS forms,
           (SELECT count(*)::int FROM workflows WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS workflows,
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
  const cacheLeft = (await perRecipientKeys()).length;
  const seedAfter = await seedState();
  report.cells = cells;
  report.leftover = { ...left, jobs: jobsLeft, perRecipientCache: cacheLeft };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  console.log(`Z183_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    lists: 0,
    tags: 0,
    quotes: 0,
    invoices: 0,
    traits: 0,
    engagement: 0,
    stock_alerts: 0,
    price_alerts: 0,
    forms: 0,
    workflows: 0,
    events: 0,
    runs: 0,
    api_keys: 0,
    members: 0,
  });
  expect(jobsLeft).toBe(0);
  expect(cacheLeft).toBe(0);
  // The seed org exactly as this file found it — a snapshot, not zeros.
  expect(seedAfter).toEqual(seedBefore);
}, 120_000);

/** The answer of a contact that is not a live contact of org A: Z182's 404, verbatim. */
function expectRefused(c: Cell) {
  expect(c.status, c.body).toBe(404);
  expect(JSON.parse(c.body)).toEqual(NOT_FOUND);
  expect(c.aiCalls).toBe(0);
  expect(c.written).toEqual(NOTHING_WRITTEN);
  expect(c.orgBChanged).toBe(false);
  expect(c.reach.emailJobs).toBe(0);
  expect(c.reach.mta).toEqual([]);
}

describe('a contact id that is not a live contact of the org: 404, nothing read, nothing written (Z183)', () => {
  for (const route of ROUTES) {
    it(`X ${route} — org B’s contact (owner session): 404 Contact, nothing of org B read or changed`, async () => {
      const c = await measure(route, contact.b!, emails.b!, `X-${route}`);
      expect(Object.values(c.answerShowsB).some(Boolean), JSON.stringify(c.answerShowsB)).toBe(
        false,
      );
      expect(c.promptShowsB).toBe(false);
      expectRefused(c);
    });

    it(`XK ${route} — org B’s contact (secret key): the same answer`, async () => {
      const c = await measure(route, contact.b!, emails.b!, `XK-${route}`, keyA);
      expect(Object.values(c.answerShowsB).some(Boolean), JSON.stringify(c.answerShowsB)).toBe(
        false,
      );
      expectRefused(c);
    });

    it(`N ${route} — an id no contact has: the same answer as X, nothing written`, async () => {
      expectRefused(await measure(route, missingId, null, `N-${route}`));
    });

    it(`D ${route} — org A’s deleted contact: the same answer as X, nothing written`, async () => {
      expectRefused(await measure(route, contact.del!, emails.del!, `D-${route}`));
    });
  }

  it('Q — a quote with org B’s contact cannot become an invoice with it: no quote, so no invoice', async () => {
    const res = await call('quote', contact.b!, ownerA, '');
    let convert = 'no quote';
    if (res.status === 201) {
      const q = (JSON.parse(res.body) as { data: { id: string } }).data.id;
      const r = await inject('POST', `/api/v1/commerce/quotes/${q}/convert-to-invoice`, ownerA, {});
      convert = `${r.status} ${scrub(r.body).slice(0, 200)}`;
    }
    const [inv] = await rows<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM invoices WHERE org_id = ${orgA}::uuid AND contact_id = ${contact.b}::uuid
    `);
    const cell = { quote: res.status, convert, invoicesWithB: inv!.n };
    cells.Q_convert = cell;
    console.log(`[z183] Q convert: ${JSON.stringify(cell)}`);
    expect(cell.quote).toBe(404);
    expect(cell.invoicesWithB).toBe(0);
  });

  it('P — the publishable key on the two alert lists: refused before any contact check', async () => {
    const out: Record<string, unknown> = {};
    for (const route of ['stock', 'price'] as const)
      for (const [label, id] of [
        ['X', contact.b!],
        ['K', contact.own!],
      ] as const) {
        const r = await call(route, id, pubA, '');
        out[`${label}-${route}`] = {
          status: r.status,
          body: scrub(r.body),
          showsB: showsB(r.body),
        };
      }
    cells.P = out;
    console.log(`[z183] P: ${JSON.stringify(out)}`);
    for (const v of Object.values(out) as { status: number }[]) expect(v.status).toBe(403);
  });
});

describe('controls — org A’s own contacts, the same on master and the branch (Z183)', () => {
  it('K ai — own contact: 200, one AI call with the own profile', async () => {
    const c = await measure('ai', contact.own!, emails.own!, 'K-ai');
    expect(c.status, c.body).toBe(200);
    expect(JSON.parse(c.body)).toEqual({
      data: {
        subject: 'Z183 předmět',
        preheader: 'Z183',
        greeting: 'Dobrý den',
        bodyHtml: '<p>Z183</p>',
        ctaText: 'Více',
        personalizationSignalsUsed: ['first_name'],
      },
    });
    expect(c.aiCalls).toBe(1);
    expect(c.written).toEqual(NOTHING_WRITTEN);
  });

  it('K aiBatch — two own contacts: 200, both generated', async () => {
    const c = await measure('aiBatch', contact.archived!, emails.archived!, 'K-aiBatch');
    expect(c.status, c.body).toBe(200);
    // Both keys scrub to <UUID>, so count the generated items in the text.
    expect(c.body.match(/"<UUID>":\{"subject"/g) ?? []).toHaveLength(2);
    expect(c.aiCalls).toBe(2);
  });

  it('K stock / price — own contact: 200 with its one alert', async () => {
    for (const route of ['stock', 'price'] as const) {
      const c = await measure(route, contact.own!, emails.own!, `K-${route}`);
      expect(c.status, c.body).toBe(200);
      const data = (JSON.parse(c.body) as { data: { sku: string }[] }).data;
      expect(data.map((d) => d.sku)).toEqual(['a-own-sku']);
    }
  });

  it('K traits — own contact: 200, its traits row written', async () => {
    const c = await measure('traits', contact.own!, emails.own!, 'K-traits');
    expect(c.status, c.body).toBe(200);
    expect(c.written).toEqual({ ...NOTHING_WRITTEN, contact_traits: 1 });
    expect(c.orgBChanged).toBe(false);
  });

  it('K open — own contact: 200, its open histogram +1', async () => {
    const c = await measure('open', contact.own!, emails.own!, 'K-open');
    expect(c.status, c.body).toBe(200);
    expect(JSON.parse(c.body)).toEqual({ ok: true });
    expect(c.written).toEqual({ ...NOTHING_WRITTEN, contact_engagement_opens: 1 });
    const [h] = await rows<{ hour: number; day: number }>(sql`
      SELECT (open_hour_histogram->>9)::int AS hour, (open_day_histogram->>2)::int AS day
      FROM contact_engagement WHERE contact_id = ${contact.own}::uuid
    `);
    expect(h).toEqual({ hour: 1, day: 1 });
  });

  it('K quote → invoice — own contact: 201 quote, 201 invoice with the same contact', async () => {
    const c = await measure('quote', contact.own!, emails.own!, 'K-quote');
    expect(c.status, c.body).toBe(201);
    expect(c.written).toEqual({ ...NOTHING_WRITTEN, quotes: 1 });
    const [q] = await rows<{ id: string }>(sql`
      SELECT id FROM quotes WHERE org_id = ${orgA}::uuid AND contact_id = ${contact.own}::uuid
    `);
    const r = await inject(
      'POST',
      `/api/v1/commerce/quotes/${q!.id}/convert-to-invoice`,
      ownerA,
      {},
    );
    const inv = (JSON.parse(r.body) as { data: { contactId: string; status: string } }).data;
    const cell = {
      status: r.status,
      body: scrub(r.body).slice(0, 400),
      sameContact: inv.contactId === contact.own,
    };
    cells['K-convert'] = cell;
    console.log(`[z183] K convert: ${JSON.stringify(cell)}`);
    expect(r.status, r.body).toBe(201);
    expect(cell.sameContact).toBe(true);
    expect(inv.status).toBe('draft');
  });

  it('K trigger — own contact, marketing flow: a run, the tag, the list, one e-mail', async () => {
    const c = await measure('trigger', contact.own!, emails.own!, 'K-trigger');
    expect(c.status, c.body).toBe(200);
    expect(c.written).toEqual({
      ...NOTHING_WRITTEN,
      workflow_runs: 1,
      contact_tags: 1,
      contact_lists: 1,
    });
    expect(c.reach.emailJobs).toBe(1);
    // Stream and purpose as on master (measured there).
    expect(c.reach.mta).toEqual([
      { stream: 'transactional', purpose: 'workflow_marketing', subject: 'Z183 ruční flow' },
    ]);
  });

  it('K trigger transactional — own contact, a transactional node: a run, one transactional e-mail', async () => {
    const before = await footprint(contact.ownt!);
    let res = { status: 0, body: '' };
    const queries = await statements(async () => {
      res = await inject('POST', `/api/v1/workflows/${flowT}/trigger`, ownerA, {
        contactId: contact.ownt,
      });
    });
    await new Promise((r) => setTimeout(r, 300));
    const cell = {
      status: res.status,
      body: scrub(res.body).slice(0, 400),
      written: delta(before, await footprint(contact.ownt!)),
      reach: await reach(contact.ownt!, emails.ownt!),
      queries,
    };
    cells['K-triggerT'] = cell;
    console.log(`[z183] K triggerT: ${JSON.stringify(cell)}`);
    expect(cell.status, cell.body).toBe(200);
    expect(cell.written.workflow_runs).toBe(1);
    expect(cell.reach.emailJobs).toBe(1);
    // Stream and purpose as on master (measured there): no purpose, the
    // transactional exception of the node.
    expect(cell.reach.mta).toEqual([
      { stream: 'transactional', purpose: '-', subject: 'Z183 odesláno' },
    ]);
  });

  it('K signup form — a form with workflowId starts the flow for its contact, as before', async () => {
    const [f] = await db
      .insert(signupForms)
      .values({
        orgId: orgA,
        name: `${TAG} form`,
        fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }] as never,
        config: { workflowId: flowM } as never,
        active: true,
      })
      .returning({ id: signupForms.id });
    const before = await footprint(contact.ownsf!);
    const res = await app.inject({
      method: 'POST',
      url: `/public/forms/${f!.id}/submit`,
      payload: { email: emails.ownsf! },
      remoteAddress: IP,
    });
    let after = before;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      after = await footprint(contact.ownsf!);
      if (Number(after.workflow_runs) > Number(before.workflow_runs)) break;
    }
    await new Promise((r) => setTimeout(r, 300));
    const cell = {
      status: res.statusCode,
      sameContact: res.body.includes(contact.ownsf!),
      written: delta(before, await footprint(contact.ownsf!)),
      reach: await reach(contact.ownsf!, emails.ownsf!),
    };
    cells['K-signup'] = cell;
    console.log(`[z183] K signup: ${JSON.stringify(cell)}`);
    expect(cell.status, res.body).toBe(200);
    expect(cell.written.workflow_runs).toBe(1);
    expect(cell.reach.emailJobs).toBe(1);
  });

  it('KS — an archived, an unsubscribed and a bounced own contact get the same answers as an active one', async () => {
    const out: Record<string, Record<string, number>> = {};
    for (const label of ['archived', 'unsubscribed', 'bounced'] as const) {
      out[label] = {};
      for (const route of ['ai', 'stock', 'price', 'traits', 'open', 'quote', 'trigger'] as const) {
        const r = await call(route, contact[label]!, keyA, `KS-${label}-${route} Z183 kampaň`);
        out[label]![route] = r.status;
      }
      await reach(contact[label]!, emails[label]!);
    }
    cells.KS = out;
    console.log(`[z183] KS: ${JSON.stringify(out)}`);
    for (const label of ['archived', 'unsubscribed', 'bounced'] as const)
      expect(out[label]).toEqual({
        ai: 200,
        stock: 200,
        price: 200,
        traits: 200,
        open: 200,
        quote: 201,
        trigger: 200,
      });
  });
});
