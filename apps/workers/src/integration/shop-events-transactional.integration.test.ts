/**
 * payment_pending, pickup_ready and order_shipped are on the transactional
 * trigger list (Z165).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * Michal, 15. 10. ~21:30, point 1d (variant a): a publishable key may not send
 * the three (403 EVENT_NAME_RESERVED — apps/api/src/integration/
 * public-key-shop-events), only the shop's server does; then the three joined
 * the closed trigger list (workflows/transactional-exception.ts). Their
 * informational template nodes — payment-pending-cs e1, pickup-invoice-cs e1
 * and e2 — have carried priority 'transactional' since Z163 (registry.ts,
 * migration 0038) without effect; now it counts.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Flows made the way a customer makes them: POST /api/v1/workflow-templates/
 * :slug/fork, or POST /api/v1/workflows by an editor. An event arrives the way
 * the shop's server sends it: POST /api/v1/events with a secret key → onApiEvent
 * → the executor → the email queue → the real workflow-email worker in this
 * process → the real API route → the real processBatchSender → the real
 * mta-sender. An order arrives by the generic e-shop webhook. The gRPC client
 * of the engine is the only stub; it keeps what it was handed. A wait of a flow
 * is shortened by moving its run's next_execution_at to now and calling POST
 * /api/v1/internal/workflow/process-runs (what the scheduler calls).
 *
 *   PP   payment-pending-cs (e1 informational), every state;
 *   PI   pickup-invoice-cs (e1, a one-day wait, e2 informational), every state;
 *   OS   a flow of an editor's own on order_shipped, with and without priority;
 *   TK   ticketing.order_paid, TOC transactional-order-confirmation e1,
 *        XS cross-sell-cs, BIS back-in-stock-cs: controls, the same on master;
 *   V    probe 4: a viewer's secret key (minted as an admin, then demoted).
 *
 * Each cell is logged as `[z165] …` and the whole table once as
 * `Z165_CELLS_JSON {…}` at the end, for the report.
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers and the engine; a shop's own server.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { startWorkflowEmailWorker } from '../jobs/workflow-email-sender.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import {
  batchSenderQueue,
  batchSenderQueues,
  connection,
  mtaQueues,
  type BatchSenderJobData,
  type MtaSendJobData,
} from '../queues/index.js';

interface Handed {
  toEmail: string;
  subject: string;
  customHeaders: Record<string, string>;
}

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({ handed: [] as Handed[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: Handed) => {
    engine.handed.push({ ...msg, customHeaders: { ...(msg.customHeaders ?? {}) } });
    return {
      success: true,
      messageId: 'm',
      smtpCode: 250,
      smtpMessage: 'OK',
      error: '',
      durationMs: '1',
      sendingIp: '',
    };
  },
}));

const API = process.env.API_URL!;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET! };
// The API's own development default (config/env.ts) unless CI sets one.
const FBL_SECRET = process.env.FBL_WEBHOOK_SECRET ?? 'dev-fbl-webhook-secret-change-me-32ch';
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `z165-${tag}.test`;
const WEBHOOK_SECRET = `z165-secret-${tag}`;
const ALL: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
  'failed',
];
const OPEN: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

type State =
  | 'active'
  | 'unsubscribed'
  | 'complained'
  | 'pending'
  | 'archived'
  | 'non_subscribed'
  | 'complaint_fbl'
  | 'hard_bounce_row'
  | 'invalid_row'
  | 'manual_row'
  | 'block_row'
  | 'gdpr'
  | 'bounced'
  | 'deleted'
  | 'deleted_late';

/** Refused as marketing, lifted by the exception: master RED, branch GREEN. */
const LIFTED: State[] = ['unsubscribed', 'complained', 'pending', 'archived', 'non_subscribed'];
/** Must not reach, exception or not (Z159's and Z163's list). */
const NEGATIVE: State[] = [
  'complaint_fbl',
  'hard_bounce_row',
  'invalid_row',
  'manual_row',
  'block_row',
  'gdpr',
  'bounced',
  'deleted',
  'deleted_late',
];
const ALL_STATES: State[] = ['active', ...LIFTED, ...NEGATIVE];

const ROW_REASON: Partial<Record<State, string>> = {
  unsubscribed: 'unsubscribe',
  hard_bounce_row: 'hard_bounce',
  invalid_row: 'invalid_email',
  manual_row: 'manual',
  block_row: 'block',
};
const STATUS: Partial<Record<State, string>> = {
  unsubscribed: 'unsubscribed',
  complained: 'complained',
  pending: 'pending',
  archived: 'archived',
  non_subscribed: 'non_subscribed',
  bounced: 'bounced',
};

