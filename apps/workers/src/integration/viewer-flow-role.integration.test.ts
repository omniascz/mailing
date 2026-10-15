/**
 * A viewer may not create, change or start a flow — what it did, end to end (Z164).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * The standing decision: owner, admin and editor may send; a viewer may not;
 * an API key acts with its creator's role. Z163 MIMO 1 measured a viewer's
 * key re-marking the cross-sell node of a purchase_event flow as
 * transactional through PUT /api/v1/workflows/:id (200), and the cross-sell
 * then reaching an unsubscribed buyer. Z164 put the routes that create,
 * change, activate or start a flow behind requireRole('editor'). The role
 * matrix route by route is the API suite's viewer-flow-role file; this one
 * walks what the viewer's call led to.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 *   V1  viewer PUT priority 'transactional' on e1 of a cross-sell-cs fork →
 *       an unsubscribed buyer's order;
 *   V2  viewer POST /workflows (purchase_event, a 'transactional' e-mail
 *       node) and activate → an unsubscribed buyer's order;
 *   V3  viewer POST /workflows/:id/trigger on an active flow → an active
 *       contact;
 *   controls, the same before and after Z164: an editor's PUT of V1 (an
 *   editor may still set the priority — Michal decides that, not Z164); the
 *   informational e1 of a transactional-order-confirmation fork; a flow on
 *   ticketing.order_paid fired with a secret key.
 *
 * Keys are made the way a member comes to hold one: since Z130 only an admin
 * mints a key, so each user mints it as an admin through POST
 * /api/v1/api-keys (a real login, then the route) and is then made a viewer or
 * an editor; the key acts with the lower role from then on
 * (api/services/auth/api-key-role.ts). No route changes a member's role in
 * their own organisation, so that step is a row update, as every role user of
 * the integration suites is made.
 *
 * The chain: the generic e-shop webhook (x-webhook-secret) → ingestOrder →
 * onOrderPlaced → the executor → the email queue → the real workflow-email
 * worker in this process → the real API route → the real processBatchSender →
 * the real mta-sender. The gRPC client of the engine is the only stub; it
 * keeps what it was handed. A wait is shortened by moving its run's
 * next_execution_at to now and calling POST /api/v1/internal/workflow/
 * process-runs (what the scheduler calls).
 *
 * Everything measured is printed once as `Z164_CELLS_JSON {…}`.
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
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `vfr-${tag}.test`;
const WEBHOOK_SECRET = `vfr-secret-${tag}`;
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

type State = 'active' | 'unsubscribed';

let seed: SeedOrg;
let token: string;
let viewerKey: string;
let editorKey: string;
let startedAt: Date;
let connectionId: string;
let countersBefore: { period_start: Date; sends: number }[] = [];
let orgBefore: Record<string, unknown> = {};
let templatesBefore = new Set<string>();
let othersDeactivated: string[] = [];
const workers: Worker[] = [];
const emailQ = new Queue('email', { connection });
const contactIds: string[] = [];
const workflowIds: string[] = [];
const apiKeyNames: string[] = [];
const createdUsers: string[] = [];
const flows = {} as Record<'toc' | 'xs' | 'xsEditor' | 'tk', string>;
let tocE1: { templateId: string; subject: string };
/** Everything measured, printed once as Z164_CELLS_JSON. */
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

/**
 * A key held by a member of the seed org with `role`: minted by the member as
 * an admin through the API, then the member made `role` before the key is
 * first used (the key's role is read on lookup and cached for 60 s).
 */
async function memberKey(role: 'viewer' | 'editor'): Promise<string> {
  const [owner] = await sql<{ password_hash: string }[]>`
    SELECT password_hash FROM users WHERE email = ${SEED_LOGIN.email} LIMIT 1
  `;
  const email = `vfr-${role}-${tag}@test.local`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (org_id, email, name, password_hash, role, email_verified)
    VALUES (${seed.id}, ${email}, ${`vfr ${role}`}, ${owner!.password_hash}, 'admin', true)
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
  const name = `vfr ${role} key ${tag}`;
  const minted = await call('POST', '/api/v1/api-keys', { name }, session.token!);
  expect(minted.status, minted.text).toBe(201);
  apiKeyNames.push(name);
  await call('POST', '/api/v1/auth/logout', {}, session.token!);
  await sql`UPDATE users SET role = ${role} WHERE id = ${u!.id}`;
  return (JSON.parse(minted.text) as { data: { rawKey: string } }).data.rawKey;
}

