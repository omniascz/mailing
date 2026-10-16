/**
 * The app-studio ingest, and onApiEvent under it, start nothing for a contact
 * that is not the organisation's own (Z169).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * POST /api/v1/app-studio/ingest/:appSlug/:triggerKey authenticates the app's
 * token, then handed `body.contactId` straight to onApiEvent(installedApp.orgId,
 * …). Nothing checked that the contact belongs to that organisation, and
 * onApiEvent did not either: it wrote a workflow_events row pairing org A with
 * the id and started every active api_event flow of org A on it. A contact of
 * another organisation never gave org A any consent, so a run, a job or a change
 * made on that person is made without consent (Z161 MIMO 1). POST
 * /api/v1/events has always answered 404 `Contact` for such an id; the ingest
 * now answers the same, and onApiEvent itself starts nothing for an id that is
 * not a contact of `orgId` — a guard for every one of its callers.
 *
 * ─── What this file measures ─────────────────────────────────────────────────
 *
 * Through the real app (buildApp, inject, the real database and Redis). Org A
 * and org B are organisations of this file; org A's owner session comes from
 * POST /api/v1/me/orgs/switch, its app and triggers from the app-studio routes
 * (the token is the one the route answered). Org A has one active flow per node
 * kind on the app's event (tag, list, field, webhook, inline and template
 * e-mail, SMS, WhatsApp, web push) and four on ticketing.order_paid with
 * transactional nodes. Each cell records the HTTP answer, workflow_events and
 * workflow_runs rows for the contact, the jobs it left on the channel queues,
 * what the API's own dispatch routes do with those jobs (the workflow-email
 * and workflow-sms workers forward a job's data to them unchanged), the MTA and
 * batch-sender jobs that follow, the webhook calls and the contact's own rows.
 *
 *   X   the ingest with org B's contact, flows on the app's event;
 *   X2  the same on ticketing.order_paid (the transactional exception);
 *   N   a uuid no contact has;
 *   K   org A's own contact: active, unsubscribed × marketing, unsubscribed ×
 *       ticketing.order_paid, POST /events, POST /ticketing/events, createDeal;
 *   P   onApiEvent(org A, org B's contact) called directly, and with org A's own;
 *   S3  what a viewer may do in app-studio (recorded, not changed);
 *   C   the queries the ingest and onApiEvent make, and the plan of the lookup.
 *
 * Mocked: only fetch to this file's webhook host (send_webhook); the SMS route
 * of org A names a provider that does not exist, so "Unknown SMS provider"
 * means past every gate and nothing left the machine. Everything measured is
 * printed once as `Z169_API_CELLS_JSON {…}`.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The workers (batch-sender, mta-sender, whatsapp, push): the workers file
 *   apps/workers/src/integration/app-studio-foreign-contact walks those.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Job, JobType, Queue } from 'bullmq';
import { createTestApp, login, SEED, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { observeQueries } from '../db/explain-guard.js';
import { onApiEvent } from '../services/workflows/triggers.js';
import { createDeal } from '../services/crm/deals.js';
import {
  batchSenderTriggeredQueue,
  emailQueue,
  mtaOtherQueue,
  pushQueue,
  smsQueue,
  whatsappQueue,
} from '../lib/queues.js';
import {
  apiKeys,
  appStudioApps,
  contacts,
  deals,
  lists,
  organizations,
  pipelines,
  tags,
  templates,
  users,
  workflowEvents,
  workflowRuns,
  workflows,
} from '../db/schema/index.js';

const TAG = `z169-${randomUUID().slice(0, 8)}`;
const DOMAIN = `${TAG}.test`;
const HOOK_HOST = `${TAG}-hook.invalid`;
const SINK = `${TAG}-sink`;
// As it reads in a scrubbed replay: the file tag is replaced there.
const SMS_REACHED = 'Unknown SMS provider: <TAG>-sink';
const EV_X = `${TAG}-x`;
const EV_QUIET = `${TAG}-quiet`;
const EV_DEAL = 'deal_created';
const TICKETING = 'ticketing.order_paid';
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
const QUEUES: Record<'email' | 'sms' | 'wa' | 'push', Queue> = {
  email: emailQueue as unknown as Queue,
  sms: smsQueue as unknown as Queue,
  wa: whatsappQueue as unknown as Queue,
  push: pushQueue as unknown as Queue,
};

let app: FastifyInstance;
let seedSession: Session;
let seedOrgId: string;
let startedAt: Date;
let orgA = '';
let orgB = '';
let ownerA: Record<string, string> = {};
let viewerA: Record<string, string> = {};
let appId = '';
let appSlug = '';
let appToken = '';
let apiKeyA = '';
let listA = '';
let templateA = '';
let pipelineA = '';
const missingId = randomUUID();
const contact = { b: '', own: '', ownUnsub: '' };
const emails = { b: '', own: '', ownUnsub: '' };
const flows: Record<string, string> = {};
const createdUsers: string[] = [];
let seedBefore: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag: TAG,
  mock:
    'fetch to the webhook host only; SMS ends at a route whose provider does not exist; ' +
    'everything else is real (no workers run in this process)',
};

// ── webhook capture (send_webhook) ──────────────────────────────────────────
const hookBodies: string[] = [];
const realFetch = globalThis.fetch;
function stubHook() {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (new URL(url).hostname === HOOK_HOST) {
      hookBodies.push(String(init?.body ?? ''));
      return new Response('{}', { status: 200 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

const rows = async <T>(q: SQL) => (await db.execute(q)) as unknown as T[];

const scrub = (s: string) =>
  s
    .split(TAG)
    .join('<TAG>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TIME>');

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
    SELECT (SELECT count(*)::int FROM workflows WHERE org_id = ${seedOrgId}::uuid) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = ${seedOrgId}::uuid) AS runs,
           (SELECT count(*)::int FROM workflow_events WHERE org_id = ${seedOrgId}::uuid) AS events,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}::uuid) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}::uuid AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM app_studio_apps WHERE org_id = ${seedOrgId}::uuid) AS apps,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}::uuid) AS api_keys,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}::uuid) AS members,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrgId}::uuid) AS users
  `);
  return r!;
}

/** Everything of a contact that a flow node could change, as one JSON string. */
async function contactFootprint(id: string): Promise<string> {
  const [c] = await rows<Record<string, unknown>>(sql`
    SELECT row_to_json(c)::text AS row,
           (SELECT count(*)::int FROM contact_tags WHERE contact_id = c.id) AS tags,
           (SELECT count(*)::int FROM contact_lists WHERE contact_id = c.id) AS lists,
           (SELECT count(*)::int FROM suppressions WHERE org_id = c.org_id AND lower(email) = lower(c.email)) AS suppressions
    FROM contacts c WHERE c.id = ${id}::uuid
  `);
  return JSON.stringify(c ?? null);
}

