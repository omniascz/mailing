/**
 * The welcome flow (`list_subscribe`) starts only for a new membership of the
 * list, walked to the engine (Z175, položka 6). The rows and the runs alone are
 * pinned in apps/api/src/integration/list-subscribe-new-membership.
 *
 * ─── What was wrong (measured on master 1802269, Z174 P2) ────────────────────
 *
 * addContactToList inserted the row with ON CONFLICT DO NOTHING and then fired
 * onListSubscribe whatever the insert did. A member the recipient had taken
 * off the list (contact_lists.unsubscribed_at set) whom an operator added again
 * by POST /lists/:id/contacts got 204, the row stayed unsubscribed, and the
 * welcome flow ran and its marketing e-mail reached the engine. After Z174 a
 * DELETE no longer removes such a row, so this was the one known way left to
 * mail a list's welcome to someone who left that list.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * Real HTTP to the running API (127.0.0.1): an organisation of this file
 * (INSERT: the sign-up route makes a new user, not a second org of the seed
 * owner), the owner session from POST /me/orgs/switch, a secret key from POST
 * /api/v1/api-keys; the verified sending domain is INSERTed (DNS cannot be
 * verified in CI). Contacts, lists, members, flows, campaigns, the double
 * opt-in and the Resend-compatible audience through their routes; the
 * recipient's own unsubscribe from a list through the preference centre. The
 * whole path: POST /lists/:id/contacts → onListSubscribe → executor → e-mail
 * queue → the workflow-email worker in this process → batch-sender →
 * mta-sender, and campaign → splitter → batch-sender → mta-sender. The gRPC
 * client of the engine is the only stub: "engine" below means it was handed
 * the message.
 *
 * Every member is put on the list before the flow is activated, so the runs
 * counted are those of the re-add alone:
 *   U  a member unsubscribed from the list, added again → no welcome;
 *   R  the same member through POST /audiences/:id/contacts (Resend-compatible);
 *   A  a member already on the list, added again → no second welcome;
 *   N  a new member → the welcome, as before;
 *   P  a plain member removed (DELETE, the row goes) and added again → the
 *      welcome, as before;
 *   C  a campaign to the list, a transactional flow and the double opt-in → as
 *      before.
 *
 * Everything measured is printed as `Z175_FLOW_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createTrackingToken } from '@forgemsg/shared';
import { redis } from '@forgemsg/shared/redis';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import { startWorkflowEmailWorker } from '../jobs/workflow-email-sender.js';
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

const engine = vi.hoisted(() => ({
  handed: [] as { to: string; subject: string; html: string }[],
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string; htmlBody: string }) => {
    engine.handed.push({ to: msg.toEmail.toLowerCase(), subject: msg.subject, html: msg.htmlBody });
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
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
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

interface Org {
  id: string;
  owner: string;
  key: string;
  domain: string;
}

let seed: SeedOrg;
let seedKey = '';
let seedBefore: Record<string, unknown> = {};
let org: Org;
const report: Record<string, unknown> = {
  tag,
  mock: 'the gRPC client of the engine only; real API over HTTP, queues, splitter, batch-sender, workflow-email worker, mta-sender',
};
const cells: Record<string, unknown> = {};
const rateLimitWaits: string[] = [];
const workers: Worker[] = [];
const emailQ = new Queue('email', { connection });
const tplIds: string[] = [];

const addr = (name: string) => `z175-${name}-${tag}@test.local`.toLowerCase();
let serial = 0;
const phone = () =>
  `+4207${String(10_000_000 + ++serial * 7919 + Math.floor(Math.random() * 1000))}`;

interface Res {
  status: number;
  text: string;
}

async function call(
  method: string,
  path: string,
  credential: string | null,
  body?: unknown,
): Promise<Res> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(credential ? authHeaders(credential) : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (res.status === 429 && attempt < 20) {
      const wait = Number(res.headers.get('retry-after') ?? '5');
      rateLimitWaits.push(`${method} ${path.split('/').slice(0, 4).join('/')} ${wait}s`);
      await new Promise((r) => setTimeout(r, (Math.max(1, wait) + 1) * 1000));
      continue;
    }
    return { status: res.status, text };
  }
}

interface Created {
  data: { id: string; key?: string; rawKey?: string; apiKey?: string; token?: string };
}

async function api(cred: string, method: string, path: string, body?: unknown): Promise<Created> {
  const r = await call(method, path, cred, body);
  if (r.status >= 300)
    throw new Error(`[z175] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return (r.text ? JSON.parse(r.text) : { data: { id: '' } }) as Created;
}

const short = (r: Res) => `${r.status} ${r.text.replace(/[0-9a-f-]{36}/g, '<uuid>').slice(0, 160)}`;

/** The confirmation link in the double opt-in e-mail the engine was last handed for `to`. */
function confirmPathFor(to: string): string | null {
  const mail = engine.handed
    .filter(
      (m) =>
        m.to.toLowerCase() === to.toLowerCase() && /^Confirm your subscription to /.test(m.subject),
    )
    .at(-1);
  return /href="[^"]*?(\/api\/v1\/confirm\/[0-9a-f-]{36})"/.exec(mail?.html ?? '')?.[1] ?? null;
}

