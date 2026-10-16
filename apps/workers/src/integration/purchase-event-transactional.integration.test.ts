/**
 * The informational e-mails of an order in a flow are transactional (Z163).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * Michal, 15. 10. 19:40, point 1c a)+b)+c): the shop's informational e-mails
 * in a flow — the order confirmation (an unpaid order's too), shipped,
 * delivered, the call to pay, the pickup code, the invoice — are
 * transactional; the marketing nodes on purchase_event stay marketing; the
 * flows already forked from the templates are migrated (only the priority of
 * their informational nodes). So purchase_event joined the closed trigger
 * list (workflows/transactional-exception.ts), seven template nodes carry
 * priority 'transactional' (workflow-templates/registry.ts), and migration
 * 0038 re-marks the forks made before.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Flows made the way a customer makes them: POST /api/v1/workflow-templates/
 * :slug/fork. An order arrives the way a shop sends it: the generic e-shop
 * webhook (x-webhook-secret) → ingestOrder → onOrderPlaced → the executor →
 * the email queue → the real workflow-email worker in this process → the real
 * API route → the real processBatchSender → the real mta-sender. The gRPC
 * client of the engine is the only stub; it keeps what it was handed. A wait
 * of a flow is shortened by moving its run's next_execution_at to now and
 * calling POST /api/v1/internal/workflow/process-runs (what the scheduler
 * calls) — no node of a flow is edited for it.
 *
 *   TOC  transactional-order-confirmation (e1 informational);
 *   PPC  post-purchase-cs (e1–e3 informational, e4 the review request);
 *   XS   cross-sell-cs (marketing, a 7-day wait first);
 *   PP   payment-pending-cs through POST /api/v1/events with a secret key
 *        (api_event payment_pending — on the list since Z165, Michal point 1d);
 *   TK   a flow of its own on ticketing.order_paid (on the list since Z156);
 *   HID  post-purchase-shipping-update, which is hidden — the fork answers
 *        404, so the flow is written to the table in the shape a fork had.
 *
 * Each cell is logged as `[pet] …` and the whole table once as
 * `PET_CELLS_JSON {…}` at the end, for the report.
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers and the engine; a shop's own webhook delivery.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
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
  messageId: string;
  toEmail: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  customHeaders: Record<string, string>;
  contactId: string;
  campaignId: string;
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

const MIGRATION = new URL(
  '../../../api/drizzle/0038_flow_order_info_transactional.sql',
  import.meta.url,
);
const API = process.env.API_URL!;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET! };
// The API's own development default (config/env.ts) unless CI sets one.
const FBL_SECRET = process.env.FBL_WEBHOOK_SECRET ?? 'dev-fbl-webhook-secret-change-me-32ch';
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `pet-${tag}.test`;
const WEBHOOK_SECRET = `pet-secret-${tag}`;
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
  | 'new_buyer'
  | 'unsubscribed'
  | 'complained'
  | 'pending'
  | 'archived'
  | 'complaint_fbl'
  | 'hard_bounce_row'
  | 'invalid_row'
  | 'manual_row'
  | 'block_row'
  | 'gdpr'
  | 'bounced'
  | 'deleted_late'
  | 'deleted_before';

/** Refused as marketing, lifted by the exception: master RED, branch GREEN. */
const LIFTED: State[] = ['unsubscribed', 'complained', 'pending', 'archived'];
/** Reach on master and branch alike (a new buyer is created non_subscribed). */
const BOTH: State[] = ['active', 'new_buyer'];
/** Must not reach, exception or not (Z159's list, by webhook). */
const NEGATIVE: State[] = [
  'complaint_fbl',
  'hard_bounce_row',
  'invalid_row',
  'manual_row',
  'block_row',
  'gdpr',
  'bounced',
  'deleted_late',
];
const ALL_STATES: State[] = [...BOTH, ...LIFTED, ...NEGATIVE, 'deleted_before'];

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
const flows = {} as Record<'toc' | 'ppc' | 'xs' | 'pp' | 'tk' | 'hid', string>;
/** Everything measured, printed once as PET_CELLS_JSON. */
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
  const label = `pet-${role}-${tag}`;
  const raw = await seedApiKey(sql, label);
  apiKeyNames.push(`integration ${label}`);
  const hash = createHash('sha256').update(raw).digest('hex');
  await sql`UPDATE api_keys SET role = ${role} WHERE key_hash = ${hash}`;
  return raw;
}

interface Person {
  state: State;
  /** null until the webhook made the contact (new buyer, erased, deleted). */
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
    'User-Agent: pet/1.0',
    'Version: 1',
    `Original-Rcpt-To: <${email}>`,
    `Original-Message-ID: <pet-${randomUUID()}@${sendingDomain}>`,
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

/** A buyer already known in `state` (or, for new_buyer, not known at all). */
async function person(state: State, prefix = 'pet'): Promise<Person> {
  const email = `${prefix}-${state.replace(/_/g, '')}-${++serial}-${tag}@test.local`;
  if (state === 'new_buyer') return { state, id: null, email, made: 'no contact before the order' };
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
    const erased = await call('POST', `/api/v1/contacts/${id}/anonymize`, {});
    expect(erased.status, erased.text).toBe(200);
    erasureHashes.push((JSON.parse(erased.text) as { data: { emailHash: string } }).data.emailHash);
    made += ` + POST /anonymize ${erased.status}; the order makes the contact again`;
    id = null;
  }
  if (state === 'deleted_before') {
    const del = await call('DELETE', `/api/v1/contacts/${id}`);
    expect(del.status, del.text).toBe(204);
    made += ` + DELETE /contacts ${del.status} before the order`;
    id = null;
  }
  return { state, id, email, made };
}

