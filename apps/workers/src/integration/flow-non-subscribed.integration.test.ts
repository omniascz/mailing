/**
 * A flow's marketing node skips a non_subscribed contact, as a campaign does,
 * on every channel of a flow (Z166).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * Michal, 14. 10. 22:10, point 3: "non_subscribed: marketingové uzly flow ho
 * vynechají jako kampaň; transakční výjimka z bodu 1 platí." A contact with an
 * address and no marketing opt-in — a shop's new buyer, a shopper the checkout
 * script reported, an address from the restock form — got every marketing node
 * of a flow on master: the template e-mail (batch-sender), the inline e-mail,
 * the personal e-mail and the review request (workflow dispatch), the SMS
 * (routing) and WhatsApp / web push (marketingSkip). It now gets none of them.
 * A node with priority 'transactional' on a trigger of the closed list reaches
 * it as before, and no send outside a flow changes.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Real chains: POST /api/v1/events (secret key) → onApiEvent → executor →
 * queue → the real worker in this process (workflow-email, workflow-sms,
 * whatsapp, push) → the real API route → the real batch-sender / routing /
 * channel worker → the real mta-sender. An order arrives by the generic e-shop
 * webhook, a basket by POST /api/v1/checkout-started and a restock by
 * POST /api/v1/back-in-stock/notify. A wait is shortened by moving the run's
 * next_execution_at to now and calling POST /internal/workflow/process-runs.
 *
 * non_subscribed is made by a real path everywhere: the restock form
 * (POST /api/v1/back-in-stock/subscribe with a publishable key) for the
 * api_event flows — its phone is then set by UPDATE, there being no public path
 * that adds one — the order webhook for purchase_event flows and the checkout
 * script for the basket. The other states are INSERTed (unsubscribed with
 * POST /suppressions unsubscribe, as in Z165).
 *
 * Stubbed: the engine's gRPC client (it keeps what it was handed) and the fetch
 * to graph.facebook.com (WhatsApp) and to the web push endpoint's host. SMS goes
 * to a catch-all route whose provider does not exist: "Unknown SMS provider"
 * means past every gate, and no SMS leaves the machine (as Z155).
 *
 *   F   marketing nodes: own flows (template, inline, personal, review, SMS,
 *       WhatsApp, web push), back-in-stock-cs, abandoned-cart-cs, cross-sell-cs;
 *   T   transactional nodes on the closed list: ticketing.order_paid
 *       (template, inline, SMS), payment-pending-cs e1, transactional-order-
 *       confirmation e1 (webhook);
 *   K   no flow: an e-mail campaign, a push campaign, POST /emails, a sequence
 *       step;
 *   R   one run, a marketing node then a transactional one;
 *   B   twenty at once, ten active and ten non_subscribed.
 *
 * Each cell is logged as `[z166] …` and the whole table once as
 * `Z166_CELLS_JSON {…}` at the end, for the report.
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers and the engine.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createECDH, createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { processDueSequenceSteps } from '../../../api/dist/services/crm/sales-sequences.js';
import { startWorkflowEmailWorker } from '../jobs/workflow-email-sender.js';
import { startWorkflowSmsWorker } from '../jobs/workflow-sms-sender.js';
import { startWhatsappSenderWorker } from '../jobs/whatsapp-sender.js';
import { startPushSenderWorker } from '../jobs/push-sender.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import {
  batchSenderQueue,
  batchSenderQueues,
  campaignSplitterQueue,
  connection,
  mtaQueues,
  type BatchSenderJobData,
  type CampaignSplitterJobData,
  type MtaSendJobData,
} from '../queues/index.js';

interface Handed {
  toEmail: string;
  subject: string;
}

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({ handed: [] as Handed[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: Handed) => {
    engine.handed.push({ toEmail: msg.toEmail, subject: msg.subject });
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
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `z166-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const WEBHOOK_SECRET = `z166-secret-${tag}`;
const sinkProvider = `z166-sink-${tag}`;
const WEB_HOST = `z166-wp-${tag}.invalid`;
const FORM_SKU = `z166-form-${tag}`;
const BIS_SKU = `z166-bis-${tag}`;
const SMS_REACHED = `Unknown SMS provider: ${sinkProvider}`;
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

type State = 'active' | 'non_subscribed' | 'unsubscribed' | 'pending';
const STATES: State[] = ['active', 'non_subscribed', 'unsubscribed', 'pending'];
/** How non_subscribed is made: the restock form, the order webhook, the checkout script. */
type NsPath = 'form' | 'order' | 'checkout';

/** A flow's marketing node: only active. */
const F_REACHES: Record<State, boolean> = {
  active: true,
  non_subscribed: false,
  unsubscribed: false,
  pending: false,
};
/** A transactional node on the closed list: everyone here (Z158, Z165). */
const T_REACHES: Record<State, boolean> = {
  active: true,
  non_subscribed: true,
  unsubscribed: true,
  pending: true,
};

let seed: SeedOrg;
let token: string;
let startedAt: Date;
let connectionId: string;
let vapidId: string | null = null;
let p256dh = '';
let authSecret = '';
let sequenceId = '';
let countersBefore: { period_start: Date; sends: number }[] = [];
let orgBefore: Record<string, unknown> = {};
let templatesBefore = new Set<string>();
let othersDeactivated: string[] = [];
const workers: Worker[] = [];
const qs: Record<'email' | 'sms' | 'wa' | 'push' | 'mpush', Queue> = {
  email: new Queue('email', { connection }),
  sms: new Queue('sms', { connection }),
  wa: new Queue('whatsapp-send', { connection }),
  push: new Queue('push-send', { connection }),
  // No worker here: the push campaign also queues mobile push, removed at the end.
  mpush: new Queue('mobile-push-send', { connection }),
};
const contactIds: string[] = [];
const workflowIds: string[] = [];
const campaignIds: string[] = [];
const listIds: string[] = [];
const apiKeyNames: string[] = [];
const flows = {} as Record<string, string>;
/** Everything measured, printed once as Z166_CELLS_JSON. */
const report: Record<string, unknown> = {
  tag,
  mock:
    'the engine gRPC client (lib/mta-grpc-client.js); fetch to graph.facebook.com and to the web ' +
    'push host; SMS ends at a route whose provider does not exist; everything else is real',
};