async function makeOrg(): Promise<Org> {
  const domain = `z175-${tag}.test`;
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`z175 ${tag}`}, ${`z175-${tag}`}, 'production', 'Obchod z175 s.r.o.',
            'Nádražní 1, 110 00 Praha')
    RETURNING id
  `;
  await sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    SELECT ${o!.id}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
  `;
  const r = await call('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: o!.id });
  expect(r.status, r.text).toBe(200);
  const owner = (JSON.parse(r.text) as { data: { token: string } }).data.token;
  await sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${o!.id}, ${domain}, 'fm1', true, true, true, true)
  `;
  const k = await api(owner, 'POST', '/api/v1/api-keys', { name: `z175 ${tag}` });
  const key = (k.data.key ?? k.data.rawKey ?? k.data.apiKey) as string;
  return { id: o!.id, owner, key, domain };
}

interface C {
  id: string;
  email: string;
}

async function contact(name: string): Promise<C> {
  const email = addr(name);
  const b = await api(org.key, 'POST', '/api/v1/contacts', {
    email,
    phone: phone(),
    firstName: 'Petra',
  });
  return { id: b.data.id, email };
}

async function newList(name: string): Promise<string> {
  return (await api(org.key, 'POST', '/api/v1/lists', { name: `z175 ${name} ${tag}` })).data.id;
}

const onList = (listId: string, contactId: string) =>
  call('POST', `/api/v1/lists/${listId}/contacts`, org.key, { contactId });

/** The recipient's own preference centre (per-list unsubscribe). */
function prefCentre(contactId: string, body: Record<string, unknown>) {
  const t = createTrackingToken({
    type: 'pref',
    orgId: org.id,
    contactId,
    ts: Math.floor(Date.now() / 1000),
  });
  return call('POST', `/p/center/${t}`, null, body);
}

async function membership(contactId: string, listId: string) {
  const [r] = await sql<{ unsub: boolean }[]>`
    SELECT unsubscribed_at IS NOT NULL AS unsub
    FROM contact_lists WHERE contact_id = ${contactId} AND list_id = ${listId}
  `;
  return r ? (r.unsub ? 'unsubscribed_at SET' : 'unsubscribed_at NULL') : 'no row';
}

const job = <T>(data: T): Job<T> =>
  ({
    id: `z175-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  }) as unknown as Job<T>;

async function idsOn(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs(ALL, 0, 10_000);
  return new Set(jobs.map((j) => String(j?.id)));
}
async function addedTo<T>(queue: Queue, before: Set<string>): Promise<T[]> {
  const jobs = await queue.getJobs(ALL, 0, 10_000);
  return jobs.filter((j) => j && !before.has(String(j.id))).map((j) => j.data as T);
}

/** Every queued MTA job of this file through the real processor; returns "to status/stream/purpose". */
async function deliverMine(): Promise<string[]> {
  const out: string[] = [];
  const jobs = ((await mtaQueues.other.getJobs(OPEN, 0, 10_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase().includes(`-${tag}@`),
  );
  for (const j of jobs) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      out.push(
        `${j.data.toEmail.replace(`-${tag}@test.local`, '')} ${r.status}/${j.data.stream}/${j.data.purpose ?? '-'}`,
      );
    } catch (err) {
      out.push(`${j.data.toEmail} threw ${(err as Error).message.slice(0, 80)}`);
    }
    await j.remove().catch(() => {});
  }
  return out;
}

const blocks = [
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
];
const globalStyles = {
  backgroundColor: '#fff',
  contentBackgroundColor: '#fff',
  fontFamily: 'Arial',
  linkColor: '#00f',
  textColor: '#000',
  contentWidth: 600,
};

interface Campaign {
  send: number | string;
  split: number;
  reached: string[];
  errors: string[];
}