/** The shop's order webhook for `email` (generic receiver, Magento shape), unpaid. */
async function order(email: string, orderId = `pet-${tag}-${++orderSerial}`, status = 'pending') {
  const res = await fetch(`${API}/api/v1/ecommerce/webhooks/generic/${connectionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
    body: JSON.stringify({
      increment_id: orderId,
      entity_id: orderSerial,
      customer_email: email,
      status,
      grand_total: '578.00',
      order_currency_code: 'CZK',
      created_at: new Date().toISOString(),
      items: [{ sku: 'S1', name: 'Zboží', qty_ordered: 1, price: 499, product_id: 'p1' }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, text: await res.text(), orderId };
}

/** The live contact with this address now. */
async function liveContact(email: string): Promise<{ id: string; status: string } | null> {
  const [c] = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM contacts
    WHERE org_id = ${seed.id} AND email = ${email.toLowerCase()} AND deleted_at IS NULL
  `;
  return c ?? null;
}

/** Fork a template the way the gallery does; the flow is a draft. */
async function fork(slug: string, label: string) {
  const r = await call('POST', `/api/v1/workflow-templates/${slug}/fork`, {
    name: `pet ${label} ${tag}`,
  });
  expect(r.status, r.text).toBe(201);
  const wf = (JSON.parse(r.text) as { data: Wf }).data;
  workflowIds.push(wf.id);
  return wf;
}

interface WfNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}
interface Wf {
  id: string;
  nodes: WfNode[];
  edges: { id: string; source: string; target: string; label?: string }[];
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
    if (!jobs.length && Date.now() > appear) return { text: 'no job', data: null as unknown };
    const states = await Promise.all(jobs.map((j) => j.getState()));
    if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
      const out: string[] = [];
      let data: unknown = null;
      for (const stale of jobs) {
        const j = (await emailQ.getJob(stale.id!)) ?? stale;
        out.push(`${await j.getState()} ${JSON.stringify(j.returnvalue)}`);
        data = j.data;
      }
      return { text: out.join(' | '), data };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { text: 'did not settle', data: null as unknown };
}

/** Run the template branch's batch-sender job(s) for this contact: "sent=… skipped=…/flag". */
async function runBatch(contactId: string): Promise<{ text: string; data: unknown[] }> {
  const jobs = (await batchSenderQueues.triggered.getJobs(
    ALL,
    0,
    5_000,
  )) as Job<BatchSenderJobData>[];
  const mine = jobs.filter((j) => j?.data?.contactIds?.includes(contactId));
  if (!mine.length) return { text: 'no batch job', data: [] };
  const out: string[] = [];
  const data: unknown[] = [];
  for (const j of mine) {
    const r = (await processBatchSender({
      data: j.data,
      log: async () => {},
    } as unknown as Job<BatchSenderJobData>)) as { sent: number; skipped: number };
    out.push(`sent=${r.sent} skipped=${r.skipped}/${j.data.flowTransactional ? 'ft' : '-'}`);
    data.push(j.data);
    await j.remove().catch(() => {});
  }
  return { text: out.join(','), data };
}