async function eventsOf(id: string): Promise<number> {
  const r = await db
    .select({ id: workflowEvents.id })
    .from(workflowEvents)
    .where(eq(workflowEvents.contactId, id));
  return r.length;
}

/** This file's runs for the contact, by flow label: "status" or "status: error". */
async function runsOf(id: string): Promise<Record<string, string>> {
  const ids = Object.values(flows);
  const r = await db
    .select({
      workflowId: workflowRuns.workflowId,
      orgId: workflowRuns.orgId,
      status: workflowRuns.status,
      error: workflowRuns.errorMessage,
    })
    .from(workflowRuns)
    .where(and(inArray(workflowRuns.workflowId, ids), eq(workflowRuns.contactId, id)));
  const label = Object.fromEntries(Object.entries(flows).map(([k, v]) => [v, k]));
  return Object.fromEntries(
    r.map((x) => [
      label[x.workflowId]!,
      `${x.status}${x.orgId === orgA ? '' : ` org=${x.orgId}`}${x.error ? `: ${x.error.slice(0, 120)}` : ''}`,
    ]),
  );
}

async function jobsOn(q: Queue, id: string): Promise<Job[]> {
  return (await q.getJobs(ALL, 0, 10_000)).filter((j) => j?.data?.contactId === id);
}