/** A campaign to `listId`, all the way to the engine; returns the addresses it reached. */
async function campaignTo(listId: string): Promise<Campaign> {
  const subject = `Novinky ${randomUUID().slice(0, 8)}`;
  const created = await api(org.owner, 'POST', '/api/v1/campaigns', {
    name: `z175 ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail: `noreply@${org.domain}`,
    listId,
    content: { subject, blocks, globalStyles },
  });
  const campaignId = created.data.id;
  const beforeSplit = await idsOn(campaignSplitterQueue);
  const send = await call('POST', `/api/v1/campaigns/${campaignId}/send`, org.owner);
  const [split] = (
    await addedTo<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)
  ).filter((d) => d.campaignId === campaignId);
  if (!split) return { send: short(send), split: 0, reached: [], errors: [] };
  const errors: string[] = [];
  const beforeBatch = await idsOn(batchSenderQueue);
  await processCampaignSplitter(job(split)).catch((e) =>
    errors.push(`splitter: ${(e as Error).message.slice(0, 200)}`),
  );
  const batches = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
    (d) => d.campaignId === campaignId,
  );
  for (const b of batches)
    await processBatchSender(job(b)).catch((e) =>
      errors.push(`batch: ${(e as Error).message.slice(0, 200)}`),
    );
  engine.handed.length = 0;
  await deliverMine();
  const reached = engine.handed
    .filter((m) => m.subject === subject)
    .map((m) => m.to)
    .sort();
  return {
    send: send.status,
    split: batches.reduce((a, b) => a + (b.contactIds?.length ?? 0), 0),
    reached,
    errors,
  };
}

/** Run the triggered batch-sender jobs for these contacts: "sent=… skipped=…/ft|fm|-". */
async function runTriggered(contactIds: string[]): Promise<string[]> {
  const jobs = (await batchSenderQueues.triggered.getJobs(
    ALL,
    0,
    10_000,
  )) as Job<BatchSenderJobData>[];
  const out: string[] = [];
  for (const j of jobs.filter((x) => x?.data?.contactIds?.some((id) => contactIds.includes(id)))) {
    const r = (await processBatchSender({
      data: j.data,
      log: async () => {},
    } as unknown as Job<BatchSenderJobData>)) as {
      sent: number;
      skipped: number;
    };
    out.push(
      `sent=${r.sent} skipped=${r.skipped}/${j.data.flowTransactional ? 'ft' : j.data.flowMarketing ? 'fm' : '-'}`,
    );
    await j.remove().catch(() => {});
  }
  return out;
}

/** Wait for the e-mail queue jobs of these contacts to settle. */
async function settleEmail(contactIds: string[]): Promise<string[]> {
  const appear = Date.now() + 6_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const jobs = (await emailQ.getJobs(ALL, 0, 10_000)).filter((j) =>
      contactIds.includes(j?.data?.contactId),
    );
    if (!jobs.length && Date.now() > appear) return ['no email job'];
    const states = await Promise.all(jobs.map((j) => j.getState()));
    if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
      const out: string[] = [];
      for (const j of jobs) {
        const f = (await emailQ.getJob(j.id!)) ?? j;
        out.push(
          `${await f.getState()} ${JSON.stringify(f.returnvalue ?? f.failedReason ?? null).slice(0, 120)}`,
        );
        await f.remove().catch(() => {});
      }
      return out;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return ['did not settle'];
}

async function runsOf(workflowId: string, contactId: string): Promise<string[]> {
  const r = await sql<{ status: string }[]>`
    SELECT status::text AS status FROM workflow_runs
    WHERE workflow_id = ${workflowId} AND contact_id = ${contactId}
    ORDER BY created_at
  `;
  return r.map((x) => x.status);
}

/**
 * The runs of `workflowId` for `contactId` once the trigger (fired after the
 * route answered) has had its chance: wait up to 8 s for a run beyond
 * `before`, then for every run to settle.
 */
async function settledRuns(workflowId: string, contactId: string, before: number) {
  for (const deadline = Date.now() + 8_000; Date.now() < deadline; ) {
    if ((await runsOf(workflowId, contactId)).length > before) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
    const r = await runsOf(workflowId, contactId);
    if (r.every((s) => !['running', 'pending', 'waiting'].includes(s))) return r;
    await new Promise((res) => setTimeout(res, 300));
  }
  return runsOf(workflowId, contactId);
}

interface Walk {
  runs: string[];
  emailJob: string[];
  batch: string[];
  mta: string[];
  engine: boolean;
}

/** What the flow did for `c` after the step that may have triggered it, walked to the engine. */
async function walk(workflowId: string, c: C, before: number, subject: string): Promise<Walk> {
  const runs = await settledRuns(workflowId, c.id, before);
  const emailJob = await settleEmail([c.id]);
  const batch = await runTriggered([c.id]);
  engine.handed.length = 0;
  const mta = await deliverMine();
  return {
    runs: runs.slice(before),
    emailJob,
    batch,
    mta,
    engine: engine.handed.some((m) => m.subject.startsWith(subject) && m.to === c.email),
  };
}

async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id AND deleted_at IS NOT NULL) AS contacts_deleted,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN contacts c ON c.id = cl.contact_id WHERE c.org_id = o.id) AS memberships,
           (SELECT count(*)::int FROM contact_lists cl JOIN contacts c ON c.id = cl.contact_id WHERE c.org_id = o.id AND cl.unsubscribed_at IS NOT NULL) AS memberships_unsubscribed,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = o.id) AS workflow_runs,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

beforeAll(async () => {
  seed = await readSeedOrg(sql);
  seedBefore = await seedState();
  seedKey = await seedApiKey(sql, `z175-${tag}`);
  org = await makeOrg();
  workers.push(startWorkflowEmailWorker());
}, 180_000);

afterAll(async () => {
  for (const w of workers) await w.close().catch(() => {});
  await deliverMine().catch(() => {});
  const ids = org ? [org.id] : [];
  for (const j of await emailQ.getJobs(ALL, 0, 10_000)) {
    if (j && ids.includes(j.data?.orgId)) await j.remove().catch(() => {});
  }
  await emailQ.close();
  for (const q of [batchSenderQueues.triggered, batchSenderQueue]) {
    for (const j of await q.getJobs(ALL, 0, 10_000)) {
      if (j && ids.includes((j.data as BatchSenderJobData)?.orgId))
        await j.remove().catch(() => {});
    }
  }
  if (ids.length) {
    await sql`DELETE FROM workflow_runs WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM workflow_events WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM email_events WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM campaigns WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM consent_events WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM audit_logs WHERE org_id = ANY(${ids})`;
    await sql`DELETE FROM api_keys WHERE org_id = ANY(${ids})`;
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ANY(${ids})`;
  }
  if (tplIds.length) await sql`DELETE FROM templates WHERE id = ANY(${tplIds})`;
  // Rate-limit counters of this file's keys and session (api/plugins/rate-limit.ts).
  let limitKeysRemoved = 0;
  for (const raw of [seedKey, ...(org ? [org.key, org.owner] : [])]) {
    const d = createHash('sha256').update(raw).digest('hex').slice(0, 32);
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `*${d}*`, 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        await redis.del(key);
        limitKeysRemoved++;
      }
    } while (cursor !== '0');
  }
  await sql`DELETE FROM api_keys WHERE name = ${`integration z175-${tag}`}`;
  const [left] = await sql<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ANY(${ids})) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ANY(${ids})) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ANY(${ids})) AS suppressions,
           (SELECT count(*)::int FROM email_events WHERE org_id = ANY(${ids})) AS email_events,
           (SELECT count(*)::int FROM workflows WHERE org_id = ANY(${ids})) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = ANY(${ids})) AS workflow_runs,
           (SELECT count(*)::int FROM templates WHERE id = ANY(${tplIds})) AS templates
  `;
  const seedAfter = await seedState();
  report.cells = cells;
  report.rateLimitWaits = rateLimitWaits;
  report.leftover = { ...left, limitKeysRemoved };
  report.seedOrg = { before: seedBefore, after: seedAfter };
  const all = JSON.stringify(report);
  const parts = Math.ceil(all.length / 3000);
  for (let i = 0; i < parts; i++)
    console.log(
      `Z175_FLOW_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await sql.end();
  expect(left).toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    email_events: 0,
    workflows: 0,
    workflow_runs: 0,
    templates: 0,
  });
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 300_000);