/** Run every queued MTA job for `to` through the real processor: "status/stream/purpose". */
async function deliver(to: string): Promise<{ text: string; data: unknown[] }> {
  const jobs = ((await mtaQueues.other.getJobs(OPEN, 0, 5_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase(),
  );
  const out: string[] = [];
  const data: unknown[] = [];
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
    data.push(j.data);
    await j.remove().catch(() => {});
  }
  return { text: out.join(',') || 'no mta job', data };
}

const handedTo = (email: string) =>
  engine.handed.filter((m) => m.toEmail.toLowerCase() === email.toLowerCase());

interface Cell {
  made: string;
  trigger: number;
  statusAfter: string | null;
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

interface Walk {
  people: Person[];
  /** node → state key → cell */
  cells: Record<string, Record<string, Cell>>;
  /** node → state key → what went to the queues and the engine, for comparisons */
  sent: Record<string, Record<string, { job: unknown; batch: unknown[]; mta: unknown[] }>>;
  advanced: Record<string, unknown>;
}

const stateKey = (people: Person[], p: Person, i: number) =>
  people.filter((q) => q.state === p.state).length > 1 ? `${p.state}#${i}` : p.state;

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
): Promise<Walk> {
  const out: Walk = { people, cells: {}, sent: {}, advanced: {} };
  const trigger: Record<string, number> = {};
  const statusAfter: Record<string, string | null> = {};
  await Promise.all(
    people.map(async (p, i) => {
      const key = stateKey(people, p, i);
      const r = await fire(p);
      trigger[key] = r.status;
      const live = await liveContact(p.email);
      if (live && !p.id) {
        p.id = live.id;
        contactIds.push(live.id);
      }
      if (live && p.id !== live.id) {
        contactIds.push(live.id);
        p.id = live.id;
      }
      statusAfter[key] = live?.status ?? null;
    }),
  );
  for (const step of steps) {
    if (step.wait) {
      const ids = people.map((p) => p.id).filter((x): x is string => !!x);
      out.advanced[step.wait] = await advance(workflowId, ids, step.wait);
    }
    const cells: Record<string, Cell> = {};
    const sent: Walk['sent'][string] = {};
    await Promise.all(
      people.map(async (p, i) => {
        const key = stateKey(people, p, i);
        let made = p.made;
        if (!p.id) {
          cells[key] = {
            made,
            trigger: trigger[key]!,
            statusAfter: statusAfter[key] ?? null,
            job: 'no contact',
            batch: '-',
            mta: '-',
            subject: null,
            reached: false,
          };
          return;
        }
        const job = await settledNode(p.id, workflowId, step.node);
        if (p.state === 'deleted_late' && step === steps[0]) {
          // Deleted after the flow queued the mail and before batch-sender ran it.
          const del = await call('DELETE', `/api/v1/contacts/${p.id}`);
          expect(del.status, del.text).toBe(204);
          made += ` + DELETE /contacts ${del.status} after the job settled`;
        }
        const before = handedTo(p.email).length;
        const batch = await runBatch(p.id);
        const mta = await deliver(p.email);
        const got = handedTo(p.email).slice(before);
        cells[key] = {
          made,
          trigger: trigger[key]!,
          statusAfter: statusAfter[key] ?? null,
          job: job.text,
          batch: batch.text,
          mta: mta.text,
          subject: got[0]?.subject ?? null,
          reached: got.length > 0,
        };
        sent[key] = { job: job.data, batch: batch.data, mta: mta.data };
        console.log(
          `[pet] ${label} ${step.node} ${key}: trigger=${trigger[key]} status=${statusAfter[key]} job=${job.text} batch=${batch.text} mta=${mta.text} engine=${got.length ? 'ANO' : 'NE'} | ${made}`,
        );
      }),
    );
    out.cells[step.node] = cells;
    out.sent[step.node] = sent;
  }
  for (const [i, p] of people.entries()) {
    if (!p.id) continue;
    const runs = await sql<{ status: string }[]>`
      SELECT status FROM workflow_runs WHERE workflow_id = ${workflowId} AND contact_id = ${p.id}
    `;
    const key = stateKey(people, p, i);
    const text = runs.map((r) => r.status).join(',') || 'no run';
    for (const node of Object.keys(out.cells)) {
      if (out.cells[node]![key]) out.cells[node]![key]!.run = text;
    }
  }
  return out;
}

const byOrder = (p: Person) => order(p.email);
const byEvent = (eventName: string, properties: Record<string, unknown>) => (p: Person) =>
  call('POST', '/api/v1/events', { contactId: p.id, eventName, properties });

/** A message, a job or anything else, with what differs per recipient and per run replaced. */
function normalise(value: unknown, people: Person[]): string {
  let s = JSON.stringify(value, Object.keys(flatKeys(value)).sort(), 1);
  for (const p of people) {
    s = s.split(p.email).join('<EMAIL>').split(encodeURIComponent(p.email)).join('<EMAIL>');
  }
  return s
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<TIME>')
    .replace(/(?<![0-9])1[0-9]{12}(?![0-9])/g, '<MS>')
    .replace(/[A-Za-z0-9_-]{24,}(\.[A-Za-z0-9_-]{10,})*/g, '<TOKEN>');
}

/** Every key at any depth, so JSON.stringify writes objects in one key order. */
function flatKeys(value: unknown, acc: Record<string, true> = {}): Record<string, true> {
  if (Array.isArray(value)) for (const v of value) flatKeys(v, acc);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc[k] = true;
      flatKeys(v, acc);
    }
  }
  return acc;
}

/** Lines that differ, by position: "n: a ≠ b". */
function lineDiff(a: string, b: string): string[] {
  const x = a.split('\n');
  const y = b.split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) out.push(`${i}: ${JSON.stringify(x[i])} ≠ ${JSON.stringify(y[i])}`);
  }
  return out;
}

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
           (SELECT count(*)::int FROM templates WHERE org_id = o.id) AS templates,
           (SELECT count(*)::int FROM revenue_events WHERE org_id = o.id) AS revenue_events,
           (SELECT count(*)::int FROM ecommerce_connections WHERE org_id = o.id) AS ecommerce_connections
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

let toc: Walk;
let ppc: Walk;