interface Person {
  state: State;
  id: string | null;
  email: string;
  made: string;
}
let serial = 0;
let orderSerial = 0;

async function person(state: State, prefix = 'vfr'): Promise<Person> {
  const email = `${prefix}-${state}-${++serial}-${tag}@test.local`;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${state}) RETURNING id
  `;
  contactIds.push(c!.id);
  let made = `INSERT status ${state}`;
  if (state === 'unsubscribed') {
    const r = await call('POST', '/api/v1/suppressions', { email, reason: 'unsubscribe' });
    expect(r.status, r.text).toBe(201);
    made += ` + POST /suppressions unsubscribe ${r.status}`;
  }
  return { state, id: c!.id, email, made };
}

/** The shop's order webhook for `email` (generic receiver, Magento shape), unpaid. */
async function order(email: string) {
  const orderId = `vfr-${tag}-${++orderSerial}`;
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
interface Wf {
  id: string;
  nodes: WfNode[];
  edges: { id: string; source: string; target: string }[];
}

/** Fork a template the way the gallery does (the owner's key); the flow is a draft. */
async function fork(slug: string, label: string) {
  const r = await call('POST', `/api/v1/workflow-templates/${slug}/fork`, {
    name: `vfr ${label} ${tag}`,
  });
  expect(r.status, r.text).toBe(201);
  const wf = (JSON.parse(r.text) as { data: Wf }).data;
  workflowIds.push(wf.id);
  return wf;
}

/** None of this file's flows answers an order or an event. */
async function noneActive() {
  if (workflowIds.length) {
    await sql`UPDATE workflows SET status = 'inactive' WHERE id = ANY(${workflowIds})`;
  }
}

/** Only this flow of the file answers an order or an event while the test runs. */
async function onlyActive(id: string) {
  await noneActive();
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
  fire: string;
  job: string;
  batch: string;
  mta: string;
  subject: string | null;
  reached: boolean;
  runs: string;
}

/** Wait until the contact's run has parked, shorten `waitNode`, resume. */
async function advance(workflowId: string, contactId: string, waitNode: string) {
  type RunRow = { status: string; current_node_id: string | null };
  let rows: RunRow[] = [];
  for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
    rows = await sql<RunRow[]>`
      SELECT status, current_node_id FROM workflow_runs
      WHERE workflow_id = ${workflowId} AND contact_id = ${contactId}
    `;
    if (rows.length && rows.every((r) => ['waiting', 'completed', 'failed'].includes(r.status)))
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const due = await sql`
    UPDATE workflow_runs SET next_execution_at = now()
    WHERE workflow_id = ${workflowId} AND contact_id = ${contactId}
      AND status = 'waiting' AND current_node_id = ${waitNode}
  `;
  const res = await fetch(`${API}/api/v1/internal/workflow/process-runs`, {
    method: 'POST',
    headers: INTERNAL,
    signal: AbortSignal.timeout(60_000),
  });
  return `${rows.map((r) => `${r.status}@${r.current_node_id}`).join(',')} shortened=${due.count} ${res.status}`;
}

/**
 * Fire for one person and follow `node` of `workflowId` (null: no flow was
 * made) through the email job, the batch-sender, the MTA job and the engine.
 */
async function walk(
  label: string,
  workflowId: string | null,
  p: Person,
  node: string,
  fire: (p: Person) => Promise<{ status: number; text: string }>,
  wait?: string,
): Promise<Cell> {
  const before = handedTo(p.email).length;
  const f = await fire(p);
  let advanced = '';
  if (workflowId && wait) advanced = ` ${wait}: ${await advance(workflowId, p.id!, wait)}`;
  let job = 'no flow';
  if (workflowId) job = await settledNode(p.id!, workflowId, node);
  else await new Promise((r) => setTimeout(r, 8_000));
  const batch = await runBatch(p.id!);
  const mta = await deliver(p.email);
  const got = handedTo(p.email).slice(before);
  const runs = await sql<{ status: string; workflow_id: string }[]>`
    SELECT status, workflow_id FROM workflow_runs WHERE contact_id = ${p.id}
  `;
  const cell: Cell = {
    made: p.made,
    fire: `${f.status} ${f.text.slice(0, 160)}${advanced}`,
    job,
    batch,
    mta,
    subject: got[0]?.subject ?? null,
    reached: got.length > 0,
    runs: runs.map((r) => r.status).join(',') || 'no run',
  };
  console.log(
    `[vfr] ${label} ${p.state}: fire=${f.status} job=${job} batch=${batch} mta=${mta} engine=${cell.reached ? 'ANO' : 'NE'} runs=${cell.runs}`,
  );
  return cell;
}

const byOrder = (p: Person) => order(p.email);

async function nodesOf(id: string): Promise<string> {
  const [w] = await sql<{ n: string }[]>`SELECT nodes::text AS n FROM workflows WHERE id = ${id}`;
  return w?.n ?? 'no row';
}

async function orgState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT o.plan,
           (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM plan_send_counters WHERE org_id = o.id) AS counter_rows,
           (SELECT COALESCE(sum(sends), 0)::int FROM plan_send_counters WHERE org_id = o.id) AS counter_sends,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id) AS workflows,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id AND status = 'active') AS active_workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = o.id) AS workflow_runs,
           (SELECT count(*)::int FROM templates WHERE org_id = o.id) AS templates,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys,
           (SELECT count(*)::int FROM revenue_events WHERE org_id = o.id) AS revenue_events,
           (SELECT count(*)::int FROM ecommerce_connections WHERE org_id = o.id) AS ecommerce_connections
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

const workflowCount = async () =>
  (
    await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM workflows WHERE org_id = ${seed.id}`
  )[0]!.n;