// ── transport stub (WhatsApp, web push) ─────────────────────────────────────
const hits = { wa: [] as string[], web: [] as string[] };
const realFetch = globalThis.fetch;
function stubTransport() {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const host = new URL(url).hostname;
    if (host === 'graph.facebook.com') {
      hits.wa.push((JSON.parse(String(init?.body)) as { to: string }).to.replace(/\D/g, ''));
      return Response.json({
        messaging_product: 'whatsapp',
        messages: [{ id: `wamid.${hits.wa.length}` }],
      });
    }
    if (host === WEB_HOST) {
      hits.web.push(url);
      return new Response(null, { status: 201 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

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

/**
 * A publishable key of this file, written the way createApiKey writes one. A
 * fresh one every eight uses: the restock form allows ten an hour per key and
 * address, the checkout route twenty — this file's own buckets.
 */
let pubKey = '';
let pubUses = 0;
let pubLock: Promise<unknown> = Promise.resolve();
async function nextPublishable(): Promise<string> {
  if (pubKey && pubUses < 8) {
    pubUses++;
    return pubKey;
  }
  const raw = `fm_pub_${randomBytes(24).toString('hex')}`;
  const name = `integration z166-pub-${apiKeyNames.length}-${tag}`;
  const [owner] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email = ${SEED_LOGIN.email} LIMIT 1
  `;
  await sql`
    INSERT INTO api_keys (org_id, user_id, name, key_hash, key_prefix, is_public)
    VALUES (${seed.id}, ${owner!.id}, ${name},
            ${createHash('sha256').update(raw).digest('hex')}, ${raw.slice(0, 12)}, true)
  `;
  apiKeyNames.push(name);
  // Handed out only once its row exists: callers run concurrently.
  pubKey = raw;
  pubUses = 1;
  return pubKey;
}
function publishable(): Promise<string> {
  const next = pubLock.then(nextPublishable);
  pubLock = next.catch(() => {});
  return next;
}

interface Person {
  key: string;
  state: State;
  /** null until the order / the checkout makes the contact. */
  id: string | null;
  email: string;
  phone: string;
  made: string;
}
let serial = 0;
let orderSerial = 0;

/** sms_consents and a web push subscription: only the status can stop a send. */
async function reachable(p: Person) {
  await sql`
    INSERT INTO sms_consents (org_id, phone, consent_source, consent_context)
    VALUES (${seed.id}, ${p.phone}, 'web_form', ${`z166-${tag}`})
  `;
  await sql`
    INSERT INTO push_subscriptions (org_id, contact_id, endpoint, p256dh, auth)
    VALUES (${seed.id}, ${p.id}, ${`https://${WEB_HOST}/${p.id}`}, ${p256dh}, ${authSecret})
  `;
}

/** The live contact with this address now. */
async function liveContact(email: string): Promise<{ id: string; status: string } | null> {
  const [c] = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM contacts
    WHERE org_id = ${seed.id} AND email = ${email.toLowerCase()} AND deleted_at IS NULL
  `;
  return c ?? null;
}

/** A contact of the seed org in `state`, non_subscribed made by `ns`. */
async function person(state: State, prefix: string, ns: NsPath = 'form'): Promise<Person> {
  const n = ++serial;
  const email = `${prefix}-${state.replace(/_/g, '')}-${n}-${tag}@test.local`;
  const phone = `+4207${String(10_000_000 + n * 7919 + Math.floor(Math.random() * 7_000))}`;
  const p: Person = { key: `${state}#${n}`, state, id: null, email, phone, made: '' };
  if (state === 'non_subscribed') {
    if (ns !== 'form') {
      p.made = `no contact before; made by the ${ns === 'order' ? 'order webhook' : 'checkout script'}`;
      return p;
    }
    const r = await call(
      'POST',
      '/api/v1/back-in-stock/subscribe',
      { email, sku: FORM_SKU },
      await publishable(),
    );
    expect(r.status, r.text).toBe(202);
    const live = await liveContact(email);
    expect(live?.status, email).toBe('non_subscribed');
    p.id = live!.id;
    contactIds.push(p.id);
    await sql`UPDATE contacts SET phone = ${phone}, first_name = 'Petra' WHERE id = ${p.id}`;
    p.made = `POST /back-in-stock/subscribe ${r.status} → status ${live!.status}; phone by UPDATE`;
  } else {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, phone, first_name, status)
      VALUES (${seed.id}, ${email}, ${phone}, 'Petra', ${state}) RETURNING id
    `;
    p.id = c!.id;
    contactIds.push(p.id);
    p.made = `INSERT status ${state}`;
    if (state === 'unsubscribed') {
      const r = await call('POST', '/api/v1/suppressions', { email, reason: 'unsubscribe' });
      expect(r.status, r.text).toBe(201);
      p.made += ` + POST /suppressions unsubscribe ${r.status}`;
    }
  }
  await reachable(p);
  return p;
}

const people = (prefix: string, ns: NsPath = 'form') =>
  Promise.all(STATES.map((s) => person(s, prefix, ns)));

/** The shop's order webhook for `email` (generic receiver, Magento shape). */
async function order(email: string) {
  const orderId = `z166-${tag}-${++orderSerial}`;
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

interface WfNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

/** Fork a template the way the gallery does; the flow is a draft. */
async function fork(slug: string, label: string): Promise<{ id: string; nodes: WfNode[] }> {
  const r = await call('POST', `/api/v1/workflow-templates/${slug}/fork`, {
    name: `z166 ${label} ${tag}`,
  });
  expect(r.status, r.text).toBe(201);
  const wf = (JSON.parse(r.text) as { data: { id: string; nodes: WfNode[] } }).data;
  workflowIds.push(wf.id);
  return wf;
}

/** A flow of this file on an api_event: trigger → the nodes in a row. */
async function flowOf(eventName: string, sends: WfNode[]): Promise<string> {
  const nodes = [{ id: 'trigger', type: 'trigger', config: {} }, ...sends];
  const edges = sends.map((s, i) => ({
    id: `e${i}`,
    source: i === 0 ? 'trigger' : sends[i - 1]!.id,
    target: s.id,
  }));
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${seed.id}, ${`z166 ${eventName} ${tag}`}, 'inactive', 'api_event',
            ${JSON.stringify({ eventName })}::jsonb, ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify(edges)}::jsonb)
    RETURNING id
  `;
  workflowIds.push(w!.id);
  return w!.id;
}

/** Only this flow of the file answers an event while the test runs. */
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

/**
 * This flow's jobs on `q` for the contact (and node) once settled: "state
 * returnvalue", and for SMS the route's answer to the same job ("replay …"),
 * because the worker drops the 502 body (as Z143/Z155).
 */
async function settledOn(q: Queue, contactId: string, workflowId: string, nodeId?: string) {
  const appear = Date.now() + 20_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const runs = await runIdsOf(workflowId, contactId);
    const jobs = (await q.getJobs(ALL, 0, 10_000)).filter(
      (j) =>
        j?.data?.contactId === contactId &&
        runs.includes(j.data.workflowRunId) &&
        (nodeId === undefined || j.data.nodeId === undefined || j.data.nodeId === nodeId),
    );
    if (!jobs.length && Date.now() > appear) return 'no job';
    const states = await Promise.all(jobs.map((j) => j.getState()));
    if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
      const out: string[] = [];
      for (const stale of jobs) {
        const j = (await q.getJob(stale.id!)) ?? stale;
        out.push(`${await j.getState()} ${JSON.stringify(j.returnvalue)}`);
        if (q.name === 'sms') {
          const r = await fetch(`${API}/api/v1/internal/workflow/send-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...INTERNAL },
            body: JSON.stringify(j.data),
          });
          out.push(`replay ${r.status} ${await r.text()}`);
        }
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
    // Read as a record: the RED run compiles this file against master's types.
    const d = j.data as unknown as Record<string, unknown>;
    const flag = d.flowTransactional ? 'ft' : d.flowMarketing ? 'fm' : '-';
    out.push(`sent=${r.sent} skipped=${r.skipped}/${flag}`);
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
type Cells = Record<string, Cell>;
type Channel = 'email' | 'sms' | 'wa' | 'push';

/** Wait until the runs of these contacts have parked, shorten `waitNode`, resume. */
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
 * Start `workflowId` for everyone with `fire` (then `afterFire`, once), shorten
 * `wait` if given, and follow node `node` on `channel` to the end: the queue
 * job, the batch-sender job, the MTA job and the engine, or the SMS route / the
 * WhatsApp and web push transport.
 */
async function walk(opts: {
  label: string;
  workflowId: string;
  people: Person[];
  fire: (p: Person) => Promise<{ status: number; text: string }>;
  afterFire?: () => Promise<unknown>;
  wait?: string;
  node: string;
  channel?: Channel;
}): Promise<Cells> {
  const { label, workflowId, node } = opts;
  const channel = opts.channel ?? 'email';
  await onlyActive(workflowId);
  const trigger: Record<string, string> = {};
  await Promise.all(
    opts.people.map(async (p) => {
      const r = await opts.fire(p);
      trigger[p.key] = `${r.status}${r.status >= 300 ? ` ${r.text.slice(0, 160)}` : ''}`;
    }),
  );
  if (opts.afterFire) {
    const r = await opts.afterFire();
    report[`${label}.afterFire`] = r;
  }
  for (const p of opts.people) {
    const live = await liveContact(p.email);
    if (live && p.id !== live.id) {
      p.id = live.id;
      contactIds.push(live.id);
      p.made += ` → status ${live.status}`;
    }
  }
  const ids = opts.people.map((p) => p.id).filter((x): x is string => !!x);
  if (opts.wait) report[`${label}.advanced`] = await advance(workflowId, ids, opts.wait);
  const cells: Cells = {};
  await Promise.all(
    opts.people.map(async (p) => {
      const job = p.id ? await settledOn(qs[channel], p.id, workflowId, node) : 'no contact';
      let batch = '-';
      let mta = '-';
      let subject: string | null = null;
      let reached: boolean;
      if (channel === 'email') {
        const before = handedTo(p.email).length;
        batch = p.id ? await runBatch(p.id) : 'no contact';
        mta = await deliver(p.email);
        const got = handedTo(p.email).slice(before);
        subject = got[0]?.subject ?? null;
        reached = got.length > 0;
      } else if (channel === 'sms') {
        reached = job.includes(SMS_REACHED);
      } else if (channel === 'wa') {
        reached = hits.wa.includes(p.phone.replace(/\D/g, ''));
      } else {
        reached = !!p.id && hits.web.some((u) => u.endsWith(p.id!));
      }
      const runs = p.id
        ? await sql<{ status: string }[]>`
            SELECT status FROM workflow_runs WHERE workflow_id = ${workflowId} AND contact_id = ${p.id}
          `
        : [];
      cells[p.key] = {
        made: p.made,
        trigger: trigger[p.key]!,
        job,
        batch,
        mta,
        subject,
        reached,
        run: runs.map((r) => r.status).join(',') || 'no run',
      };
      console.log(
        `[z166] ${label} ${p.key}: trigger=${trigger[p.key]} job=${job} batch=${batch} mta=${mta} ` +
          `reached=${reached ? 'ANO' : 'NE'} run=${cells[p.key]!.run} | ${p.made}`,
      );
    }),
  );
  report[label] = cells;
  return cells;
}

/** reached per state, for the one person of each state in `cells`. */
const reachedByState = (cells: Cells) =>
  Object.fromEntries(
    Object.entries(cells).map(([key, c]) => [key.split('#')[0], c.reached]),
  ) as Record<State, boolean>;
const cellOf = (cells: Cells, state: State) =>
  Object.entries(cells).find(([key]) => key.split('#')[0] === state)![1];

const byEvent =
  (eventName: string, properties: Record<string, unknown> = {}) =>
  (p: Person) =>
    call('POST', '/api/v1/events', { contactId: p.id, eventName, properties });
const byOrder = (p: Person) => order(p.email);

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
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id) AS workflows,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id AND status = 'active') AS active_workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = o.id) AS workflow_runs,
           (SELECT count(*)::int FROM workflow_events WHERE org_id = o.id) AS workflow_events,
           (SELECT count(*)::int FROM templates WHERE org_id = o.id) AS templates,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM products WHERE org_id = o.id) AS products,
           (SELECT count(*)::int FROM back_in_stock_subscriptions WHERE org_id = o.id) AS bis_subscriptions,
           (SELECT count(*)::int FROM sales_sequences WHERE org_id = o.id) AS sequences,
           (SELECT count(*)::int FROM sms_routes WHERE org_id = o.id) AS sms_routes,
           (SELECT count(*)::int FROM sms_consents WHERE org_id = o.id) AS sms_consents,
           (SELECT count(*)::int FROM vapid_keys WHERE org_id = o.id) AS vapid_keys,
           (SELECT count(*)::int FROM push_subscriptions WHERE org_id = o.id) AS push_subscriptions,
           (SELECT count(*)::int FROM revenue_events WHERE org_id = o.id) AS revenue_events,
           (SELECT count(*)::int FROM ecommerce_connections WHERE org_id = o.id) AS ecommerce_connections,
           (SELECT count(*)::int FROM sending_domains WHERE org_id = o.id) AS sending_domains,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

/** An e-mail campaign to a list of these people, all the way to the engine. */
async function emailCampaign(label: string, list: Person[]): Promise<Record<State, boolean>> {
  const [l] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`z166 ${label} ${tag}`}) RETURNING id
  `;
  listIds.push(l!.id);
  for (const p of list) {
    await sql`
      INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${p.id}, ${l!.id}, now())
    `;
  }
  const subject = `Z166 kampaň ${label} ${tag}`;
  const created = await call('POST', '/api/v1/campaigns', {
    name: `z166 ${label} ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId: l!.id,
    content: {
      subject,
      blocks: [
        {
          id: 'b1',
          type: 'text',
          content: '<p>Dobrý den.</p>',
          fontSize: '15px',
          fontFamily: 'Arial',
          color: '#111827',
          lineHeight: '1.5',
          textAlign: 'left',
        },
        {
          id: 'b2',
          type: 'footer',
          content: '{{company_name}}',
          showUnsubscribe: true,
          textAlign: 'center',
          fontSize: '12px',
          color: '#6b7280',
        },
      ],
      globalStyles: {
        backgroundColor: '#fff',
        contentBackgroundColor: '#fff',
        fontFamily: 'Arial',
        linkColor: '#00f',
        textColor: '#000',
        contentWidth: 600,
      },
    },
  });
  expect(created.status, created.text).toBeLessThan(300);
  const campaignId = (JSON.parse(created.text) as { data: { id: string } }).data.id;
  campaignIds.push(campaignId);
  const idsOn = async (q: Queue) =>
    new Set((await q.getJobs(ALL, 0, 5_000)).map((j) => String(j?.id)));
  const beforeSplit = await idsOn(campaignSplitterQueue);
  const send = await call('POST', `/api/v1/campaigns/${campaignId}/send`, {
    acknowledgeDeliverabilityRisk: true,
  });
  expect(send.status, send.text).toBe(200);
  const split = (await campaignSplitterQueue.getJobs(ALL, 0, 5_000))
    .filter((j) => j && !beforeSplit.has(String(j.id)))
    .map((j) => j.data as CampaignSplitterJobData)
    .find((d) => d.campaignId === campaignId);
  expect(split, 'no splitter job').toBeTruthy();
  const fake = <T>(data: T) =>
    ({
      id: `z166-${randomUUID()}`,
      timestamp: Date.now(),
      data,
      log: async () => {},
    }) as unknown as Job<T>;
  const beforeBatch = await idsOn(batchSenderQueue);
  await processCampaignSplitter(fake(split!));
  const batches = (await batchSenderQueue.getJobs(ALL, 0, 5_000))
    .filter((j) => j && !beforeBatch.has(String(j.id)))
    .map((j) => j.data as BatchSenderJobData)
    .filter((d) => d.campaignId === campaignId);
  for (const b of batches) await processBatchSender(fake(b));
  const out = {} as Record<State, boolean>;
  for (const p of list) {
    const before = handedTo(p.email).length;
    const mta = await deliver(p.email);
    out[p.state] = handedTo(p.email)
      .slice(before)
      .some((m) => m.subject === subject);
    console.log(`[z166] ${label} ${p.key}: mta=${mta} reached=${out[p.state] ? 'ANO' : 'NE'}`);
  }
  return out;
}

const got = {} as Record<string, Cells | Record<string, unknown>>;

describe('a flow marketing node skips non_subscribed, as a campaign does (Z166)', () => {
  beforeAll(async () => {
    startedAt = new Date();
    seed = await readSeedOrg(sql);
    orgBefore = await orgState();
    token = await seedApiKey(sql, `z166-${tag}`);
    apiKeyNames.push(`integration z166-${tag}`);
    // Owner, so the key can fork, send campaigns and notify a restock.
    await sql`
      UPDATE api_keys SET role = 'owner'
      WHERE key_hash = ${createHash('sha256').update(token).digest('hex')}
    `;
    countersBefore = await sql`
      SELECT period_start, sends FROM plan_send_counters WHERE org_id = ${seed.id}
    `;
    const tpl = await sql<{ id: string }[]>`SELECT id FROM templates WHERE org_id = ${seed.id}`;
    templatesBefore = new Set(tpl.map((t) => t.id));
    // Anything of the seed org an order, a basket, a restock or an event would
    // start besides this file's flows is set inactive for the file and put back.
    const others = await sql<{ id: string }[]>`
      SELECT id FROM workflows
      WHERE org_id = ${seed.id} AND status = 'active' AND deleted_at IS NULL
        AND (trigger_type = 'purchase_event' OR trigger_type = 'api_event')
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
    await sql`
      INSERT INTO sms_routes (org_id, country_code, provider, priority, active, config)
      VALUES (${seed.id}, '*', ${sinkProvider}, 0, true, '{}'::jsonb)
    `;
    for (const sku of [FORM_SKU, BIS_SKU]) {
      await sql`
        INSERT INTO products (org_id, sku, name, price, currency)
        VALUES (${seed.id}, ${sku}, 'Hrnek', 199, 'CZK')
      `;
    }
    const vk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pub = vk.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const rawPub = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(pub.x, 'base64url'),
      Buffer.from(pub.y, 'base64url'),
    ]);
    const [v] = await sql<{ id: string }[]>`
      INSERT INTO vapid_keys (org_id, public_key, private_key, active)
      VALUES (${seed.id}, ${rawPub.toString('base64url')},
              ${(vk.privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer).toString('base64url')}, true)
      RETURNING id
    `;
    vapidId = v!.id;
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    p256dh = ecdh.getPublicKey().toString('base64url');
    authSecret = randomBytes(16).toString('base64url');
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'z166phone';
    process.env.WHATSAPP_ACCESS_TOKEN = 'z166token';
    stubTransport();

    const conn = await call('POST', '/api/v1/ecommerce/connections', {
      platform: 'magento',
      name: `z166 magento ${tag}`,
      baseUrl: 'https://z166.example.com',
      accessToken: 'z166-token',
      webhookSecret: WEBHOOK_SECRET,
    });
    expect(conn.status, conn.text).toBeLessThan(300);
    connectionId = (JSON.parse(conn.text) as { data: { id: string } }).data.id;

    const made = {
      xs: await fork('cross-sell-cs', 'xs'),
      bis: await fork('back-in-stock-cs', 'bis'),
      ac: await fork('abandoned-cart-cs', 'ac'),
      pp: await fork('payment-pending-cs', 'pp'),
      toc: await fork('transactional-order-confirmation', 'toc'),
    };
    for (const [k, w] of Object.entries(made)) flows[k] = w.id;
    report.forks = Object.fromEntries(
      Object.entries(made).map(([k, w]) => [
        k,
        w.nodes
          .filter((n) => n.type === 'send_email')
          .map((n) => `${n.id}:${String(n.config.priority ?? '-')}`),
      ]),
    );
    // A template of the org for the own flows: the cross-sell fork's e1 copy.
    const templateId = made.xs.nodes.find((n) => n.id === 'e1')!.config.templateId;
    expect(templateId, 'xs e1 templateId').toBeTruthy();

    const html = (s: string) => `<p>Ahoj {{first_name}}, ${s}.</p>`;
    const ev = (k: string) => `z166-${k}-${tag}`;
    flows.fTpl = await flowOf(ev('tpl'), [
      { id: 'send', type: 'send_email', config: { templateId, subject: 'Z166 F šablona' } },
    ]);
    flows.fHtml = await flowOf(ev('html'), [
      {
        id: 'send',
        type: 'send_email',
        config: { subject: 'Z166 F inline', html: html('inline') },
      },
    ]);
    flows.fPersonal = await flowOf(ev('personal'), [
      {
        id: 'send',
        type: 'send_personal_email',
        config: { fromEmail: `rep@${sendingDomain}`, subject: 'Z166 F osobní', body: 'Osobní.' },
      },
    ]);
    flows.fReview = await flowOf(ev('review'), [
      { id: 'send', type: 'send_review_request', config: { subject: 'Z166 F recenze' } },
    ]);
    flows.fSms = await flowOf(ev('sms'), [
      { id: 'send', type: 'send_sms', config: { message: 'Akce {{first_name}}' } },
    ]);
    flows.fWa = await flowOf(ev('wa'), [
      { id: 'send', type: 'send_whatsapp', config: { templateId: 'z166_flow' } },
    ]);
    flows.fPush = await flowOf(ev('push'), [
      { id: 'send', type: 'send_push', config: { title: 'Ahoj {{first_name}}', body: 'Flow' } },
    ]);
    // T: ticketing.order_paid is on the closed list; the nodes say 'transactional'.
    flows.tTpl = await flowOf('ticketing.order_paid', [
      {
        id: 'send',
        type: 'send_email',
        config: { templateId, subject: 'Z166 T šablona', priority: 'transactional' },
      },
    ]);
    flows.tHtml = await flowOf('ticketing.order_paid', [
      {
        id: 'send',
        type: 'send_email',
        config: { subject: 'Z166 T inline', html: html('vstupenka'), priority: 'transactional' },
      },
    ]);
    flows.tSms = await flowOf('ticketing.order_paid', [
      {
        id: 'send',
        type: 'send_sms',
        config: { message: 'Vstupenka {{first_name}}', priority: 'transactional' },
      },
    ]);
    // R: one run, a marketing node, then a transactional one.
    flows.rMixed = await flowOf('ticketing.order_paid', [
      { id: 'm', type: 'send_email', config: { subject: 'Z166 R marketing', html: html('akce') } },
      {
        id: 't',
        type: 'send_email',
        config: { subject: 'Z166 R vstupenka', html: html('vstupenka'), priority: 'transactional' },
      },
    ]);

    const seq = await call('POST', '/api/v1/crm/sequences', {
      name: `z166 ${tag}`,
      steps: [
        {
          id: 's1',
          type: 'email',
          order: 0,
          delayDays: 0,
          config: { subject: 'Z166 K sekvence', body: 'Sekvence.' },
        },
      ],
    });
    expect(seq.status, seq.text).toBeLessThan(300);
    sequenceId = (JSON.parse(seq.text) as { data: { id: string } }).data.id;

    workers.push(
      startWorkflowEmailWorker(),
      startWorkflowSmsWorker(),
      startWhatsappSenderWorker(),
      startPushSenderWorker(),
    );
    console.log(`[z166] seed org before: ${JSON.stringify(orgBefore)}`);
  }, 180_000);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    for (const w of workers) await w.close();
    const mine = `%-${tag}@test.local`;
    const orders = `z166-${tag}-%`;
    const found = await sql<{ id: string }[]>`
      SELECT id FROM contacts
      WHERE org_id = ${seed.id} AND (id = ANY(${contactIds}) OR email LIKE ${mine})
    `;
    const ids = [...new Set([...contactIds, ...found.map((p) => p.id)])];

    // Runs and jobs of this file, before anything is deleted (R and the report).
    const runRows = workflowIds.length
      ? await sql<{ status: string; n: number }[]>`
          SELECT status, count(*)::int AS n FROM workflow_runs
          WHERE workflow_id = ANY(${workflowIds}) GROUP BY status ORDER BY status
        `
      : [];
    const jobs: Record<string, Record<string, number>> = {};
    for (const [name, q] of Object.entries(qs)) {
      jobs[name] = {};
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        if (!j || !ids.includes(j.data?.contactId)) continue;
        const st = await j.getState();
        jobs[name]![st] = (jobs[name]![st] ?? 0) + 1;
        await j.remove().catch(() => {});
      }
      await q.close();
    }
    report.runs = Object.fromEntries(runRows.map((r) => [r.status, r.n]));
    report.jobs = jobs;

    for (const q of [batchSenderQueues.triggered, batchSenderQueue]) {
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        const d = j?.data as BatchSenderJobData | undefined;
        if (d?.contactIds?.some((id) => ids.includes(id))) await j.remove().catch(() => {});
      }
    }
    for (const j of await campaignSplitterQueue.getJobs(ALL, 0, 10_000)) {
      if (j && campaignIds.includes((j.data as CampaignSplitterJobData)?.campaignId))
        await j.remove().catch(() => {});
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
    if (sequenceId) {
      await sql`DELETE FROM sequence_enrollments WHERE sequence_id = ${sequenceId}`;
      await sql`DELETE FROM sales_sequences WHERE id = ${sequenceId}`;
    }
    if (campaignIds.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${campaignIds})`;
      await sql`DELETE FROM push_send_log WHERE campaign_id = ANY(${campaignIds})`;
      await sql`DELETE FROM audit_logs WHERE resource_id = ANY(${campaignIds.map(String)})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${campaignIds})`;
    }
    await sql`DELETE FROM email_events WHERE org_id = ${seed.id} AND lower(recipient) LIKE ${mine}`;
    await sql`DELETE FROM revenue_events WHERE org_id = ${seed.id} AND order_id LIKE ${orders}`;
    await sql`DELETE FROM back_in_stock_subscriptions WHERE org_id = ${seed.id} AND sku = ANY(${[FORM_SKU, BIS_SKU]})`;
    if (ids.length) {
      await sql`DELETE FROM back_in_stock_subscriptions WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM review_requests WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM workflow_runs WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM sms_send_log WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM push_send_log WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM push_subscriptions WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_tags WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM revenue_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_engagement WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    await sql`DELETE FROM products WHERE org_id = ${seed.id} AND sku = ANY(${[FORM_SKU, BIS_SKU]})`;
    if (connectionId) await sql`DELETE FROM ecommerce_connections WHERE id = ${connectionId}`;
    const tpl = await sql<{ id: string }[]>`SELECT id FROM templates WHERE org_id = ${seed.id}`;
    const madeHere = tpl.map((t) => t.id).filter((id) => !templatesBefore.has(id));
    if (madeHere.length) await sql`DELETE FROM templates WHERE id = ANY(${madeHere})`;
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND lower(email) LIKE ${mine}`;
    await sql`DELETE FROM sms_consents WHERE org_id = ${seed.id} AND consent_context = ${`z166-${tag}`}`;
    await sql`DELETE FROM sms_routes WHERE org_id = ${seed.id} AND provider = ${sinkProvider}`;
    if (vapidId) await sql`DELETE FROM vapid_keys WHERE id = ${vapidId}`;
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
    const orgAfter = await orgState();
    report.seedOrg = { before: orgBefore, after: orgAfter };
    console.log(`Z166_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    // The seed org exactly as this file found it — a snapshot, not zeros: every
    // suppression (the fingerprint rows included), counters, contacts, flows,
    // runs, templates, campaigns, keys.
    expect(orgAfter).toEqual(orgBefore);
  }, 300_000);

  // ── F: marketing nodes of a flow ──────────────────────────────────────────

  it.each([
    ['F template', 'fTpl', 'tpl'],
    ['F inline', 'fHtml', 'html'],
    ['F personal', 'fPersonal', 'personal'],
    ['F review', 'fReview', 'review'],
  ] as const)(
    '%s — reaches active only; non_subscribed is skipped',
    async (label, key, ev) => {
      const cells = await walk({
        label,
        workflowId: flows[key]!,
        people: await people(`z166${ev}`),
        fire: byEvent(`z166-${ev}-${tag}`),
        node: 'send',
      });
      got[label] = cells;
      expect(reachedByState(cells), JSON.stringify(cells)).toEqual(F_REACHES);
      for (const c of Object.values(cells)) expect(c.run, JSON.stringify(c)).toBe('completed');
    },
    600_000,
  );

  it.each([
    ['F sms', 'fSms', 'sms', 'sms'],
    ['F whatsapp', 'fWa', 'wa', 'wa'],
    ['F push', 'fPush', 'push', 'push'],
  ] as const)(
    '%s — reaches active only; non_subscribed is skipped',
    async (label, key, ev, ch) => {
      const cells = await walk({
        label,
        workflowId: flows[key]!,
        people: await people(`z166${ev}`),
        fire: byEvent(`z166-${ev}-${tag}`),
        node: 'send',
        channel: ch,
      });
      got[label] = cells;
      expect(reachedByState(cells), JSON.stringify(cells)).toEqual(F_REACHES);
      const ns = cellOf(cells, 'non_subscribed');
      if (ch === 'sms') expect(ns.job).toContain('"code":"MARKETING_REFUSED"');
      else expect(ns.job).toContain('skipped_refused');
    },
    600_000,
  );

  it('F back-in-stock-cs — the restock form, then a restock: active only', async () => {
    const list = await people('z166bis');
    const cells = await walk({
      label: 'F back-in-stock-cs',
      workflowId: flows.bis!,
      people: list,
      fire: async (p) =>
        call(
          'POST',
          '/api/v1/back-in-stock/subscribe',
          { email: p.email, sku: BIS_SKU },
          await publishable(),
        ),
      afterFire: async () => {
        const r = await call('POST', '/api/v1/back-in-stock/notify', { sku: BIS_SKU });
        return `${r.status} ${r.text}`;
      },
      node: 'e1',
    });
    got.bis = cells;
    expect(reachedByState(cells), JSON.stringify(cells)).toEqual(F_REACHES);
  }, 600_000);

  it('F abandoned-cart-cs — the checkout script makes the shopper: active only', async () => {
    const list = await people('z166ac', 'checkout');
    const cells = await walk({
      label: 'F abandoned-cart-cs',
      workflowId: flows.ac!,
      people: list,
      fire: async (p) =>
        call(
          'POST',
          '/api/v1/checkout-started',
          {
            email: p.email,
            cartId: `z166-cart-${randomUUID()}`,
            amount: 499,
            currency: 'CZK',
            itemCount: 2,
            recoveryUrl: 'https://z166.example.com/cart',
          },
          await publishable(),
        ),
      wait: 'w0',
      node: 'e1',
    });
    got.ac = cells;
    expect(cellOf(cells, 'non_subscribed').made).toContain('status non_subscribed');
    expect(reachedByState(cells), JSON.stringify(cells)).toEqual(F_REACHES);
  }, 600_000);

  it('F cross-sell-cs — the order webhook makes the buyer: active only', async () => {
    const list = await people('z166xs', 'order');
    const cells = await walk({
      label: 'F cross-sell-cs',
      workflowId: flows.xs!,
      people: list,
      fire: byOrder,
      wait: 'w1',
      node: 'e1',
    });
    got.xs = cells;
    expect(cellOf(cells, 'non_subscribed').made).toContain('status non_subscribed');
    expect(reachedByState(cells), JSON.stringify(cells)).toEqual(F_REACHES);
  }, 600_000);

  // ── T: the transactional exception, unchanged ─────────────────────────────

  it.each([
    ['T ticketing template', 'tTpl', 'email'],
    ['T ticketing inline', 'tHtml', 'email'],
    ['T ticketing sms', 'tSms', 'sms'],
  ] as const)(
    '%s — reaches everyone here, non_subscribed included',
    async (label, key, ch) => {
      const cells = await walk({
        label,
        workflowId: flows[key]!,
        people: await people(`z166${key.toLowerCase()}`),
        fire: byEvent('ticketing.order_paid', { eventTitle: 'Hamlet' }),
        node: 'send',
        channel: ch,
      });
      got[label] = cells;
      expect(reachedByState(cells), JSON.stringify(cells)).toEqual(T_REACHES);
      if (key === 'tTpl')
        expect(cellOf(cells, 'non_subscribed').mta).toBe('sent/triggered/flow_transactional');
    },
    600_000,
  );

  it('T payment-pending-cs e1 (secret key) — reaches everyone here', async () => {
    const cells = await walk({
      label: 'T payment-pending-cs',
      workflowId: flows.pp!,
      people: await people('z166pp'),
      fire: byEvent('payment_pending', { order: { number: '2026-166' } }),
      node: 'e1',
    });
    got.pp = cells;
    expect(reachedByState(cells), JSON.stringify(cells)).toEqual(T_REACHES);
    expect(cellOf(cells, 'non_subscribed').mta).toBe('sent/triggered/flow_transactional');
  }, 600_000);

  it('T transactional-order-confirmation e1 (webhook) — reaches everyone here', async () => {
    const cells = await walk({
      label: 'T transactional-order-confirmation',
      workflowId: flows.toc!,
      people: await people('z166toc', 'order'),
      fire: byOrder,
      node: 'e1',
    });
    got.toc = cells;
    expect(cellOf(cells, 'non_subscribed').made).toContain('status non_subscribed');
    expect(reachedByState(cells), JSON.stringify(cells)).toEqual(T_REACHES);
    expect(cellOf(cells, 'non_subscribed').mta).toBe('sent/triggered/flow_transactional');
  }, 600_000);

  // ── R: one run, the marketing node skipped, the transactional one sent ───

  it('R — a skipped marketing node neither fails the run nor stops its transactional node', async () => {
    await onlyActive(flows.rMixed!);
    const list = [await person('active', 'z166r'), await person('non_subscribed', 'z166r')];
    for (const p of list) {
      const r = await byEvent('ticketing.order_paid', { eventTitle: 'Hamlet' })(p);
      expect(r.status, r.text).toBeLessThan(300);
    }
    const out: Record<string, unknown> = {};
    for (const p of list) {
      const m = await settledOn(qs.email, p.id!, flows.rMixed!, 'm');
      const t = await settledOn(qs.email, p.id!, flows.rMixed!, 't');
      const before = handedTo(p.email).length;
      const mta = await deliver(p.email);
      const subjects = handedTo(p.email)
        .slice(before)
        .map((x) => x.subject)
        .sort();
      const [run] = await sql<{ status: string; current_node_id: string | null }[]>`
        SELECT status, current_node_id FROM workflow_runs
        WHERE workflow_id = ${flows.rMixed!} AND contact_id = ${p.id}
      `;
      out[p.state] = { m, t, mta, subjects, run };
      console.log(`[z166] R ${p.key}: ${JSON.stringify(out[p.state])}`);
    }
    report.R = out;
    const a = out.active as { subjects: string[]; run: { status: string } };
    const n = out.non_subscribed as { m: string; subjects: string[]; run: { status: string } };
    expect(a.subjects).toEqual(['Z166 R marketing', 'Z166 R vstupenka']);
    expect(n.subjects).toEqual(['Z166 R vstupenka']);
    expect(n.m).toContain('contact status non_subscribed');
    expect(a.run.status).toBe('completed');
    expect(n.run.status).toBe('completed');
  }, 600_000);

  // ── B: twenty at once ─────────────────────────────────────────────────────

  it('B — twenty at once on the template flow: the engine gets the ten active', async () => {
    const list: Person[] = [];
    for (let i = 0; i < 10; i++) {
      list.push(await person('active', 'z166b'), await person('non_subscribed', 'z166b'));
    }
    const cells = await walk({
      label: 'B burst',
      workflowId: flows.fTpl!,
      people: list,
      fire: byEvent(`z166-tpl-${tag}`),
      node: 'send',
    });
    const reached = Object.entries(cells).filter(([, c]) => c.reached);
    report.burst = {
      engine: reached.length,
      reachedStates: [...new Set(reached.map(([k]) => k.split('#')[0]))],
      runs: [...new Set(Object.values(cells).map((c) => c.run))],
    };
    expect(reached.length).toBe(10);
    expect(reached.every(([k]) => k.startsWith('active#'))).toBe(true);
    expect(Object.values(cells).every((c) => c.run === 'completed')).toBe(true);
  }, 900_000);

  // ── K: no flow — the same on master and the branch ───────────────────────

  it('K e-mail campaign — its audience reaches active only (unchanged)', async () => {
    const r = await emailCampaign('K email', await people('z166kc'));
    report['K email campaign'] = r;
    expect(r).toEqual(F_REACHES);
  }, 600_000);

  it('K push campaign — queued for active only (unchanged)', async () => {
    const list = await people('z166kp');
    const [l] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`z166 push ${tag}`}) RETURNING id
    `;
    listIds.push(l!.id);
    for (const p of list) {
      await sql`INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${p.id}, ${l!.id}, now())`;
    }
    const created = await call('POST', '/api/v1/campaigns', {
      name: `z166 push ${tag}`,
      type: 'push',
      listId: l!.id,
      subject: 'z166 push',
      fromName: 'Obchod',
      fromEmail,
      content: { title: 'Kampaň', body: 'Push' },
    });
    const id = (JSON.parse(created.text) as { data: { id: string } }).data.id;
    campaignIds.push(id);
    const send = await call('POST', `/api/v1/campaigns/${id}/send`, {
      acknowledgeDeliverabilityRisk: true,
    });
    expect(send.status, send.text).toBe(200);
    const out = {} as Record<State, boolean>;
    const jobOf = {} as Record<State, string>;
    for (const p of list) {
      // The contact's web push job once settled, or none within five seconds.
      jobOf[p.state] = 'no job';
      for (const deadline = Date.now() + 60_000; Date.now() < deadline; ) {
        const jobs = (await qs.push.getJobs(ALL, 0, 5_000)).filter(
          (j) => j?.data?.contactId === p.id,
        );
        const states = await Promise.all(jobs.map((j) => j.getState()));
        if (jobs.length && states.every((x) => x === 'completed' || x === 'failed')) {
          jobOf[p.state] = `${states.join(',')} ${JSON.stringify(jobs.map((j) => j.returnvalue))}`;
          break;
        }
        if (!jobs.length && Date.now() > deadline - 55_000) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      out[p.state] = hits.web.some((u) => u.endsWith(p.id!));
    }
    const [row] = await sql<
      { total_sent: number }[]
    >`SELECT total_sent FROM campaigns WHERE id = ${id}`;
    report['K push campaign'] = { reached: out, jobs: jobOf, totalSent: row!.total_sent };
    expect(row!.total_sent).toBe(1);
    expect(out).toEqual(F_REACHES);
  }, 600_000);

  it('K POST /emails — transactional mail, not a flow (unchanged)', async () => {
    const list = await people('z166ke');
    const out = {} as Record<State, string>;
    for (const p of list) {
      const subject = `Z166 K emails ${p.key}`;
      const r = await call('POST', '/api/v1/emails', {
        from: fromEmail,
        to: p.email,
        subject,
        html: '<p>Faktura</p>',
      });
      const before = handedTo(p.email).length;
      const mta = await deliver(p.email);
      const reached = handedTo(p.email).slice(before).length > 0;
      out[p.state] = `${r.status} mta=${mta} ${reached ? 'ANO' : 'NE'}`;
      console.log(`[z166] K emails ${p.key}: ${out[p.state]}`);
    }
    report['K emails'] = out;
    expect(out.active).toContain('ANO');
    expect(out.non_subscribed).toContain('ANO');
  }, 600_000);

  it('K sequence step — inline without a flow run (unchanged)', async () => {
    const list = await people('z166ks');
    const out = {} as Record<State, string>;
    for (const p of list) {
      const enr = await call('POST', `/api/v1/crm/sequences/${sequenceId}/enroll`, {
        contactId: p.id,
      });
      const processed = await processDueSequenceSteps({ limit: 50 });
      let job = 'no job';
      for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
        const jobs = (await qs.email.getJobs(ALL, 0, 5_000)).filter(
          (j) => j?.data?.contactId === p.id,
        );
        const states = await Promise.all(jobs.map((j) => j.getState()));
        if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
          job = `${states.join(',')} ${JSON.stringify(jobs.map((j) => j.returnvalue))}`;
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      const before = handedTo(p.email).length;
      const mta = await deliver(p.email);
      const reached = handedTo(p.email).slice(before).length > 0;
      out[p.state] =
        `enroll ${enr.status} processed ${processed.processed} job=${job} mta=${mta} ${reached ? 'ANO' : 'NE'}`;
      console.log(`[z166] K sequence ${p.key}: ${out[p.state]}`);
    }
    report['K sequence'] = out;
    expect(out.active).toContain(' ANO');
    expect(out.non_subscribed).toContain(' ANO');
    expect(out.unsubscribed).toContain(' NE');
    expect(out.pending).toContain(' NE');
  }, 600_000);
});