describe('the informational e-mails of an order are transactional (Z163)', () => {
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
    // Anything of the seed org that an order, payment_pending or
    // ticketing.order_paid would start besides this file's own flows is set
    // inactive for the file and put back after it.
    const others = await sql<{ id: string }[]>`
      SELECT id FROM workflows
      WHERE org_id = ${seed.id} AND status = 'active' AND deleted_at IS NULL
        AND (trigger_type = 'purchase_event'
             OR (trigger_type = 'api_event'
                 AND (trigger_config->>'eventName' IS NULL
                      OR trigger_config->>'eventName' IN ('order_placed', 'payment_pending', 'ticketing.order_paid'))))
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
      name: `pet magento ${tag}`,
      baseUrl: 'https://pet.example.com',
      accessToken: 'pet-token',
      webhookSecret: WEBHOOK_SECRET,
    });
    expect(conn.status, conn.text).toBeLessThan(300);
    connectionId = (JSON.parse(conn.text) as { data: { id: string } }).data.id;

    const toc0 = await fork('transactional-order-confirmation', 'toc');
    const ppc0 = await fork('post-purchase-cs', 'ppc');
    const xs0 = await fork('cross-sell-cs', 'xs');
    const pp0 = await fork('payment-pending-cs', 'pp');
    flows.toc = toc0.id;
    flows.ppc = ppc0.id;
    flows.xs = xs0.id;
    flows.pp = pp0.id;
    report.forks = Object.fromEntries(
      [toc0, ppc0, xs0, pp0].map((w) => [
        w.id,
        w.nodes.filter((n) => n.type === 'send_email').map((n) => ({ id: n.id, ...n.config })),
      ]),
    );

    // TK: a flow of this file on ticketing.order_paid, the template e-mail of
    // the PPC fork's e1, priority transactional (as Z159's T2).
    const e1 = ppc0.nodes.find((n) => n.id === 'e1')!;
    const tkNodes = [
      { id: 'trigger', type: 'trigger', config: {} },
      {
        id: 'send',
        type: 'send_email',
        config: {
          templateId: e1.config.templateId,
          subject: 'Objednávka {{first_name}}',
          priority: 'transactional',
        },
      },
    ];
    const tkName = `pet tk ${tag}`;
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

    // HID: the fork answers 404 for a hidden template, so the flow is written
    // in the shape a fork made before it was hidden (registry.ts nodes, the
    // e-mails seriesForCategory('post_purchase', 'en') pairs them with, one
    // organisation copy per e-mail).
    const hiddenFork = await call(
      'POST',
      '/api/v1/workflow-templates/post-purchase-shipping-update/fork',
      {},
    );
    report.hiddenForkHttp = hiddenFork.status;
    expect(hiddenFork.status, hiddenFork.text).toBe(404);
    flows.hid = await insertHidden('hid');

    workers.push(startWorkflowEmailWorker());
    console.log(`[pet] seed org before: ${JSON.stringify(orgBefore)}`);
  }, 180_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    const mine = `%-${tag}@test.local`;
    const orders = `pet-${tag}-%`;
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
    console.log(`PET_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    // The seed org exactly as this file found it: plan, events, every
    // suppression (the fingerprint rows included), counters, contacts, flows,
    // templates, revenue, connections.
    expect(orgAfter).toEqual(orgBefore);
  }, 300_000);

  // ── TOC: transactional-order-confirmation, e1 informational ───────────────

  it('TOC — walk every state by webhook; active and a new buyer get it, no negative does', async () => {
    await onlyActive(flows.toc);
    const people = await Promise.all(ALL_STATES.map((s) => person(s, 'petoc')));
    toc = await walk('TOC', flows.toc, people, [{ node: 'e1' }], byOrder);
    report.TOC = toc.cells;
    const e1 = toc.cells.e1!;
    for (const st of BOTH) expect(e1[st]!.reached, `${st}: ${JSON.stringify(e1[st])}`).toBe(true);
    for (const st of NEGATIVE) {
      expect(e1[st]!.reached, `${st}: ${JSON.stringify(e1[st])}`).toBe(false);
    }
    expect(e1.new_buyer!.statusAfter).toBe('non_subscribed');
  }, 600_000);

  it.each(LIFTED)('TOC e1 — the order confirmation reaches %s', (st) => {
    const c = toc.cells.e1![st]!;
    expect(c.reached, `${st}: ${JSON.stringify(c)}`).toBe(true);
    expect(c.batch, st).toBe('sent=1 skipped=0/ft');
    expect(c.mta, st).toBe('sent/triggered/flow_transactional');
  });

  // ── PPC: post-purchase-cs, e1–e3 informational, e4 the review request ─────

  it('PPC — walk every state through all four e-mails; e4 stays marketing', async () => {
    await onlyActive(flows.ppc);
    const people = await Promise.all(ALL_STATES.map((s) => person(s, 'peppc')));
    ppc = await walk(
      'PPC',
      flows.ppc,
      people,
      [
        { node: 'e1' },
        { wait: 'w1', node: 'e2' },
        { wait: 'w2', node: 'e3' },
        { wait: 'w3', node: 'e4' },
      ],
      byOrder,
    );
    report.PPC = { cells: ppc.cells, advanced: ppc.advanced };
    for (const node of ['e1', 'e2', 'e3']) {
      const cells = ppc.cells[node]!;
      for (const st of BOTH) expect(cells[st]!.reached, `${node} ${st}`).toBe(true);
      for (const st of NEGATIVE) {
        expect(cells[st]!.reached, `${node} ${st}: ${JSON.stringify(cells[st])}`).toBe(false);
      }
    }
    const e4 = ppc.cells.e4!;
    expect(e4.active!.reached, `e4 active: ${JSON.stringify(e4.active)}`).toBe(true);
    // Z166 — Michal, 14. 10. 22:10, point 3: the review request is a marketing
    // node, and a new buyer is non_subscribed. It was asserted reached (BOTH).
    expect(e4.new_buyer!.reached, `e4 new_buyer: ${JSON.stringify(e4.new_buyer)}`).toBe(false);
    for (const st of [...LIFTED, ...NEGATIVE]) {
      expect(e4[st]!.reached, `e4 ${st}: ${JSON.stringify(e4[st])}`).toBe(false);
    }
  }, 900_000);

  it.each(LIFTED.flatMap((st) => ['e1', 'e2', 'e3'].map((node) => [node, st] as const)))(
    'PPC %s — the informational e-mail reaches %s',
    (node, st) => {
      const c = ppc.cells[node]![st]!;
      expect(c.reached, `${node} ${st}: ${JSON.stringify(c)}`).toBe(true);
      expect(c.batch, `${node} ${st}`).toBe('sent=1 skipped=0/ft');
      expect(c.mta, `${node} ${st}`).toBe('sent/triggered/flow_transactional');
    },
  );

  // ── Controls: the same on master and the branch ───────────────────────────

  it('XS — cross-sell-cs (marketing on purchase_event) reaches active, not unsubscribed', async () => {
    await onlyActive(flows.xs);
    const people = await Promise.all(
      (['active', 'unsubscribed'] as State[]).map((s) => person(s, 'pexs')),
    );
    const w = await walk('XS', flows.xs, people, [{ wait: 'w1', node: 'e1' }], byOrder);
    report.XS = { cells: w.cells, advanced: w.advanced };
    expect(w.cells.e1!.active!.reached, JSON.stringify(w.cells.e1!.active)).toBe(true);
    expect(w.cells.e1!.unsubscribed!.reached, JSON.stringify(w.cells.e1!.unsubscribed)).toBe(false);
  }, 600_000);

  it('TK — ticketing.order_paid (secret key) reaches active and unsubscribed', async () => {
    await onlyActive(flows.tk);
    const people = await Promise.all(
      (['active', 'unsubscribed'] as State[]).map((s) => person(s, 'petk')),
    );
    const fire = byEvent('ticketing.order_paid', { eventTitle: 'Hamlet' });
    const w = await walk('TK', flows.tk, people, [{ node: 'send' }], fire);
    report.TK = w.cells;
    for (const st of ['active', 'unsubscribed']) {
      const c = w.cells.send![st]!;
      expect(c.reached, `${st}: ${JSON.stringify(c)}`).toBe(true);
      expect(c.mta, st).toBe('sent/triggered/flow_transactional');
    }
  }, 600_000);

  // Z165: was "reaches active, not unsubscribed" — payment_pending joined the
  // list (Michal, 15. 10. ~21:30, point 1d, variant a).
  it('PP — payment-pending-cs (secret key) reaches active and unsubscribed', async () => {
    await onlyActive(flows.pp);
    const people = await Promise.all(
      (['active', 'unsubscribed'] as State[]).map((s) => person(s, 'pepp')),
    );
    const fire = byEvent('payment_pending', { order: { number: '2026-001' } });
    const w = await walk('PP', flows.pp, people, [{ node: 'e1' }], fire);
    report.PP = w.cells;
    expect(w.cells.e1!.active!.reached, JSON.stringify(w.cells.e1!.active)).toBe(true);
    expect(w.cells.e1!.unsubscribed!.reached, JSON.stringify(w.cells.e1!.unsubscribed)).toBe(true);
    expect(w.cells.e1!.unsubscribed!.mta).toBe('sent/triggered/flow_transactional');
  }, 600_000);

  // Z165: was "changes nothing that is sent" (all four diffs empty) —
  // payment_pending joined the list (Michal, 15. 10. ~21:30, point 1d, variant
  // a), so the priority now makes the e-mail transactional.
  it('PP — the priority on payment_pending makes the e-mail transactional, the job is the same', async () => {
    // The fork as it is, and the same flow without any priority (as master
    // forks it): one active buyer each, everything the queues and the engine
    // got compared after the per-recipient values are replaced.
    const fresh = await sql<{ nodes: WfNode[]; trigger_config: unknown }[]>`
      SELECT nodes, trigger_config FROM workflows WHERE id = ${flows.pp}
    `;
    const stripped = fresh[0]!.nodes.map((n) => {
      const { priority: _drop, ...config } = n.config;
      return { ...n, config };
    });
    const bareName = `pet pp-bare ${tag}`;
    const [bare] = await sql<{ id: string }[]>`
      INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
      SELECT org_id, ${bareName}, 'inactive', trigger_type, trigger_config,
             ${JSON.stringify(stripped)}::jsonb, edges
      FROM workflows WHERE id = ${flows.pp}
      RETURNING id
    `;
    workflowIds.push(bare!.id);
    const priorities = fresh[0]!.nodes.map((n) => `${n.id}:${String(n.config.priority ?? '-')}`);
    const fire = byEvent('payment_pending', { order: { number: '2026-002' } });
    const runOne = async (label: string, id: string) => {
      await onlyActive(id);
      const p = await person('active', `pepp${label}`);
      const w = await walk(`PP ${label}`, id, [p], [{ node: 'e1' }], fire);
      const handed = handedTo(p.email);
      expect(handed, label).toHaveLength(1);
      const sent = w.sent.e1!.active!;
      return {
        cell: w.cells.e1!.active!,
        job: normalise(sent.job, [p]),
        batch: normalise(sent.batch, [p]),
        mta: normalise(sent.mta, [p]),
        engine: normalise(handed[0], [p]),
      };
    };
    const marked = await runOne('marked', flows.pp);
    const plain = await runOne('plain', bare!.id);
    const diffs = {
      job: lineDiff(marked.job, plain.job),
      batch: lineDiff(marked.batch, plain.batch),
      mta: lineDiff(marked.mta, plain.mta),
      engine: lineDiff(marked.engine, plain.engine),
    };
    report.PPpriority = {
      forkPriorities: priorities,
      marked: marked.cell,
      plain: plain.cell,
      bytes: { job: marked.job.length, batch: marked.batch.length, engine: marked.engine.length },
      diffs,
    };
    console.log(`[pet] PP priority ${JSON.stringify(report.PPpriority)}`);
    expect(diffs.job).toEqual([]);
    expect(diffs.engine).toEqual([]);
    expect(marked.cell.batch).toBe('sent=1 skipped=0/ft');
    expect(marked.cell.mta).toBe('sent/triggered/flow_transactional');
    expect(plain.cell.batch).toBe('sent=1 skipped=0/-');
    expect(plain.cell.mta).toBe('sent/triggered/-');
    expect(plain.cell.reached).toBe(true);
  }, 600_000);

  it('HID — the hidden post-purchase-shipping-update fork does not reach unsubscribed', async () => {
    await onlyActive(flows.hid);
    const people = await Promise.all(
      (['active', 'unsubscribed'] as State[]).map((s) => person(s, 'pehid')),
    );
    const w = await walk('HID', flows.hid, people, [{ node: 'e1' }], byOrder);
    report.HID = w.cells;
    expect(w.cells.e1!.active!.reached, JSON.stringify(w.cells.e1!.active)).toBe(true);
    expect(w.cells.e1!.unsubscribed!.reached, JSON.stringify(w.cells.e1!.unsubscribed)).toBe(false);
  }, 600_000);

  // ── Probes: measured, not asserted ─────────────────────────────────────────

  it('probe 2 — the same order twice (create, then update): runs and e-mails', async () => {
    await onlyActive(flows.toc);
    const p = await person('active', 'pedup');
    const orderId = `pet-${tag}-dup`;
    const first = await order(p.email, orderId, 'pending');
    const one = await walk('DUP create', flows.toc, [p], [{ node: 'e1' }], async () => first);
    const second = await order(p.email, orderId, 'processing');
    await new Promise((r) => setTimeout(r, 8_000));
    const batch = await runBatch(p.id!);
    const mta = await deliver(p.email);
    const [runs] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM workflow_runs
      WHERE workflow_id = ${flows.toc} AND contact_id = ${p.id}
    `;
    const [orders] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ecommerce_orders
      WHERE connection_id = ${connectionId} AND external_order_id = ${orderId}
    `;
    report.probe2 = {
      create: { http: first.status, cell: one.cells.e1!.active },
      update: { http: second.status, batch: batch.text, mta: mta.text },
      runs: runs!.n,
      orders: orders!.n,
      engineMessages: handedTo(p.email).length,
    };
    console.log(`[pet] probe 2 ${JSON.stringify(report.probe2)}`);
  }, 300_000);

  it('probe 3 — who may set a node priority: PUT /workflows by an editor and a viewer', async () => {
    const out: Record<string, unknown> = {};
    for (const role of ['editor', 'viewer']) {
      const key = await keyWithRole(role);
      const wf = await fork('cross-sell-cs', `probe3-${role}`);
      const nodes = wf.nodes.map((n) =>
        n.id === 'e1' ? { ...n, config: { ...n.config, priority: 'transactional' } } : n,
      );
      const r = await call('PUT', `/api/v1/workflows/${wf.id}`, { nodes }, key);
      const [stored] = await sql<{ nodes: WfNode[] }[]>`
        SELECT nodes FROM workflows WHERE id = ${wf.id}
      `;
      out[role] = {
        http: r.status,
        body: r.text.slice(0, 200),
        storedPriority: stored!.nodes.find((n) => n.id === 'e1')?.config.priority ?? null,
      };
      if (role === 'editor') {
        // What it does: the cross-sell e-mail, re-marked, to an unsubscribed buyer.
        await onlyActive(wf.id);
        const p = await person('unsubscribed', 'pep3');
        const w = await walk('probe3', wf.id, [p], [{ wait: 'w1', node: 'e1' }], byOrder);
        out.editorMarkedCrossSellToUnsubscribed = w.cells.e1!.unsubscribed;
      }
    }
    report.probe3 = out;
    console.log(`[pet] probe 3 ${JSON.stringify(out)}`);
  }, 600_000);

  // ── Migration 0038 ─────────────────────────────────────────────────────────

  let migratedToc = '';

  it('migration 0038 — re-marks exactly the informational nodes of untouched forks, once', async () => {
    // The four published templates the migration knows, forked now. A fork of
    // this branch already has the priority; it is taken off, so each is what
    // a fork made before Z163 stored (on master there is nothing to take off).
    // The flows of the walks above are forks of the same templates (with the
    // priority on this branch, without it on master): out of the way first.
    const earlier = [...workflowIds];
    await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${earlier})`;
    await sql`DELETE FROM workflows WHERE id = ANY(${earlier})`;
    const made: Record<string, Wf> = {};
    for (const slug of [
      'transactional-order-confirmation',
      'post-purchase-cs',
      'payment-pending-cs',
      'pickup-invoice-cs',
    ]) {
      made[slug] = await fork(slug, `mig ${slug}`);
    }
    const editedSubject = await fork('post-purchase-cs', 'mig subject');
    const swappedEmail = await fork('post-purchase-cs', 'mig swapped');
    const deletedNode = await fork('post-purchase-cs', 'mig deleted');
    const marketing = await fork('cross-sell-cs', 'mig marketing');
    const hidden = await insertHidden('mig hidden');
    const freshToc = JSON.stringify(canonical(made['transactional-order-confirmation']!.nodes));
    const freshHadPriority = made['transactional-order-confirmation']!.nodes.some(
      (n) => n.config.priority !== undefined,
    );
    const all = [...Object.values(made), editedSubject, swappedEmail, deletedNode, marketing];
    const allIds = all.map((w) => w.id);
    const strippedKeys = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM workflows w, jsonb_array_elements(w.nodes) e
      WHERE w.id = ANY(${allIds}) AND e->'config' ? 'priority'
    `;
    await sql`
      UPDATE workflows w
      SET nodes = (SELECT jsonb_agg(e #- '{config,priority}' ORDER BY i)
                   FROM jsonb_array_elements(w.nodes) WITH ORDINALITY x (e, i))
      WHERE w.id = ANY(${allIds})
    `;

    // The editor's own route for the three edited forks (the web editor can
    // only change a subject; the API takes any config).
    const put = async (wf: Wf, nodes: WfNode[], edges = wf.edges) => {
      const [now] = await sql<
        { nodes: WfNode[] }[]
      >`SELECT nodes FROM workflows WHERE id = ${wf.id}`;
      const r = await call('PUT', `/api/v1/workflows/${wf.id}`, { nodes, edges });
      expect(r.status, r.text).toBe(200);
      const [after] = await sql<
        { nodes: WfNode[] }[]
      >`SELECT nodes FROM workflows WHERE id = ${wf.id}`;
      return { before: now!.nodes, after: after!.nodes };
    };
    const nodesOf = async (id: string) =>
      (await sql<{ nodes: WfNode[] }[]>`SELECT nodes FROM workflows WHERE id = ${id}`)[0]!.nodes;
    const subjectNodes = (await nodesOf(editedSubject.id)).map((n) =>
      n.id === 'e1'
        ? { ...n, config: { ...n.config, subject: `${String(n.config.subject)}!` } }
        : n,
    );
    await put(editedSubject, subjectNodes);
    const swapNodes0 = await nodesOf(swappedEmail.id);
    const reviewCopy = swapNodes0.find((n) => n.id === 'e4')!.config.templateId;
    const swapNodes = swapNodes0.map((n) =>
      n.id === 'e2' ? { ...n, config: { ...n.config, templateId: reviewCopy } } : n,
    );
    const swapped = await put(swappedEmail, swapNodes);
    report.probe1Put = {
      before: swapped.before.find((n) => n.id === 'e2')!.config,
      after: swapped.after.find((n) => n.id === 'e2')!.config,
    };
    const delNodes = (await nodesOf(deletedNode.id)).filter((n) => n.id !== 'e3');
    const delEdges = [
      ...deletedNode.edges.filter((e) => e.source !== 'e3' && e.target !== 'e3'),
      { id: 'e45', source: 'w2', target: 'w3' },
    ];
    await put(deletedNode, delNodes, delEdges);

    const snapshot = async () => {
      const rows = await sql<{ id: string; nodes: string; rest: string }[]>`
        SELECT id, nodes::text AS nodes, (to_jsonb(w) - 'nodes')::text AS rest FROM workflows w
      `;
      return new Map(rows.map((r) => [r.id, r]));
    };
    const before = await snapshot();
    const text = readFileSync(MIGRATION, 'utf8');
    const applied = await sql.begin(async (tx) => {
      const t0 = performance.now();
      const r = await tx.unsafe(text);
      const ms = performance.now() - t0;
      const locks = await tx<{ rel: string; mode: string }[]>`
        SELECT coalesce(relation::regclass::text, locktype) AS rel, mode FROM pg_locks
        WHERE pid = pg_backend_pid() AND locktype IN ('relation', 'transactionid')
        ORDER BY 1, 2
      `;
      return {
        count: r.count,
        ms: Math.round(ms * 10) / 10,
        locks: locks.map((l) => `${l.rel} ${l.mode}`),
      };
    });
    const after = await snapshot();
    const again = await sql.begin(async (tx) => (await tx.unsafe(text)).count);
    const third = await snapshot();

    const ours = new Map<string, string>([
      [made['transactional-order-confirmation']!.id, 'TOC'],
      [made['post-purchase-cs']!.id, 'PPC'],
      [made['payment-pending-cs']!.id, 'PP'],
      [made['pickup-invoice-cs']!.id, 'PI'],
      [editedSubject.id, 'PPC subject edited'],
      [swappedEmail.id, 'PPC e2 e-mail swapped'],
      [deletedNode.id, 'PPC e3 deleted'],
      [marketing.id, 'cross-sell-cs'],
      [hidden, 'hidden post-purchase-shipping-update'],
    ]);
    const changed: Record<string, string[]> = {};
    const otherChanged: string[] = [];
    // Any other column of a row the migration wrote, or of one of this file's
    // flows. (Rows of other flows can move under a running scheduler; their
    // nodes are what this checks.)
    const columnsChanged: string[] = [];
    for (const [id, b] of before) {
      const a = after.get(id)!;
      if (a.rest !== b.rest && (a.nodes !== b.nodes || ours.has(id))) columnsChanged.push(id);
      if (a.nodes === b.nodes) continue;
      if (!ours.has(id)) {
        // A fork of another file or org left in this database: re-marked by
        // the same rule, reported with what changed.
        otherChanged.push(`${id} ${nodeDiff(JSON.parse(b.nodes), JSON.parse(a.nodes)).join(' ')}`);
        continue;
      }
      changed[ours.get(id)!] = nodeDiff(JSON.parse(b.nodes), JSON.parse(a.nodes));
    }
    migratedToc = made['transactional-order-confirmation']!.id;
    const migratedTocNodes = JSON.stringify(canonical(JSON.parse(after.get(migratedToc)!.nodes)));
    report.migration = {
      workflowsInDb: before.size,
      prioritiesTakenOffForkForEmulation: strippedKeys[0]!.n,
      firstRun: applied,
      changed,
      otherChanged,
      columnsChanged,
      unchanged: [...ours.values()].filter((label) => !changed[label]),
      secondRunCount: again,
      secondRunUnchanged: [...after].every(([id, r]) => third.get(id)!.nodes === r.nodes),
      migratedTocEqualsFreshFork: migratedTocNodes === freshToc,
      freshForkHadPriority: freshHadPriority,
    };
    console.log(`[pet] migration ${JSON.stringify(report.migration)}`);

    const plus = '+config.priority="transactional"';
    expect(changed).toEqual({
      TOC: [`e1 ${plus}`],
      PPC: [`e1 ${plus}`, `e2 ${plus}`, `e3 ${plus}`],
      PP: [`e1 ${plus}`],
      PI: [`e1 ${plus}`, `e2 ${plus}`],
    });
    expect(applied.count).toBe(4 + otherChanged.length);
    for (const line of otherChanged) {
      expect(line.split(' ').slice(1).join(' ')).toMatch(
        /^(e\d \+config\.priority="transactional" ?)+$/,
      );
    }
    expect(columnsChanged).toEqual([]);
    expect(again).toBe(0);
    expect(report.migration).toMatchObject({ secondRunUnchanged: true });
    // A fork migrated is the fork this branch makes now (on master, which
    // forks without the priority, the two differ).
    expect(migratedTocNodes === freshToc).toBe(freshHadPriority);
  }, 600_000);

  it('migration 0038 — an old fork, migrated, reaches an unsubscribed buyer', async () => {
    expect(migratedToc, 'the migration test ran first').not.toBe('');
    await onlyActive(migratedToc);
    const p = await person('unsubscribed', 'pemig');
    const w = await walk('MIG', migratedToc, [p], [{ node: 'e1' }], byOrder);
    report.migratedForkUnsubscribed = w.cells.e1!.unsubscribed;
    const c = w.cells.e1!.unsubscribed!;
    expect(c.reached, JSON.stringify(c)).toBe(true);
    expect(c.mta).toBe('sent/triggered/flow_transactional');
  }, 300_000);
});