describe('a viewer may not create, change or start a flow — end to end (Z164)', () => {
  beforeAll(async () => {
    startedAt = new Date();
    seed = await readSeedOrg(sql);
    orgBefore = await orgState();
    token = await seedApiKey(sql, `vfr-owner-${tag}`);
    apiKeyNames.push(`integration vfr-owner-${tag}`);
    await sql`UPDATE api_keys SET role = 'owner' WHERE key_hash = ${createHash('sha256').update(token).digest('hex')}`;
    countersBefore = await sql`
      SELECT period_start, sends FROM plan_send_counters WHERE org_id = ${seed.id}
    `;
    const tpl = await sql<{ id: string }[]>`SELECT id FROM templates WHERE org_id = ${seed.id}`;
    templatesBefore = new Set(tpl.map((t) => t.id));
    // Anything of the seed org that an order or ticketing.order_paid would
    // start besides this file's own flows is set inactive for the file and
    // put back after it.
    const others = await sql<{ id: string }[]>`
      SELECT id FROM workflows
      WHERE org_id = ${seed.id} AND status = 'active' AND deleted_at IS NULL
        AND (trigger_type = 'purchase_event'
             OR (trigger_type = 'api_event'
                 AND (trigger_config->>'eventName' IS NULL
                      OR trigger_config->>'eventName' IN ('order_placed', 'ticketing.order_paid'))))
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
      name: `vfr magento ${tag}`,
      baseUrl: 'https://vfr.example.com',
      accessToken: 'vfr-token',
      webhookSecret: WEBHOOK_SECRET,
    });
    expect(conn.status, conn.text).toBeLessThan(300);
    connectionId = (JSON.parse(conn.text) as { data: { id: string } }).data.id;

    viewerKey = await memberKey('viewer');
    editorKey = await memberKey('editor');
    const roles = await sql<{ name: string; role: string }[]>`
      SELECT name, role FROM api_keys WHERE name = ANY(${apiKeyNames})
    `;
    report.keys = roles.map((r) => `${r.name.replace(tag, '<tag>')}: stored ${r.role}`);

    const toc = await fork('transactional-order-confirmation', 'toc');
    flows.toc = toc.id;
    const e1 = toc.nodes.find((n) => n.id === 'e1')!;
    tocE1 = { templateId: String(e1.config.templateId), subject: String(e1.config.subject) };
    flows.xs = (await fork('cross-sell-cs', 'xs viewer')).id;
    flows.xsEditor = (await fork('cross-sell-cs', 'xs editor')).id;

    const tkNodes = [
      { id: 'trigger', type: 'trigger', config: {} },
      {
        id: 'send',
        type: 'send_email',
        config: { templateId: tocE1.templateId, subject: 'Objednávka', priority: 'transactional' },
      },
    ];
    const [tk] = await sql<{ id: string }[]>`
      INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
      VALUES (${seed.id}, ${`vfr tk ${tag}`}, 'inactive', 'api_event',
              ${JSON.stringify({ eventName: 'ticketing.order_paid' })}::jsonb,
              ${JSON.stringify(tkNodes)}::jsonb,
              ${JSON.stringify([{ id: 'e1', source: 'trigger', target: 'send' }])}::jsonb)
      RETURNING id
    `;
    workflowIds.push(tk!.id);
    flows.tk = tk!.id;

    workers.push(startWorkflowEmailWorker());
    console.log(`[vfr] seed org before: ${JSON.stringify(orgBefore)}`);
  }, 180_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    const mine = `%-${tag}@test.local`;
    const orders = `vfr-${tag}-%`;
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
    // Flows a viewer or the walks made (V2 on master) are named by this file too.
    const named = await sql<{ id: string }[]>`
      SELECT id FROM workflows WHERE org_id = ${seed.id} AND name LIKE ${`%vfr%${tag}%`}
    `;
    const wf = [...new Set([...workflowIds, ...named.map((w) => w.id)])];
    if (wf.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${wf})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${wf})`;
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
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${seed.id} AND created_at >= ${startedAt}`;
    await sql`DELETE FROM api_keys WHERE name = ANY(${apiKeyNames})`;
    if (createdUsers.length) {
      await sql`DELETE FROM api_keys WHERE user_id = ANY(${createdUsers})`;
      await sql`DELETE FROM users WHERE id = ANY(${createdUsers})`;
    }
    await sql`DELETE FROM plan_send_counters WHERE org_id = ${seed.id}`;
    for (const c of countersBefore) {
      await sql`
        INSERT INTO plan_send_counters (org_id, period_start, sends)
        VALUES (${seed.id}, ${c.period_start}, ${c.sends})
      `;
    }
    const orgAfter = await orgState();
    report.seedOrg = { before: orgBefore, after: orgAfter };
    console.log(`Z164_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    // The seed org exactly as this file found it, every suppression included.
    expect(orgAfter).toEqual(orgBefore);
  }, 300_000);

  // ── The viewer ─────────────────────────────────────────────────────────────

  it('V1 — viewer PUT priority transactional on the cross-sell: 403, nothing stored, not sent', async () => {
    const wf = (await call('GET', `/api/v1/workflows/${flows.xs}`)).text;
    const nodes = (JSON.parse(wf) as { data: Wf }).data.nodes.map((n) =>
      n.id === 'e1' ? { ...n, config: { ...n.config, priority: 'transactional' } } : n,
    );
    const before = await nodesOf(flows.xs);
    const put = await call('PUT', `/api/v1/workflows/${flows.xs}`, { nodes }, viewerKey);
    const after = await nodesOf(flows.xs);
    await onlyActive(flows.xs);
    const p = await person('unsubscribed', 'vfrv1');
    const cell = await walk('V1', flows.xs, p, 'e1', byOrder, 'w1');
    report.V1 = {
      put: { status: put.status, body: put.text.slice(0, 300) },
      nodesUnchanged: before === after,
      cell,
    };
    expect(put.status, put.text).toBe(403);
    expect(after, 'the refused PUT stored nothing').toBe(before);
    expect(cell.reached, JSON.stringify(cell)).toBe(false);
  }, 600_000);

  it('V2 — viewer POST /workflows with a transactional node on purchase_event: 403, no flow, not sent', async () => {
    const before = await workflowCount();
    await noneActive();
    const created = await call(
      'POST',
      '/api/v1/workflows',
      {
        name: `vfr v2 by viewer ${tag}`,
        triggerType: 'purchase_event',
        nodes: [
          { id: 't', type: 'trigger', config: {} },
          { id: 'e1', type: 'send_email', config: { ...tocE1, priority: 'transactional' } },
        ],
        edges: [{ id: 'x', source: 't', target: 'e1' }],
      },
      viewerKey,
    );
    let id: string | null = null;
    let activate: { status: number; text: string } | null = null;
    if (created.status < 300) {
      id = (JSON.parse(created.text) as { data: { id: string } }).data.id;
      workflowIds.push(id);
      activate = await call('POST', `/api/v1/workflows/${id}/activate`, undefined, viewerKey);
    }
    const after = await workflowCount();
    const p = await person('unsubscribed', 'vfrv2');
    const cell = await walk('V2', id, p, 'e1', byOrder);
    report.V2 = {
      post: { status: created.status, body: created.text.slice(0, 300) },
      activate: activate && { status: activate.status, body: activate.text.slice(0, 200) },
      workflows: `${before} → ${after}`,
      cell,
    };
    expect(created.status, created.text).toBe(403);
    expect(after, 'no flow was made').toBe(before);
    expect(cell.reached, JSON.stringify(cell)).toBe(false);
    expect(cell.runs).toBe('no run');
  }, 600_000);

  it('V3 — viewer POST /workflows/:id/trigger on an active flow: 403, no run, not sent', async () => {
    const made = await call('POST', '/api/v1/workflows', {
      name: `vfr v3 ${tag}`,
      triggerType: 'manual',
      nodes: [
        { id: 't', type: 'trigger', config: {} },
        { id: 'e1', type: 'send_email', config: { ...tocE1 } },
      ],
      edges: [{ id: 'x', source: 't', target: 'e1' }],
    });
    expect(made.status, made.text).toBe(200);
    const id = (JSON.parse(made.text) as { data: { id: string } }).data.id;
    workflowIds.push(id);
    await noneActive();
    const act = await call('POST', `/api/v1/workflows/${id}/activate`);
    expect(act.status, act.text).toBe(200);
    const p = await person('active', 'vfrv3');
    const fire = (q: Person) =>
      call('POST', `/api/v1/workflows/${id}/trigger`, { contactId: q.id }, viewerKey);
    const cell = await walk('V3', id, p, 'e1', fire);
    report.V3 = cell;
    expect(cell.fire.startsWith('403 '), cell.fire).toBe(true);
    expect(cell.runs).toBe('no run');
    expect(cell.reached, JSON.stringify(cell)).toBe(false);
  }, 600_000);

  // ── Controls: the same before and after Z164 ──────────────────────────────

  it('control — an editor still sets the priority (Michal decides that): 200, and it reaches', async () => {
    const wf = (await call('GET', `/api/v1/workflows/${flows.xsEditor}`)).text;
    const nodes = (JSON.parse(wf) as { data: Wf }).data.nodes.map((n) =>
      n.id === 'e1' ? { ...n, config: { ...n.config, priority: 'transactional' } } : n,
    );
    const put = await call('PUT', `/api/v1/workflows/${flows.xsEditor}`, { nodes }, editorKey);
    const stored = JSON.parse(await nodesOf(flows.xsEditor)) as WfNode[];
    await onlyActive(flows.xsEditor);
    const p = await person('unsubscribed', 'vfred');
    const cell = await walk('editor', flows.xsEditor, p, 'e1', byOrder, 'w1');
    report.editor = {
      put: put.status,
      storedPriority: stored.find((n) => n.id === 'e1')?.config.priority ?? null,
      cell,
    };
    expect(put.status, put.text).toBe(200);
    expect(cell.reached, JSON.stringify(cell)).toBe(true);
    expect(cell.mta).toBe('sent/triggered/flow_transactional');
  }, 600_000);

  it('control — the informational e1 of a transactional-order-confirmation fork reaches unsubscribed', async () => {
    await onlyActive(flows.toc);
    const p = await person('unsubscribed', 'vfrtoc');
    const cell = await walk('TOC', flows.toc, p, 'e1', byOrder);
    report.TOC = cell;
    expect(cell.reached, JSON.stringify(cell)).toBe(true);
    expect(cell.mta).toBe('sent/triggered/flow_transactional');
  }, 600_000);

  it('control — ticketing.order_paid with a secret key reaches unsubscribed', async () => {
    await onlyActive(flows.tk);
    const p = await person('unsubscribed', 'vfrtk');
    const fire = (q: Person) =>
      call('POST', '/api/v1/events', {
        contactId: q.id,
        eventName: 'ticketing.order_paid',
        properties: { eventTitle: 'Hamlet' },
      });
    const cell = await walk('TK', flows.tk, p, 'send', fire);
    report.TK = cell;
    expect(cell.reached, JSON.stringify(cell)).toBe(true);
    expect(cell.mta).toBe('sent/triggered/flow_transactional');
  }, 600_000);
});