let seed: SeedOrg;
let token: string;
let startedAt: Date;
let connectionId: string;
let countersBefore: { period_start: Date; sends: number }[] = [];
let fblKeyBefore: string | null = null;
let orgBefore: Record<string, unknown> = {};
let templatesBefore = new Set<string>();
let othersDeactivated: string[] = [];
const workers: Worker[] = [];
const emailQ = new Queue('email', { connection });
const contactIds: string[] = [];
const erasureHashes: string[] = [];
const workflowIds: string[] = [];
const apiKeyNames: string[] = [];
const createdUsers: string[] = [];
const flows = {} as Record<'pp' | 'pi' | 'toc' | 'xs' | 'bis' | 'tk', string>;
/** Everything measured, printed once as Z165_CELLS_JSON. */
const report: Record<string, unknown> = {
  tag,
  mock: 'only the engine gRPC client (lib/mta-grpc-client.js); everything else is real',
};

async function call(method: string, path: string, body?: unknown, credential = token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(credential),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, text: await res.text() };
}

/** An API key of the seed org with `role`, for this file. */
async function keyWithRole(role: string): Promise<string> {
  const label = `z165-${role}-${tag}`;
  const raw = await seedApiKey(sql, label);
  apiKeyNames.push(`integration ${label}`);
  const hash = createHash('sha256').update(raw).digest('hex');
  await sql`UPDATE api_keys SET role = ${role} WHERE key_hash = ${hash}`;
  return raw;
}

/**
 * A key held by a member of the seed org with `role`: minted by the member as
 * an admin through the API, then the member made `role` before the key is
 * first used (the key's role is read on lookup and cached for 60 s) — as Z164.
 */
async function memberKey(role: 'viewer' | 'editor'): Promise<string> {
  const [owner] = await sql<{ password_hash: string }[]>`
    SELECT password_hash FROM users WHERE email = ${SEED_LOGIN.email} LIMIT 1
  `;
  const email = `z165-${role}-${tag}@test.local`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (org_id, email, name, password_hash, role, email_verified)
    VALUES (${seed.id}, ${email}, ${`z165 ${role}`}, ${owner!.password_hash}, 'admin', true)
    RETURNING id
  `;
  createdUsers.push(u!.id);
  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SEED_LOGIN.password }),
    signal: AbortSignal.timeout(30_000),
  });
  const session = (await login.json()) as { token?: string };
  expect(login.status, JSON.stringify(session)).toBe(200);
  const name = `z165 ${role} key ${tag}`;
  const minted = await call('POST', '/api/v1/api-keys', { name }, session.token!);
  expect(minted.status, minted.text).toBe(201);
  apiKeyNames.push(name);
  await call('POST', '/api/v1/auth/logout', {}, session.token!);
  await sql`UPDATE users SET role = ${role} WHERE id = ${u!.id}`;
  return (JSON.parse(minted.text) as { data: { rawKey: string } }).data.rawKey;
}

interface Person {
  state: State;
  /** null once the contact is gone (none here is re-made by the event). */
  id: string | null;
  email: string;
  /** How the state was made, for the report. */
  made: string;
}
let serial = 0;
let orderSerial = 0;

/** An ISP's ARF complaint about `email`, posted where the mailbox forwarder posts it. */
async function fblComplaint(email: string) {
  const arf = [
    'From: fbl@isp.example',
    'Content-Type: multipart/report; report-type=feedback-report',
    '',
    'Feedback-Type: abuse',
    'User-Agent: z165/1.0',
    'Version: 1',
    `Original-Rcpt-To: <${email}>`,
    `Original-Message-ID: <z165-${randomUUID()}@${sendingDomain}>`,
    'Reporting-MTA: dns; isp.example',
  ].join('\r\n');
  const res = await fetch(`${API}/api/v1/isp/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'x-fbl-secret': FBL_SECRET, 'x-org-id': seed.id },
    body: arf,
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, text: await res.text() };
}