/** MTA jobs to `email`, and batch-sender jobs naming `id`; removed once counted. */
async function downstream(id: string, email: string) {
  const mta = (await mtaOtherQueue.getJobs(ALL, 0, 10_000)).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === email.toLowerCase(),
  );
  const batch = (await batchSenderTriggeredQueue.getJobs(ALL, 0, 10_000)).filter((j) =>
    (j?.data?.contactIds as string[] | undefined)?.includes(id),
  );
  const out = {
    mta: mta.map((j) => `${j.data.stream}/${j.data.purpose ?? '-'}`),
    batch: batch.map((j) =>
      j.data.flowTransactional ? 'ft' : j.data.flowMarketing ? 'fm' : '-',
    ) as string[],
  };
  for (const j of [...mta, ...batch]) await j.remove().catch(() => {});
  return out;
}

interface Cell {
  status: number;
  body: string;
  events: number;
  runs: Record<string, string>;
  jobs: Record<string, number>;
  replay: string[];
  mta: string[];
  batch: string[];
  hooks: number;
  contactChanged: boolean | null;
}

/**
 * Fire `act`, then read what it left for contact `id`: rows, jobs, what the
 * dispatch routes answer for the e-mail and SMS jobs, and what those queued.
 */
async function measure(
  id: string,
  email: string | null,
  act: () => Promise<{ status: number; body: string }>,
  settleMs = 0,
): Promise<Cell> {
  // A run left by an earlier cell must not stop this one from starting.
  await db.delete(workflowRuns).where(inArray(workflowRuns.workflowId, Object.values(flows)));
  const footprint0 = email ? await contactFootprint(id) : null;
  const events0 = await eventsOf(id);
  const hooks0 = hookBodies.filter((b) => b.includes(id)).length;
  const res = await act();
  if (settleMs) await new Promise((r) => setTimeout(r, settleMs));
  const jobs: Record<string, number> = {};
  const replay: string[] = [];
  for (const [name, q] of Object.entries(QUEUES)) {
    const mine = await jobsOn(q, id);
    jobs[name] = mine.length;
    for (const j of mine) {
      if (name === 'email' || name === 'sms') {
        const r = await inject(
          'POST',
          `/api/v1/internal/workflow/send-${name === 'email' ? 'email' : 'sms'}`,
          INTERNAL,
          j.data,
        );
        replay.push(`${name} ${r.status} ${scrub(r.body).slice(0, 160)}`);
      }
      await j.remove().catch(() => {});
    }
  }
  const down = email ? await downstream(id, email) : { mta: [], batch: [] };
  return {
    status: res.status,
    body: scrub(res.body),
    events: (await eventsOf(id)) - events0,
    runs: await runsOf(id),
    jobs,
    replay: replay.sort(),
    mta: down.mta,
    batch: down.batch,
    hooks: hookBodies.filter((b) => b.includes(id)).length - hooks0,
    contactChanged: email ? (await contactFootprint(id)) !== footprint0 : null,
  };
}

const ingest = (key: string, contactId: string) => () =>
  inject('POST', `/api/v1/app-studio/ingest/${appSlug}/${key}`, bearer(appToken), {
    contactId,
    payload: { order: { number: TAG } },
  });

/** A flow of org A on an api_event: trigger → the nodes in a row, active. */
async function flowOf(label: string, eventName: string, nodes: Record<string, unknown>[]) {
  const all = [{ id: 'trigger', type: 'trigger', config: { triggerType: 'api_event', eventName } }];
  const edges = nodes.map((n, i) => ({
    id: `e${i}`,
    source: i === 0 ? 'trigger' : String(nodes[i - 1]!.id),
    target: String(n.id),
  }));
  const [w] = await db
    .insert(workflows)
    .values({
      orgId: orgA,
      name: `${TAG} ${label}`,
      status: 'active',
      triggerType: 'api_event',
      triggerConfig: { eventName },
      nodes: [...all, ...nodes] as never,
      edges: edges as never,
    })
    .returning({ id: workflows.id });
  flows[label] = w!.id;
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
  // The seed user is the owner of this org too; its session is switched to it.
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

async function newContact(orgId: string, label: string, status: 'active' | 'unsubscribed') {
  const email = `${label}-${TAG}@${DOMAIN}`;
  const phone = `+4207${String(10_000_000 + Math.floor(Math.random() * 89_999_999)).slice(0, 8)}`;
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email, phone, firstName: 'Bára', status })
    .returning({ id: contacts.id });
  await db.execute(sql`
    INSERT INTO sms_consents (org_id, phone, consent_source, consent_context)
    VALUES (${orgId}, ${phone}, 'web_form', ${TAG})
  `);
  return { id: c!.id, email };
}