/** Write the hidden template's fork shape to the table; the organisation copies through the API. */
async function insertHidden(label: string): Promise<string> {
  const copy = async (builtIn: string) => {
    const r = await call('POST', `/api/v1/templates/${builtIn}/use`, {});
    expect(r.status, r.text).toBeLessThan(300);
    return (JSON.parse(r.text) as { data: { id: string } }).data.id;
  };
  const shipping = await copy('b2-trans-010');
  const review = await copy('ecom-003');
  const crossSell = await copy('b2-ecom-006');
  const mail = (id: string, subject: string, builtIn: string, templateId: string) => ({
    id,
    type: 'send_email',
    config: { subject, builtInTemplateId: builtIn, templateId },
  });
  const nodes = [
    { id: 't', type: 'trigger', config: { triggerType: 'purchase_event' } },
    mail('e1', 'Order #{{order.id}} confirmed', 'b2-trans-010', shipping),
    { id: 'w1', type: 'wait', config: { until: { event: 'order_packed' } } },
    mail('e2', 'Your order is packed', 'ecom-003', review),
    { id: 'w2', type: 'wait', config: { until: { event: 'order_shipped' } } },
    mail('e3', 'Your order has shipped — track it here', 'b2-ecom-006', crossSell),
    { id: 'w3', type: 'wait', config: { until: { event: 'order_delivered' } } },
    mail('e4', 'Your order arrived — enjoy!', 'b2-trans-010', shipping),
  ];
  const edges = [
    ['e0', 't', 'e1'],
    ['e1', 'e1', 'w1'],
    ['e2', 'w1', 'e2'],
    ['e3', 'e2', 'w2'],
    ['e4', 'w2', 'e3'],
    ['e5', 'e3', 'w3'],
    ['e6', 'w3', 'e4'],
  ].map(([id, source, target]) => ({ id, source, target }));
  const name = `pet ${label} ${tag}`;
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${seed.id}, ${name}, 'inactive', 'purchase_event', '{}'::jsonb,
            ${JSON.stringify(nodes)}::jsonb, ${JSON.stringify(edges)}::jsonb)
    RETURNING id
  `;
  workflowIds.push(w!.id);
  return w!.id;
}

/** Nodes with every object's keys in one order, for comparing JSON as text. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** What changed per node id: "e1 +config.priority=…", "-config.x", "~config.y". */
function nodeDiff(before: WfNode[], after: WfNode[]): string[] {
  const out: string[] = [];
  const ids = [...new Set([...before.map((n) => n.id), ...after.map((n) => n.id)])];
  for (const id of ids) {
    const b = before.find((n) => n.id === id);
    const a = after.find((n) => n.id === id);
    if (!a || !b) {
      out.push(`${id} ${a ? 'added' : 'removed'}`);
      continue;
    }
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const k of keys) {
      if (k === 'config') continue;
      const bv = JSON.stringify(canonical((b as unknown as Record<string, unknown>)[k]));
      const av = JSON.stringify(canonical((a as unknown as Record<string, unknown>)[k]));
      if (bv !== av) out.push(`${id} ~${k}`);
    }
    const ck = new Set([...Object.keys(b.config), ...Object.keys(a.config)]);
    for (const k of [...ck].sort()) {
      const bv = b.config[k];
      const av = a.config[k];
      if (bv === undefined) out.push(`${id} +config.${k}=${JSON.stringify(av)}`);
      else if (av === undefined) out.push(`${id} -config.${k}`);
      else if (JSON.stringify(canonical(bv)) !== JSON.stringify(canonical(av))) {
        out.push(`${id} ~config.${k}`);
      }
    }
  }
  return out;
}