/** A contact of the seed org in `state`, made the way production makes it. */
async function person(state: State, prefix = 'z165'): Promise<Person> {
  const email = `${prefix}-${state.replace(/_/g, '')}-${++serial}-${tag}@test.local`;
  const status = STATUS[state] ?? 'active';
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  let id: string | null = c!.id;
  let made = `INSERT status ${status}`;
  const reason = ROW_REASON[state];
  if (reason) {
    const r = await call('POST', '/api/v1/suppressions', { email, reason });
    expect(r.status, r.text).toBe(201);
    made += ` + POST /suppressions ${reason} ${r.status}`;
  }
  if (state === 'complaint_fbl') {
    const r = await fblComplaint(email);
    expect(r.status, r.text).toBe(200);
    const rows = await sql<{ reason: string }[]>`
      SELECT reason FROM suppressions WHERE org_id = ${seed.id} AND lower(email) = ${email}
    `;
    made += ` + POST /isp/feedback ${r.status} → rows ${JSON.stringify(rows.map((x) => x.reason))}`;
  }
  if (state === 'gdpr') {
    // As Z159 for an api_event: erased, then the same address made again by
    // the API (the event needs a contact id; an order would make it itself).
    const erased = await call('POST', `/api/v1/contacts/${id}/anonymize`, {});
    expect(erased.status, erased.text).toBe(200);
    erasureHashes.push((JSON.parse(erased.text) as { data: { emailHash: string } }).data.emailHash);
    const again = await call('POST', '/api/v1/contacts', { email, firstName: 'Petra' });
    expect(again.status, again.text).toBeLessThan(300);
    id = (JSON.parse(again.text) as { data: { id: string } }).data.id;
    contactIds.push(id);
    const [recreated] = await sql<{ status: string }[]>`
      SELECT status FROM contacts WHERE id = ${id}
    `;
    made += ` + POST /anonymize ${erased.status} + POST /contacts ${again.status} → status ${recreated!.status}`;
  }
  if (state === 'deleted') {
    const del = await call('DELETE', `/api/v1/contacts/${id}`);
    expect(del.status, del.text).toBe(204);
    made += ` + DELETE /contacts ${del.status} before the event`;
  }
  return { state, id, email, made };
}