const cells: Record<string, Cell> = {};
const extra: Record<string, unknown> = {};

beforeAll(async () => {
  startedAt = new Date();
  app = await createTestApp();
  await app.ready();
  seedSession = await login(app);
  seedOrgId = seedSession.orgId;
  seedBefore = await seedState();
  stubHook();

  orgA = await newOrg('a');
  orgB = await newOrg('b');
  ownerA = await switchTo(orgA);

  // A viewer of org A, by a real login (Sonda 3).
  const [seedUser] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.email, SEED.email));
  const viewerEmail = `${TAG}-viewer@test.local`;
  const [v] = await db
    .insert(users)
    .values({
      orgId: orgA,
      email: viewerEmail,
      name: `${TAG} viewer`,
      passwordHash: seedUser!.hash,
      role: 'viewer',
      emailVerified: true,
    })
    .returning({ id: users.id });
  createdUsers.push(v!.id);
  viewerA = { cookie: (await login(app, viewerEmail)).cookie };

  await db.execute(sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${orgA}, ${DOMAIN}, 'fm1', true, true, true, true)
  `);
  await db.execute(sql`
    INSERT INTO sms_routes (org_id, country_code, provider, priority, active, config)
    VALUES (${orgA}, '*', ${SINK}, 0, true, '{}'::jsonb)
  `);

  // The app, its token and its triggers: the app-studio routes, as an owner.
  appSlug = `${TAG}-app`;
  const installed = await inject('POST', '/api/v1/app-studio/apps', ownerA, {
    slug: appSlug,
    name: `${TAG} app`,
  });
  expect(installed.status, installed.body).toBe(201);
  const inst = JSON.parse(installed.body) as { data: { id: string; accessToken: string } };
  appId = inst.data.id;
  appToken = inst.data.accessToken;
  for (const [key, eventName] of [
    ['x', EV_X],
    ['tk', TICKETING],
    ['quiet', EV_QUIET],
  ] as const) {
    const t = await inject('POST', `/api/v1/app-studio/apps/${appId}/triggers`, ownerA, {
      key,
      name: `${TAG} ${key}`,
      eventName,
    });
    expect(t.status, t.body).toBe(201);
  }
  const key = await inject('POST', '/api/v1/api-keys', ownerA, { name: `${TAG} key` });
  expect(key.status, key.body).toBeLessThan(300);
  apiKeyA = (JSON.parse(key.body) as { data: { rawKey: string } }).data.rawKey;

  await db.insert(tags).values({ orgId: orgA, name: `${TAG}-tag` });
  const [l] = await db
    .insert(lists)
    .values({ orgId: orgA, name: `${TAG} list` })
    .returning({ id: lists.id });
  listA = l!.id;
  const [t] = await db
    .insert(templates)
    .values({ orgId: orgA, name: `${TAG} tpl`, subject: 'Z169 šablona', locale: 'cs' })
    .returning({ id: templates.id });
  templateA = t!.id;
  const [p] = await db
    .insert(pipelines)
    .values({
      orgId: orgA,
      name: `${TAG} sales`,
      stages: [{ id: 'new', name: 'New', probability: 10, order: 0 }],
    })
    .returning({ id: pipelines.id });
  pipelineA = p!.id;

  const html = '<p>Ahoj {{first_name}}, Z169.</p>';
  await flowOf('tag', EV_X, [{ id: 'n', type: 'add_tag', config: { tagName: `${TAG}-tag` } }]);
  await flowOf('list', EV_X, [{ id: 'n', type: 'move_to_list', config: { listId: listA } }]);
  await flowOf('field', EV_X, [
    { id: 'n', type: 'update_field', config: { field: 'first_name', value: 'Z169' } },
    { id: 'n2', type: 'update_field', config: { field: 'z169', value: 'x' } },
  ]);
  await flowOf('hook', EV_X, [
    { id: 'n', type: 'send_webhook', config: { url: `https://${HOOK_HOST}/x` } },
  ]);
  await flowOf('inline', EV_X, [
    { id: 'n', type: 'send_email', config: { subject: 'Z169 inline', html } },
  ]);
  await flowOf('tpl', EV_X, [
    { id: 'n', type: 'send_email', config: { templateId: templateA, subject: 'Z169 šablona' } },
  ]);
  await flowOf('sms', EV_X, [
    { id: 'n', type: 'send_sms', config: { message: 'Z169 {{first_name}}' } },
  ]);
  await flowOf('wa', EV_X, [
    { id: 'n', type: 'send_whatsapp', config: { templateId: 'z169_flow' } },
  ]);
  await flowOf('push', EV_X, [
    { id: 'n', type: 'send_push', config: { title: 'Z169', body: 'flow' } },
  ]);
  await flowOf('tInline', TICKETING, [
    { id: 'n', type: 'send_email', config: { subject: 'Z169 T', html, priority: 'transactional' } },
  ]);
  await flowOf('tTpl', TICKETING, [
    {
      id: 'n',
      type: 'send_email',
      config: { templateId: templateA, subject: 'Z169 T šablona', priority: 'transactional' },
    },
  ]);
  await flowOf('tSms', TICKETING, [
    { id: 'n', type: 'send_sms', config: { message: 'Z169 T', priority: 'transactional' } },
  ]);
  await flowOf('tTag', TICKETING, [
    { id: 'n', type: 'add_tag', config: { tagName: `${TAG}-tag` } },
  ]);
  await flowOf('deal', EV_DEAL, [{ id: 'n', type: 'add_tag', config: { tagName: `${TAG}-tag` } }]);

  // Org B's contact: active, with consent on the number and the address on a
  // domain org A has verified — the worst case master can show.
  const b = await newContact(orgB, 'b', 'active');
  contact.b = b.id;
  emails.b = b.email;
  const own = await newContact(orgA, 'own', 'active');
  contact.own = own.id;
  emails.own = own.email;
  const unsub = await newContact(orgA, 'unsub', 'unsubscribed');
  contact.ownUnsub = unsub.id;
  emails.ownUnsub = unsub.email;
  const sup = await inject('POST', '/api/v1/suppressions', ownerA, {
    email: unsub.email,
    reason: 'unsubscribe',
  });
  expect(sup.status, sup.body).toBe(201);
}, 120_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  const ids = [contact.b, contact.own, contact.ownUnsub, missingId].filter(Boolean);
  for (const q of [...Object.values(QUEUES), batchSenderTriggeredQueue as unknown as Queue]) {
    for (const j of await q.getJobs(ALL, 0, 10_000)) {
      const d = j?.data as { contactId?: string; contactIds?: string[] } | undefined;
      if (d && (ids.includes(d.contactId ?? '') || d.contactIds?.some((x) => ids.includes(x))))
        await j.remove().catch(() => {});
    }
  }
  for (const j of await mtaOtherQueue.getJobs(ALL, 0, 10_000)) {
    if (j?.data?.toEmail?.toLowerCase().endsWith(`@${DOMAIN}`)) await j.remove().catch(() => {});
  }
  await db.delete(workflowRuns).where(inArray(workflowRuns.contactId, ids));
  await db.delete(workflowEvents).where(inArray(workflowEvents.contactId, ids));
  await db.delete(deals).where(eq(deals.orgId, orgA));
  if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
  await db.delete(apiKeys).where(inArray(apiKeys.orgId, [orgA, orgB].filter(Boolean)));
  await db.delete(appStudioApps).where(inArray(appStudioApps.orgId, [orgA, orgB].filter(Boolean)));
  await db.execute(sql`DELETE FROM sms_consents WHERE consent_context = ${TAG}`);
  await db.execute(sql`DELETE FROM audit_logs WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)`);
  // Everything else of org A and org B goes with the organisation (ON DELETE CASCADE).
  await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB].filter(Boolean)));
  const [left] = await rows<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM organizations WHERE id IN (${orgA}::uuid, ${orgB}::uuid)) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS contacts,
           (SELECT count(*)::int FROM workflow_events WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS events,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS runs,
           (SELECT count(*)::int FROM app_studio_triggers WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS triggers,
           (SELECT count(*)::int FROM organization_members WHERE org_id IN (${orgA}::uuid, ${orgB}::uuid)) AS members
  `);
  report.leftover = left;
  const seedAfter = await seedState();
  report.cells = cells;
  report.extra = extra;
  report.seedOrg = { before: seedBefore, after: seedAfter };
  console.log(`Z169_API_CELLS_JSON ${JSON.stringify(report)}`);
  await app?.close();
  expect(left, 'what this file made was not all removed').toEqual({
    orgs: 0,
    contacts: 0,
    events: 0,
    runs: 0,
    triggers: 0,
    members: 0,
  });
  // The seed org exactly as this file found it — a snapshot, not zeros.
  expect(seedAfter).toEqual(seedBefore);
  void startedAt;
}, 120_000);

const nothing = (c: Cell) => ({
  events: c.events,
  runs: c.runs,
  jobs: c.jobs,
  replay: c.replay,
  mta: c.mta,
  batch: c.batch,
  hooks: c.hooks,
});
const NOTHING = {
  events: 0,
  runs: {},
  jobs: { email: 0, sms: 0, wa: 0, push: 0 },
  replay: [],
  mta: [],
  batch: [],
  hooks: 0,
};

describe('app-studio ingest with a contact that is not the org’s own (Z169)', () => {
  it('X — org B’s contact on the app’s event: 404 Contact, no run, no job, no change', async () => {
    const c = await measure(contact.b, emails.b, ingest('x', contact.b));
    cells.X = c;
    console.log(`[z169] X: ${JSON.stringify(c)}`);
    expect(c.status, c.body).toBe(404);
    expect(JSON.parse(c.body)).toEqual(NOT_FOUND);
    expect(nothing(c), JSON.stringify(c)).toEqual(NOTHING);
    expect(c.contactChanged, 'org B’s contact was changed by org A’s flow').toBe(false);
  });

  it('X2 — org B’s contact on ticketing.order_paid (transactional nodes): the same', async () => {
    const c = await measure(contact.b, emails.b, ingest('tk', contact.b));
    cells.X2 = c;
    console.log(`[z169] X2: ${JSON.stringify(c)}`);
    expect(c.status, c.body).toBe(404);
    expect(JSON.parse(c.body)).toEqual(NOT_FOUND);
    expect(nothing(c), JSON.stringify(c)).toEqual(NOTHING);
    expect(c.contactChanged).toBe(false);
  });

  it('N — a uuid no contact has: the same answer as X, nothing stored', async () => {
    const c = await measure(missingId, null, ingest('x', missingId));
    cells.N = c;
    console.log(`[z169] N: ${JSON.stringify(c)}`);
    expect(c.status, c.body).toBe(404);
    expect(c.body, 'the answer must not tell an unknown id from another org’s contact').toBe(
      cells.X?.body ?? JSON.stringify(NOT_FOUND),
    );
    expect(nothing(c), JSON.stringify(c)).toEqual(NOTHING);
  });

  it('P — onApiEvent(org A, org B’s contact) called directly starts nothing, stores nothing', async () => {
    let started = -1;
    const c = await measure(contact.b, emails.b, async () => {
      started = await onApiEvent(orgA, contact.b, EV_X, { order: { number: TAG } });
      return { status: 0, body: String(started) };
    });
    cells.P = c;
    console.log(`[z169] P: ${JSON.stringify(c)}`);
    expect(started, 'runs started for another org’s contact').toBe(0);
    expect(nothing(c), JSON.stringify(c)).toEqual(NOTHING);
    expect(c.contactChanged).toBe(false);
  });
});

describe('controls — org A’s own contact, the same on master and the branch (Z169)', () => {
  it('K1 — own active contact on the app’s event: 202, every flow runs, the e-mail and SMS go on', async () => {
    const c = await measure(contact.own, emails.own, ingest('x', contact.own));
    cells.K1 = c;
    console.log(`[z169] K1: ${JSON.stringify(c)}`);
    expect(c.status, c.body).toBe(202);
    expect(JSON.parse(c.body)).toEqual({ data: { accepted: true } });
    expect(c.events).toBe(1);
    expect(Object.keys(c.runs).sort()).toEqual(
      ['field', 'hook', 'inline', 'list', 'push', 'sms', 'tag', 'tpl', 'wa'].sort(),
    );
    for (const k of ['field', 'hook', 'inline', 'list', 'sms', 'tag', 'tpl'])
      expect(c.runs[k], k).toBe('completed');
    expect(c.jobs.email).toBe(2);
    expect(c.jobs.sms).toBe(1);
    expect(c.replay.find((r) => r.startsWith('sms '))).toContain(SMS_REACHED);
    expect(c.mta).toEqual(['transactional/workflow_marketing']);
    expect(c.batch).toEqual(['fm']);
    expect(c.hooks).toBe(1);
    expect(c.contactChanged).toBe(true);
  });

  it('K2 — own unsubscribed contact, marketing nodes: runs, but no e-mail and no SMS go on', async () => {
    const c = await measure(contact.ownUnsub, emails.ownUnsub, ingest('x', contact.ownUnsub));
    cells.K2 = c;
    console.log(`[z169] K2: ${JSON.stringify(c)}`);
    expect(c.status, c.body).toBe(202);
    expect(c.runs.inline).toBe('completed');
    expect(c.replay).toContain(
      'email 200 {"data":{"skipped":true,"reason":"contact status unsubscribed"}}',
    );
    expect(c.mta).toEqual([]);
    expect(c.replay.find((r) => r.startsWith('sms '))).not.toContain(SMS_REACHED);
  });

  it('K3 — own unsubscribed contact on ticketing.order_paid, transactional nodes: they go on', async () => {
    const c = await measure(contact.ownUnsub, emails.ownUnsub, ingest('tk', contact.ownUnsub));
    cells.K3 = c;
    console.log(`[z169] K3: ${JSON.stringify(c)}`);
    expect(c.status, c.body).toBe(202);
    expect(Object.keys(c.runs).sort()).toEqual(['tInline', 'tSms', 'tTag', 'tTpl']);
    expect(c.mta).toEqual(['transactional/-']);
    expect(c.batch).toEqual(['ft']);
    expect(c.replay.find((r) => r.startsWith('sms '))).toContain(SMS_REACHED);
  });

  it('K4 — POST /api/v1/events with the own contact (secret key): runs as before', async () => {
    const c = await measure(
      contact.own,
      emails.own,
      () =>
        inject(
          'POST',
          '/api/v1/events',
          { 'x-api-key': apiKeyA },
          {
            contactId: contact.own,
            eventName: EV_X,
          },
        ),
      2_000,
    );
    cells.K4 = c;
    console.log(`[z169] K4: ${JSON.stringify(c)}`);
    expect(c.status, c.body).toBeLessThan(300);
    expect(c.runs.inline).toBe('completed');
    expect(c.mta).toEqual(['transactional/workflow_marketing']);
  });

  it('K5 — POST /api/v1/ticketing/events order_paid for the own contact: the ticketing flows run', async () => {
    const c = await measure(contact.own, emails.own, () =>
      inject('POST', '/api/v1/ticketing/events', ownerA, {
        type: 'order_paid',
        contact: { email: emails.own },
        event: { externalId: `${TAG}-ev`, title: 'Koncert' },
        order: { orderId: `${TAG}-o1`, amount: 500, currency: 'CZK', seats: 1 },
      }),
    );
    cells.K5 = c;
    console.log(`[z169] K5: ${JSON.stringify(c)}`);
    expect(c.status, c.body).toBe(202);
    expect(c.runs.tInline).toBe('completed');
    expect(c.mta).toEqual(['transactional/-']);
  });

  it('K6 — a service caller (createDeal) with the own contact: the deal_created flow runs', async () => {
    const c = await measure(contact.own, emails.own, async () => {
      const d = await createDeal(orgA, {
        pipelineId: pipelineA,
        name: `${TAG} deal`,
        contactId: contact.own,
      } as Parameters<typeof createDeal>[1]);
      return { status: 201, body: d.id };
    });
    cells.K6 = c;
    console.log(`[z169] K6: ${JSON.stringify(c)}`);
    expect(c.runs.deal).toBe('completed');
    expect(c.events).toBe(1);
  });

  it('PK — onApiEvent(org A, its own contact) directly: stored and started as before', async () => {
    let started = -1;
    const c = await measure(contact.own, emails.own, async () => {
      started = await onApiEvent(orgA, contact.own, EV_X, {});
      return { status: 0, body: String(started) };
    });
    cells.PK = c;
    console.log(`[z169] PK: ${JSON.stringify(c)}`);
    expect(started).toBe(9);
    expect(c.events).toBe(1);
    expect(c.runs.inline).toBe('completed');
  });
});

describe('probes recorded for the report, not changed by Z169', () => {
  it('S3 — what a viewer’s session may do in app-studio', async () => {
    const out: Record<string, string> = {};
    const made = await inject('POST', '/api/v1/app-studio/apps', viewerA, {
      slug: `${TAG}-viewer-app`,
      name: `${TAG} viewer app`,
    });
    out['POST /app-studio/apps'] = `${made.status}`;
    const rotate = await inject('POST', `/api/v1/app-studio/apps/${appId}/rotate-token`, viewerA);
    out['POST /app-studio/apps/:id/rotate-token'] = `${rotate.status}`;
    if (rotate.status === 200) {
      // The viewer's new token is the app's token now; carry on with it.
      appToken = (JSON.parse(rotate.body) as { data: { accessToken: string } }).data.accessToken;
    }
    const trig = await inject('POST', `/api/v1/app-studio/apps/${appId}/triggers`, viewerA, {
      key: 'viewer-tk',
      name: `${TAG} viewer`,
      eventName: TICKETING,
    });
    out['POST /app-studio/apps/:appId/triggers ticketing.order_paid'] = `${trig.status}`;
    extra.viewer = out;
    console.log(`[z169] S3 viewer: ${JSON.stringify(out)}`);
    expect(Object.keys(out)).toHaveLength(3);
  });

  it('C — queries of one ingest and one onApiEvent with no flow listening; the plan of the lookup', async () => {
    const count = async (run: () => Promise<unknown>) => {
      const seen: string[] = [];
      const stop = observeQueries((q) => seen.push(q.replace(/\s+/g, ' ').slice(0, 140)));
      try {
        await run();
      } finally {
        stop();
      }
      return seen;
    };
    const ing = await count(() => ingest('quiet', contact.own)());
    const ev = await count(() => onApiEvent(orgA, contact.own, EV_QUIET, {}));
    const plan = (await db.execute(
      sql.raw(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT "id" FROM "contacts" ` +
          `WHERE "id" = '${contact.b}' AND "org_id" = '${orgA}' LIMIT 1`,
      ),
    )) as unknown as { 'QUERY PLAN': string }[];
    extra.cost = {
      ingestQueries: ing.length,
      ingest: ing.map(scrub),
      onApiEventQueries: ev.length,
      onApiEvent: ev.map(scrub),
      plan: plan.map((r) => r['QUERY PLAN']),
    };
    console.log(`[z169] C: ${JSON.stringify(extra.cost)}`);
    expect(ing.length).toBeGreaterThan(0);
  });
});