describe('list_subscribe — the welcome flow on POST /lists/:id/contacts', () => {
  const WELCOME = `Vitejte ${tag}`;
  const got: Record<string, Record<string, unknown>> = {};
  let camp: Campaign;

  beforeAll(async () => {
    const L = await newList('L');
    const used = await api(org.owner, 'POST', '/api/v1/templates/cs-order-confirm/use', {
      name: `z175 welcome ${tag}`,
    });
    tplIds.push(used.data.id);
    // A marketing welcome: a send_email node with no priority.
    const wf = await api(org.owner, 'POST', '/api/v1/workflows', {
      name: `z175 welcome ${tag}`,
      triggerType: 'list_subscribe',
      triggerConfig: { listId: L },
      nodes: [
        { id: 'trigger', type: 'trigger', config: {} },
        {
          id: 'send',
          type: 'send_email',
          config: { templateId: used.data.id, subject: `${WELCOME} {{first_name}}` },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'send' }],
    });
    const F = wf.data.id;

    // Members made before the flow is active: no run of F exists for any of them.
    const people: Record<string, C> = {};
    for (const k of ['u', 'r', 'a', 'p', 'ctrl']) {
      people[k] = await contact(k);
      await onList(L, people[k]!.id);
    }
    // u and r took themselves off L in their own preference centre.
    for (const k of ['u', 'r'])
      got[k] = { centre: (await prefCentre(people[k]!.id, { unsubscribeFromLists: [L] })).status };
    for (const [k, c] of Object.entries(people))
      got[k] = { ...(got[k] ?? {}), rowBefore: await membership(c.id, L) };

    const act = await call('POST', `/api/v1/workflows/${F}/activate`, org.owner);

    // U: the member unsubscribed from L, added again.
    {
      const c = people.u!;
      const add = await onList(L, c.id);
      got.u = {
        ...got.u,
        add: short(add),
        rowAfter: await membership(c.id, L),
        ...(await walk(F, c, 0, WELCOME)),
      };
    }
    // R: the same through the Resend-compatible audience route.
    {
      const c = people.r!;
      const add = await call('POST', `/api/v1/audiences/${L}/contacts`, org.key, {
        email: c.email,
        first_name: 'Petra',
      });
      got.r = {
        ...got.r,
        add: short(add),
        rowAfter: await membership(c.id, L),
        ...(await walk(F, c, 0, WELCOME)),
      };
    }
    // A: a member already on L (row with no unsubscribe), added again.
    {
      const c = people.a!;
      const add = await onList(L, c.id);
      got.a = {
        ...got.a,
        add: short(add),
        rowAfter: await membership(c.id, L),
        ...(await walk(F, c, 0, WELCOME)),
      };
    }
    // A2: a member who joined while F was active (their welcome ran), added again.
    {
      const c = await contact('a2');
      people.a2 = c;
      const first = await onList(L, c.id);
      const w1 = await walk(F, c, 0, WELCOME);
      const again = await onList(L, c.id);
      const w2 = await walk(F, c, w1.runs.length, WELCOME);
      got.a2 = {
        firstAdd: first.status,
        first: w1,
        add: short(again),
        rowAfter: await membership(c.id, L),
        ...w2,
      };
    }
    // N: a new member.
    {
      const c = await contact('n');
      people.n = c;
      const add = await onList(L, c.id);
      got.n = {
        rowBefore: 'no row',
        add: short(add),
        rowAfter: await membership(c.id, L),
        ...(await walk(F, c, 0, WELCOME)),
      };
    }
    // N via the Resend-compatible route: a new contact made on the audience.
    {
      const email = addr('rn');
      const add = await call('POST', `/api/v1/audiences/${L}/contacts`, org.key, {
        email,
        first_name: 'Petra',
      });
      const id = (JSON.parse(add.text) as { id?: string }).id ?? '';
      const c = { id, email };
      people.rn = c;
      got.rn = {
        add: add.status,
        rowAfter: id ? await membership(id, L) : 'no contact',
        ...(id ? await walk(F, c, 0, WELCOME) : {}),
      };
    }
    // P: a plain member removed (the row goes) and added again.
    {
      const c = people.p!;
      const del = await call('DELETE', `/api/v1/lists/${L}/contacts/${c.id}`, org.key);
      const rowAfterDelete = await membership(c.id, L);
      const add = await onList(L, c.id);
      got.p = {
        ...got.p,
        delete: del.status,
        rowAfterDelete,
        add: short(add),
        rowAfter: await membership(c.id, L),
        ...(await walk(F, c, 0, WELCOME)),
      };
    }
    const deact = await call('POST', `/api/v1/workflows/${F}/deactivate`, org.owner);

    // C: a campaign to L.
    camp = await campaignTo(L);
    for (const [k, c] of Object.entries(people))
      got[k] = { ...(got[k] ?? {}), campaignL: camp.reached.includes(c.email) };

    // C: a transactional flow (ticketing.order_paid, priority 'transactional')
    // to the member unsubscribed from L.
    {
      const tx = await api(org.owner, 'POST', '/api/v1/templates/cs-order-confirm/use', {
        name: `z175 tx ${tag}`,
      });
      tplIds.push(tx.data.id);
      const t = await api(org.owner, 'POST', '/api/v1/workflows', {
        name: `z175 C tx ${tag}`,
        triggerType: 'api_event',
        triggerConfig: { eventName: 'ticketing.order_paid' },
        nodes: [
          { id: 'trigger', type: 'trigger', config: {} },
          {
            id: 'send',
            type: 'send_email',
            config: {
              templateId: tx.data.id,
              subject: `Objednavka ${tag} {{first_name}}`,
              priority: 'transactional',
            },
          },
        ],
        edges: [{ id: 'e1', source: 'trigger', target: 'send' }],
      });
      const ta = await call('POST', `/api/v1/workflows/${t.data.id}/activate`, org.owner);
      const c = people.u!;
      const ev = await call('POST', '/api/v1/events', org.key, {
        contactId: c.id,
        eventName: 'ticketing.order_paid',
        properties: { eventTitle: 'Hamlet' },
      });
      got.u = {
        ...got.u,
        transactional: {
          activate: ta.status,
          event: ev.status,
          ...(await walk(t.data.id, c, 0, `Objednavka ${tag}`)),
        },
      };
      await call('POST', `/api/v1/workflows/${t.data.id}/deactivate`, org.owner);
    }

    // C: the recipient's own double opt-in on L lifts their unsubscribe.
    {
      const c = people.u!;
      const s = await call('POST', `/api/v1/lists/${L}/subscribe`, null, { email: c.email });
      // The link out of the confirmation e-mail, and the button its page posts (Z176).
      await deliverMine();
      const link = confirmPathFor(c.email);
      const conf = link ? await call('POST', link, null) : null;
      got.u = {
        ...got.u,
        doi: {
          subscribe: s.status,
          confirm: conf?.status ?? 'no token',
          row: await membership(c.id, L),
        },
      };
      await deliverMine();
    }

    cells.L = {
      activate: act.status,
      deactivate: deact.status,
      got,
      campaignL: { ...camp, reached: camp.reached.length },
    };
  }, 900_000);

  it('U: a member unsubscribed from the list, added again — 204, the row stays, no welcome', () => {
    expect(got.u).toMatchObject({
      centre: 200,
      rowBefore: 'unsubscribed_at SET',
      add: '204 ',
      rowAfter: 'unsubscribed_at SET',
      runs: [],
      engine: false,
    });
  });

  it('R: the same member through POST /audiences/:id/contacts — no welcome', () => {
    expect(got.r).toMatchObject({
      rowBefore: 'unsubscribed_at SET',
      rowAfter: 'unsubscribed_at SET',
      runs: [],
      engine: false,
    });
  });

  it('A: a member already on the list, added again — no second welcome', () => {
    expect(got.a).toMatchObject({
      rowBefore: 'unsubscribed_at NULL',
      add: '204 ',
      rowAfter: 'unsubscribed_at NULL',
      runs: [],
      engine: false,
    });
    expect(got.a2).toMatchObject({
      firstAdd: 204,
      first: { runs: ['completed'], engine: true },
      add: '204 ',
      rowAfter: 'unsubscribed_at NULL',
      runs: [],
      engine: false,
    });
  });

  it('N: a new member gets the welcome — as before', () => {
    expect(got.n).toMatchObject({
      add: '204 ',
      rowAfter: 'unsubscribed_at NULL',
      runs: ['completed'],
      engine: true,
    });
    expect(got.rn).toMatchObject({
      add: 200,
      rowAfter: 'unsubscribed_at NULL',
      runs: ['completed'],
      engine: true,
    });
  });

  it('P: a plain member removed and added again gets the welcome — as before', () => {
    expect(got.p).toMatchObject({
      rowBefore: 'unsubscribed_at NULL',
      delete: 204,
      rowAfterDelete: 'no row',
      add: '204 ',
      rowAfter: 'unsubscribed_at NULL',
      runs: ['completed'],
      engine: true,
    });
  });

  it('C: a campaign to the list, transactional mail and the double opt-in — as before', () => {
    expect(got.ctrl).toMatchObject({ rowBefore: 'unsubscribed_at NULL', campaignL: true });
    expect(got.u).toMatchObject({
      campaignL: false,
      transactional: { event: 200, runs: ['completed'], engine: true },
      doi: { confirm: 200, row: 'unsubscribed_at NULL' },
    });
  });
});