/** The shop's order webhook for `email` (generic receiver, Magento shape), unpaid. */
async function order(email: string) {
  const orderId = `z165-${tag}-${++orderSerial}`;
  const res = await fetch(`${API}/api/v1/ecommerce/webhooks/generic/${connectionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
    body: JSON.stringify({
      increment_id: orderId,
      entity_id: orderSerial,
      customer_email: email,
      status: 'pending',
      grand_total: '578.00',
      order_currency_code: 'CZK',
      created_at: new Date().toISOString(),
      items: [{ sku: 'S1', name: 'Zboží', qty_ordered: 1, price: 499, product_id: 'p1' }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, text: await res.text() };
}

/** The live contact with this address now. */
async function liveContact(email: string): Promise<{ id: string; status: string } | null> {
  const [c] = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM contacts
    WHERE org_id = ${seed.id} AND email = ${email.toLowerCase()} AND deleted_at IS NULL
  `;
  return c ?? null;
}

interface WfNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

/** Fork a template the way the gallery does; the flow is a draft. */
async function fork(slug: string, label: string): Promise<{ id: string; nodes: WfNode[] }> {
  const r = await call('POST', `/api/v1/workflow-templates/${slug}/fork`, {
    name: `z165 ${label} ${tag}`,
  });
  expect(r.status, r.text).toBe(201);
  const wf = (JSON.parse(r.text) as { data: { id: string; nodes: WfNode[] } }).data;
  workflowIds.push(wf.id);
  return wf;
}

/** Only this flow of the file answers an order or an event while the test runs. */
async function onlyActive(id: string) {
  await sql`UPDATE workflows SET status = 'inactive' WHERE id = ANY(${workflowIds})`;
  await sql`UPDATE workflows SET status = 'active' WHERE id = ${id}`;
}

async function runIdsOf(workflowId: string, contactId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM workflow_runs WHERE workflow_id = ${workflowId} AND contact_id = ${contactId}
  `;
  return rows.map((r) => r.id);
}

/** This flow's email jobs for the contact and node once settled: "state returnvalue". */
async function settledNode(contactId: string, workflowId: string, nodeId: string) {
  const appear = Date.now() + 20_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const runs = await runIdsOf(workflowId, contactId);
    const jobs = (await emailQ.getJobs(ALL, 0, 10_000)).filter(
      (j) =>
        j?.data?.contactId === contactId &&
        j.data.nodeId === nodeId &&
        runs.includes(j.data.workflowRunId),
    );
    if (!jobs.length && Date.now() > appear) return 'no job';
    const states = await Promise.all(jobs.map((j) => j.getState()));
    if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
      const out: string[] = [];
      for (const stale of jobs) {
        const j = (await emailQ.getJob(stale.id!)) ?? stale;
        out.push(`${await j.getState()} ${JSON.stringify(j.returnvalue)}`);
      }
      return out.join(' | ');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'did not settle';
}

/** Run the template branch's batch-sender job(s) for this contact: "sent=… skipped=…/flag". */
async function runBatch(contactId: string): Promise<string> {
  const jobs = (await batchSenderQueues.triggered.getJobs(
    ALL,
    0,
    5_000,
  )) as Job<BatchSenderJobData>[];
  const mine = jobs.filter((j) => j?.data?.contactIds?.includes(contactId));
  if (!mine.length) return 'no batch job';
  const out: string[] = [];
  for (const j of mine) {
    const r = (await processBatchSender({
      data: j.data,
      log: async () => {},
    } as unknown as Job<BatchSenderJobData>)) as { sent: number; skipped: number };
    out.push(`sent=${r.sent} skipped=${r.skipped}/${j.data.flowTransactional ? 'ft' : '-'}`);
    await j.remove().catch(() => {});
  }
  return out.join(',');
}

/** Run every queued MTA job for `to` through the real processor: "status/stream/purpose". */
async function deliver(to: string): Promise<string> {
  const jobs = ((await mtaQueues.other.getJobs(OPEN, 0, 5_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase(),
  );
  const out: string[] = [];
  for (const j of jobs) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      out.push(`${r.status}/${j.data.stream}/${j.data.purpose ?? '-'}`);
    } catch (err) {
      out.push(`threw ${(err as Error).message}/${j.data.stream}/${j.data.purpose ?? '-'}`);
    }
    await j.remove().catch(() => {});
  }
  return out.join(',') || 'no mta job';
}

const handedTo = (email: string) =>
  engine.handed.filter((m) => m.toEmail.toLowerCase() === email.toLowerCase());

interface Cell {
  made: string;
  trigger: string;
  job: string;
  batch: string;
  mta: string;
  subject: string | null;
  reached: boolean;
  run?: string;
}

/** One step of a walk: an optional wait shortened first, then the send node. */
interface Step {
  wait?: string;
  node: string;
}

type Walk = Record<string, Record<string, Cell>>;

/** Wait until the runs of these contacts have moved on, shorten `waitNode`, resume. */
async function advance(workflowId: string, ids: string[], waitNode: string) {
  type RunRow = { status: string; current_node_id: string | null };
  let rows: RunRow[] = [];
  for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
    rows = await sql<RunRow[]>`
      SELECT status, current_node_id FROM workflow_runs
      WHERE workflow_id = ${workflowId} AND contact_id = ANY(${ids})
    `;
    const parked = rows.filter((r) => ['waiting', 'completed', 'failed'].includes(r.status));
    if (rows.length >= ids.length && parked.length === rows.length) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const due = await sql`
    UPDATE workflow_runs SET next_execution_at = now()
    WHERE workflow_id = ${workflowId} AND contact_id = ANY(${ids})
      AND status = 'waiting' AND current_node_id = ${waitNode}
  `;
  const res = await fetch(`${API}/api/v1/internal/workflow/process-runs`, {
    method: 'POST',
    headers: INTERNAL,
    signal: AbortSignal.timeout(60_000),
  });
  return {
    before: rows.map((r) => `${r.status}@${r.current_node_id}`).sort(),
    shortened: due.count,
    processRuns: `${res.status} ${await res.text()}`,
  };
}

/**
 * Start `workflowId` for every person with `fire`, then walk its steps: each
 * send node's email job, the batch-sender job, the MTA job, the engine.
 */
async function walk(
  label: string,
  workflowId: string,
  people: Person[],
  steps: Step[],
  fire: (p: Person) => Promise<{ status: number; text: string }>,
): Promise<{ cells: Walk; advanced: Record<string, unknown> }> {
  const out: Walk = {};
  const advanced: Record<string, unknown> = {};
  const trigger: Record<string, string> = {};
  await Promise.all(
    people.map(async (p) => {
      const r = await fire(p);
      trigger[p.state] = `${r.status}${r.status >= 300 ? ` ${r.text.slice(0, 160)}` : ''}`;
      const live = await liveContact(p.email);
      if (live && p.id !== live.id) {
        contactIds.push(live.id);
      }
    }),
  );
  for (const step of steps) {
    if (step.wait) {
      const ids = people.map((p) => p.id).filter((x): x is string => !!x);
      advanced[step.wait] = await advance(workflowId, ids, step.wait);
    }
    const cells: Record<string, Cell> = {};
    await Promise.all(
      people.map(async (p) => {
        let made = p.made;
        const job = await settledNode(p.id!, workflowId, step.node);
        if (p.state === 'deleted_late' && step === steps[0]) {
          // Deleted after the flow queued the mail and before batch-sender ran it.
          const del = await call('DELETE', `/api/v1/contacts/${p.id}`);
          expect(del.status, del.text).toBe(204);
          made += ` + DELETE /contacts ${del.status} after the job settled`;
        }
        const before = handedTo(p.email).length;
        const batch = await runBatch(p.id!);
        const mta = await deliver(p.email);
        const got = handedTo(p.email).slice(before);
        cells[p.state] = {
          made,
          trigger: trigger[p.state]!,
          job,
          batch,
          mta,
          subject: got[0]?.subject ?? null,
          reached: got.length > 0,
        };
        console.log(
          `[z165] ${label} ${step.node} ${p.state}: trigger=${trigger[p.state]} job=${job} batch=${batch} mta=${mta} engine=${got.length ? 'ANO' : 'NE'} | ${made}`,
        );
      }),
    );
    out[step.node] = cells;
  }
  for (const p of people) {
    const runs = await sql<{ status: string }[]>`
      SELECT status FROM workflow_runs WHERE workflow_id = ${workflowId} AND contact_id = ${p.id}
    `;
    const text = runs.map((r) => r.status).join(',') || 'no run';
    for (const node of Object.keys(out)) {
      if (out[node]![p.state]) out[node]![p.state]!.run = text;
    }
  }
  return { cells: out, advanced };
}

const byOrder = (p: Person) => order(p.email);
const byEvent =
  (eventName: string, properties: Record<string, unknown>, credential?: string) => (p: Person) =>
    call('POST', '/api/v1/events', { contactId: p.id, eventName, properties }, credential);

/** The seed org as a whole: what this file must leave as it found it. */
async function orgState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT o.plan,
           o.settings->'suspended' AS suspended,
           (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM plan_send_counters WHERE org_id = o.id) AS counter_rows,
           (SELECT COALESCE(sum(sends), 0)::int FROM plan_send_counters WHERE org_id = o.id) AS counter_sends,
           (SELECT count(*)::int FROM abuse_events WHERE org_id = o.id) AS abuse_events,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id) AS workflows,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id AND status = 'active') AS active_workflows,
           (SELECT count(*)::int FROM workflow_events WHERE org_id = o.id) AS workflow_events,
           (SELECT count(*)::int FROM templates WHERE org_id = o.id) AS templates,
           (SELECT count(*)::int FROM revenue_events WHERE org_id = o.id) AS revenue_events,
           (SELECT count(*)::int FROM ecommerce_connections WHERE org_id = o.id) AS ecommerce_connections,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

let pp: Walk;
let pi: Walk;

describe('payment_pending, pickup_ready and order_shipped are transactional (Z165)', () => {
  beforeAll(async () => {
    startedAt = new Date();
    seed = await readSeedOrg(sql);
    orgBefore = await orgState();
    token = await keyWithRole('owner');
    countersBefore = await sql`
      SELECT period_start, sends FROM plan_send_counters WHERE org_id = ${seed.id}
    `;
    fblKeyBefore = await (await emailQ.client).get(`fbl:complaints24h:${seed.id}`);
    const tpl = await sql<{ id: string }[]>`SELECT id FROM templates WHERE org_id = ${seed.id}`;
    templatesBefore = new Set(tpl.map((t) => t.id));
    // Anything of the seed org that an order or one of this file's events
    // would start besides this file's own flows is set inactive for the file
    // and put back after it.
    const names = [
      'order_placed',
      'payment_pending',
      'pickup_ready',
      'order_shipped',
      'ticketing.order_paid',
      'back_in_stock',
    ];
    const others = await sql<{ id: string }[]>`
      SELECT id FROM workflows
      WHERE org_id = ${seed.id} AND status = 'active' AND deleted_at IS NULL
        AND (trigger_type = 'purchase_event'
             OR (trigger_type = 'api_event'
                 AND (trigger_config->>'eventName' IS NULL
                      OR trigger_config->>'eventName' = ANY(${names}))))
    `;
    othersDeactivated = others.map((o) => o.id);
    if (othersDeactivated.length) {
      await sql`UPDATE workflows SET status = 'inactive' WHERE id = ANY(${othersDeactivated})`;
    }
    report.otherListeningFlows = othersDeactivated.length;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    const conn = await call('POST', '/api/v1/ecommerce/connections', {
      platform: 'magento',
      name: `z165 magento ${tag}`,
      baseUrl: 'https://z165.example.com',
      accessToken: 'z165-token',
      webhookSecret: WEBHOOK_SECRET,
    });
    expect(conn.status, conn.text).toBeLessThan(300);
    connectionId = (JSON.parse(conn.text) as { data: { id: string } }).data.id;

    const made = {
      pp: await fork('payment-pending-cs', 'pp'),
      pi: await fork('pickup-invoice-cs', 'pi'),
      toc: await fork('transactional-order-confirmation', 'toc'),
      xs: await fork('cross-sell-cs', 'xs'),
      bis: await fork('back-in-stock-cs', 'bis'),
    };
    for (const [k, w] of Object.entries(made)) flows[k as keyof typeof flows] = w.id;
    report.forks = Object.fromEntries(
      Object.entries(made).map(([k, w]) => [
        k,
        w.nodes
          .filter((n) => n.type === 'send_email')
          .map((n) => `${n.id}:${String(n.config.priority ?? '-')}`),
      ]),
    );

    // TK: a flow of this file on ticketing.order_paid, the template e-mail of
    // the PP fork's e1, priority transactional (as Z159's T2 and Z163's TK).
    const e1 = made.pp.nodes.find((n) => n.id === 'e1')!;
    const tkNodes = [
      { id: 'trigger', type: 'trigger', config: {} },
      {
        id: 'send',
        type: 'send_email',
        config: {
          templateId: e1.config.templateId,
          subject: 'Vstupenky',
          priority: 'transactional',
        },
      },
    ];
    const tkName = `z165 tk ${tag}`;
    const [tk] = await sql<{ id: string }[]>`
      INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
      VALUES (${seed.id}, ${tkName}, 'inactive', 'api_event',
              ${JSON.stringify({ eventName: 'ticketing.order_paid' })}::jsonb,
              ${JSON.stringify(tkNodes)}::jsonb,
              ${JSON.stringify([{ id: 'e1', source: 'trigger', target: 'send' }])}::jsonb)
      RETURNING id
    `;
    workflowIds.push(tk!.id);
    flows.tk = tk!.id;

    workers.push(startWorkflowEmailWorker());
    console.log(`[z165] seed org before: ${JSON.stringify(orgBefore)}`);
  }, 180_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    const mine = `%-${tag}@test.local`;
    const orders = `z165-${tag}-%`;
    const people = await sql<{ id: string }[]>`
      SELECT id FROM contacts
      WHERE org_id = ${seed.id} AND (id = ANY(${contactIds}) OR email LIKE ${mine})
    `;
    const ids = [...new Set([...contactIds, ...people.map((p) => p.id)])];
    for (const j of await emailQ.getJobs(ALL, 0, 10_000)) {
      if (j && ids.includes(j.data?.contactId)) await j.remove().catch(() => {});
    }
    await emailQ.close();
    for (const q of [batchSenderQueues.triggered, batchSenderQueue]) {
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        const d = j?.data as BatchSenderJobData | undefined;
        if (d?.contactIds?.some((id) => ids.includes(id))) await j.remove().catch(() => {});
      }
    }
    for (const j of await mtaQueues.other.getJobs(ALL, 0, 10_000)) {
      if (j?.data?.toEmail?.toLowerCase().endsWith(`-${tag}@test.local`))
        await j.remove().catch(() => {});
    }
    if (workflowIds.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${workflowIds})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${workflowIds})`;
    }
    if (othersDeactivated.length) {
      await sql`UPDATE workflows SET status = 'active' WHERE id = ANY(${othersDeactivated})`;
    }
    await sql`DELETE FROM email_events WHERE org_id = ${seed.id} AND lower(recipient) LIKE ${mine}`;
    await sql`DELETE FROM revenue_events WHERE org_id = ${seed.id} AND order_id LIKE ${orders}`;
    if (ids.length) {
      await sql`DELETE FROM workflow_runs WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM revenue_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_engagement WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (connectionId) await sql`DELETE FROM ecommerce_connections WHERE id = ${connectionId}`;
    const tpl = await sql<{ id: string }[]>`SELECT id FROM templates WHERE org_id = ${seed.id}`;
    const madeHere = tpl.map((t) => t.id).filter((id) => !templatesBefore.has(id));
    if (madeHere.length) await sql`DELETE FROM templates WHERE id = ANY(${madeHere})`;
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND lower(email) LIKE ${mine}`;
    if (erasureHashes.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email_hash = ANY(${erasureHashes})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${seed.id} AND created_at >= ${startedAt}`;
    await sql`DELETE FROM api_keys WHERE name = ANY(${apiKeyNames})`;
    if (createdUsers.length) {
      await sql`DELETE FROM api_keys WHERE user_id = ANY(${createdUsers})`;
      await sql`DELETE FROM users WHERE id = ANY(${createdUsers})`;
    }
    // The seed org's plan counters as this file found them.
    await sql`DELETE FROM plan_send_counters WHERE org_id = ${seed.id}`;
    for (const c of countersBefore) {
      await sql`
        INSERT INTO plan_send_counters (org_id, period_start, sends)
        VALUES (${seed.id}, ${c.period_start}, ${c.sends})
      `;
    }
    // The FBL route counts complaints per org in Redis; put it back.
    const redis = await batchSenderQueues.triggered.client;
    if (fblKeyBefore === null) await redis.del(`fbl:complaints24h:${seed.id}`);
    else await redis.set(`fbl:complaints24h:${seed.id}`, fblKeyBefore, 'EX', 86_400);
    const orgAfter = await orgState();
    report.seedOrg = { before: orgBefore, after: orgAfter };
    console.log(`Z165_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    // The seed org exactly as this file found it: plan, events, every
    // suppression (the fingerprint rows included), counters, contacts, flows,
    // templates, revenue, connections, users, keys.
    expect(orgAfter).toEqual(orgBefore);
  }, 300_000);

  // ── PP: payment-pending-cs, e1 informational ──────────────────────────────

  it('PP — walk every state by a secret key; active gets it, no negative does', async () => {
    await onlyActive(flows.pp);
    const people = await Promise.all(ALL_STATES.map((s) => person(s, 'z165pp')));
    const w = await walk(
      'PP',
      flows.pp,
      people,
      [{ node: 'e1' }],
      byEvent('payment_pending', { order: { number: '2026-165' } }),
    );
    pp = w.cells;
    report.PP = w.cells;
    const e1 = pp.e1!;
    expect(e1.active!.reached, JSON.stringify(e1.active)).toBe(true);
    for (const st of NEGATIVE) {
      expect(e1[st]!.reached, `${st}: ${JSON.stringify(e1[st])}`).toBe(false);
    }
  }, 600_000);

  it.each(LIFTED)('PP e1 — the call to pay reaches %s', (st) => {
    const c = pp.e1![st]!;
    expect(c.reached, `${st}: ${JSON.stringify(c)}`).toBe(true);
    expect(c.batch, st).toBe('sent=1 skipped=0/ft');
    expect(c.mta, st).toBe('sent/triggered/flow_transactional');
  });

  // ── PI: pickup-invoice-cs, e1 and (after a one-day wait) e2 informational ─

  it('PI — walk every state through both e-mails; active gets them, no negative does', async () => {
    await onlyActive(flows.pi);
    const people = await Promise.all(ALL_STATES.map((s) => person(s, 'z165pi')));
    const w = await walk(
      'PI',
      flows.pi,
      people,
      [{ node: 'e1' }, { wait: 'w1', node: 'e2' }],
      byEvent('pickup_ready', {
        pickup: { point_name: 'Z-BOX Hranice' },
        order: { number: '2026-165' },
        invoice: { number: 'F165' },
      }),
    );
    pi = w.cells;
    report.PI = { cells: w.cells, advanced: w.advanced };
    for (const node of ['e1', 'e2']) {
      const cells = pi[node]!;
      expect(cells.active!.reached, `${node} active: ${JSON.stringify(cells.active)}`).toBe(true);
      for (const st of NEGATIVE) {
        expect(cells[st]!.reached, `${node} ${st}: ${JSON.stringify(cells[st])}`).toBe(false);
      }
    }
  }, 900_000);

  it.each(LIFTED.flatMap((st) => ['e1', 'e2'].map((node) => [node, st] as const)))(
    'PI %s — the informational e-mail reaches %s',
    (node, st) => {
      const c = pi[node]![st]!;
      expect(c.reached, `${node} ${st}: ${JSON.stringify(c)}`).toBe(true);
      expect(c.batch, `${node} ${st}`).toBe('sent=1 skipped=0/ft');
      expect(c.mta, `${node} ${st}`).toBe('sent/triggered/flow_transactional');
    },
  );

  // ── OS: an editor's own flow on order_shipped ─────────────────────────────

  const osCells: Record<string, Cell> = {};

  it('OS — an editor makes two flows on order_shipped, with and without the priority', async () => {
    const editor = await memberKey('editor');
    const e1 = (
      await sql<{ nodes: WfNode[] }[]>`SELECT nodes FROM workflows WHERE id = ${flows.pp}`
    )[0]!.nodes.find((n) => n.id === 'e1')!;
    const made: Record<string, unknown> = {};
    for (const variant of ['transactional', 'none'] as const) {
      const config: Record<string, unknown> = {
        templateId: e1.config.templateId,
        subject: 'Objednávka odeslána',
        ...(variant === 'transactional' ? { priority: 'transactional' } : {}),
      };
      const res = await call(
        'POST',
        '/api/v1/workflows',
        {
          name: `z165 os ${variant} ${tag}`,
          triggerType: 'api_event',
          triggerConfig: { eventName: 'order_shipped' },
          nodes: [
            {
              id: 't',
              type: 'trigger',
              config: { triggerType: 'api_event', eventName: 'order_shipped' },
            },
            { id: 'e1', type: 'send_email', config },
          ],
          edges: [{ id: 'e0', source: 't', target: 'e1' }],
        },
        editor,
      );
      expect(res.status, res.text).toBe(200);
      const id = (JSON.parse(res.text) as { data: { id: string } }).data.id;
      workflowIds.push(id);
      const act = await call('POST', `/api/v1/workflows/${id}/activate`, {}, editor);
      expect(act.status, act.text).toBe(200);
      made[variant] = { id, create: res.status, activate: act.status };
      await onlyActive(id);
      const p = await person('unsubscribed', `z165os${variant}`);
      const w = await walk(
        `OS ${variant}`,
        id,
        [p],
        [{ node: 'e1' }],
        byEvent('order_shipped', { order: { number: '2026-165' } }),
      );
      osCells[variant] = w.cells.e1!.unsubscribed!;
    }
    report.OS = { made, cells: osCells };
    expect(osCells.none!.reached, JSON.stringify(osCells.none)).toBe(false);
  }, 600_000);

  it('OS — the transactional node on order_shipped reaches unsubscribed', () => {
    const c = osCells.transactional!;
    expect(c.reached, JSON.stringify(c)).toBe(true);
    expect(c.mta).toBe('sent/triggered/flow_transactional');
  });

  // ── Controls: the same on master and the branch ───────────────────────────

  it('TK — ticketing.order_paid (secret key) reaches unsubscribed', async () => {
    await onlyActive(flows.tk);
    const p = await person('unsubscribed', 'z165tk');
    const w = await walk(
      'TK',
      flows.tk,
      [p],
      [{ node: 'send' }],
      byEvent('ticketing.order_paid', { eventTitle: 'Hamlet' }),
    );
    report.TK = w.cells;
    const c = w.cells.send!.unsubscribed!;
    expect(c.reached, JSON.stringify(c)).toBe(true);
    expect(c.mta).toBe('sent/triggered/flow_transactional');
  }, 300_000);

  it('TOC — the order confirmation e1 (webhook) reaches unsubscribed', async () => {
    await onlyActive(flows.toc);
    const p = await person('unsubscribed', 'z165toc');
    const w = await walk('TOC', flows.toc, [p], [{ node: 'e1' }], byOrder);
    report.TOC = w.cells;
    const c = w.cells.e1!.unsubscribed!;
    expect(c.reached, JSON.stringify(c)).toBe(true);
    expect(c.mta).toBe('sent/triggered/flow_transactional');
  }, 300_000);

  it('XS — cross-sell-cs (marketing on purchase_event) does not reach unsubscribed', async () => {
    await onlyActive(flows.xs);
    const p = await person('unsubscribed', 'z165xs');
    const w = await walk('XS', flows.xs, [p], [{ wait: 'w1', node: 'e1' }], byOrder);
    report.XS = { cells: w.cells, advanced: w.advanced };
    const c = w.cells.e1!.unsubscribed!;
    expect(c.reached, JSON.stringify(c)).toBe(false);
  }, 300_000);

  it('BIS — back-in-stock-cs (api_event back_in_stock) does not reach unsubscribed', async () => {
    await onlyActive(flows.bis);
    const p = await person('unsubscribed', 'z165bis');
    const w = await walk(
      'BIS',
      flows.bis,
      [p],
      [{ node: 'e1' }],
      byEvent('back_in_stock', { product: { title: 'Hrnek' } }),
    );
    report.BIS = w.cells;
    const c = w.cells.e1!.unsubscribed!;
    expect(c.reached, JSON.stringify(c)).toBe(false);
  }, 300_000);

  // ── Probe 4: a viewer's secret key — measured, not asserted ───────────────

  it('probe 4 — a viewer secret key sends ticketing.order_paid and payment_pending', async () => {
    const viewer = await memberKey('viewer');
    const out: Record<string, unknown> = {};
    await onlyActive(flows.tk);
    const tkP = await person('unsubscribed', 'z165v4tk');
    const tk = await walk(
      'V4 TK',
      flows.tk,
      [tkP],
      [{ node: 'send' }],
      byEvent('ticketing.order_paid', { eventTitle: 'Hamlet' }, viewer),
    );
    out.ticketingOrderPaid = tk.cells.send!.unsubscribed;
    await onlyActive(flows.pp);
    const ppP = await person('unsubscribed', 'z165v4pp');
    const ppw = await walk(
      'V4 PP',
      flows.pp,
      [ppP],
      [{ node: 'e1' }],
      byEvent('payment_pending', { order: { number: '2026-165' } }, viewer),
    );
    out.paymentPending = ppw.cells.e1!.unsubscribed;
    report.probe4 = out;
    console.log(`[z165] probe 4 ${JSON.stringify(out)}`);
  }, 600_000);
});
