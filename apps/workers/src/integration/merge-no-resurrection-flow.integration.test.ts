/**
 * What a merge of contacts and a list removal send, walked to the engine
 * (Z174, položka 6). The rows and statuses themselves are pinned in
 * apps/api/src/integration/merge-no-resurrection.
 *
 * ─── What was wrong (measured on master 1802269, Z173) ───────────────────────
 *
 *  - An active winner of POST /identity-graph/merge or POST /duplicates/merge
 *    kept 'active' whatever the loser had refused, and lost the loser's
 *    unsubscribe from a list: the next campaign reached it on both lists.
 *  - The automatic merge (POST /identity-graph/ingest, POST /cdp/events
 *    identify) did the same; a merge that failed on the one-address index had
 *    already moved the loser's signals.
 *  - The holiday flow with a listId started for a member unsubscribed from that
 *    list and sent its marketing e-mail.
 *  - DELETE /lists/:id/contacts/:contactId and the flow's remove_from_list
 *    deleted the row that held the recipient's unsubscribe, so re-adding them
 *    (the route, move_to_list, a signup form) mailed them again.
 *  - duplicates/merge moved e-mail events across organisations;
 *    identity-graph/merge recorded a foreign id.
 *
 * ─── How it is measured ──────────────────────────────────────────────────────
 *
 * Real HTTP to the running API (127.0.0.1): two organisations of this file
 * (INSERT: the sign-up route makes a new user, not a second org of the seed
 * owner), the owner session of each from POST /me/orgs/switch, a secret key of
 * each from POST /api/v1/api-keys; the verified sending domain is INSERTed
 * (DNS cannot be verified in CI). Statuses, rows, archives, lists, members,
 * signals, merges, flows, forms, imports, the preference centre and the
 * double opt-in through their routes. The whole path: campaign → splitter →
 * batch-sender → mta-sender, and flow → executor → e-mail queue → the
 * workflow-email worker in this process → batch-sender / the inline dispatch →
 * mta-sender. The gRPC client of the engine is the only stub: "engine" below
 * means it was handed the message.
 *
 * Each describe does its walk in beforeAll and asserts in separate tests, so a
 * run on master names exactly the cells that changed:
 *   M    the winner took a stricter loser's status → no campaign;
 *   B    a bounce is not carried → the winner still gets the campaign;
 *   M0   a loser as strict or less → as before;
 *   LU   the loser's list unsubscribe → no campaign to that list;
 *   C    transactional mail to the merged winners and the control contacts → as before;
 *   A    automatic merges;
 *   L    list removal and re-adding;
 *   H    the holiday flow with a listId;
 *   O    merges across organisations.
 *
 * Everything measured is printed as `Z174_FLOW_CELLS_JSON …` chunks.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createTrackingToken } from '@forgemsg/shared';
import { redis } from '@forgemsg/shared/redis';
import { czechHolidaysInDays } from '@forgemsg/i18n-cs';
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
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };
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
const orgs: Org[] = [];
const report: Record<string, unknown> = {
  tag,
  mock: 'the gRPC client of the engine only; real API over HTTP, queues, splitter, batch-sender, workflow-email worker, mta-sender',
};
const cells: Record<string, unknown> = {};
const rateLimitWaits: string[] = [];
const workers: Worker[] = [];
const emailQ = new Queue('email', { connection });
const tplIds: string[] = [];

const addr = (name: string) => `z174-${name}-${tag}@test.local`.toLowerCase();
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
  extra: Record<string, string> = {},
): Promise<Res> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(credential ? authHeaders(credential) : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extra,
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
    throw new Error(`[z174] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return (r.text ? JSON.parse(r.text) : { data: { id: '' } }) as Created;
}

const short = (r: Res) => `${r.status} ${r.text.slice(0, 160)}`;

async function makeOrg(name: string): Promise<Org> {
  const domain = `z174-${name}-${tag}.test`;
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`z174 ${name} ${tag}`}, ${`z174-${name}-${tag}`}, 'production', 'Obchod z174 s.r.o.',
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
  const k = await api(owner, 'POST', '/api/v1/api-keys', { name: `z174 ${name} ${tag}` });
  const key = (k.data.key ?? k.data.rawKey ?? k.data.apiKey) as string;
  const out = { id: o!.id, owner, key, domain };
  orgs.push(out);
  return out;
}

type Kind =
  | 'active'
  | 'active_phone'
  | 'non_subscribed'
  | 'pending'
  | 'bounced'
  | 'unsub_norow'
  | 'unsub_row'
  | 'complained'
  | 'archived_unsub'
  | 'archived_bounced';

interface C {
  id: string;
  email: string | null;
  kind: Kind;
}

/** A contact of `o` in `kind`, by routes: POST /contacts {status}, POST /suppressions, POST archive. */
async function contact(o: Org, name: string, kind: Kind): Promise<C> {
  const email = kind === 'active_phone' ? null : addr(name);
  const status: Record<Kind, string | undefined> = {
    active: undefined,
    active_phone: undefined,
    non_subscribed: 'non_subscribed',
    pending: 'pending',
    bounced: 'bounced',
    unsub_norow: 'unsubscribed',
    unsub_row: 'unsubscribed',
    complained: 'complained',
    archived_unsub: 'unsubscribed',
    archived_bounced: 'bounced',
  };
  const b = await api(o.key, 'POST', '/api/v1/contacts', {
    ...(email ? { email } : {}),
    phone: phone(),
    firstName: 'Petra',
    ...(status[kind] ? { status: status[kind] } : {}),
  });
  const id = b.data.id;
  if (kind === 'unsub_row')
    await api(o.key, 'POST', '/api/v1/suppressions', { email, reason: 'unsubscribe' });
  if (kind === 'archived_unsub' || kind === 'archived_bounced')
    await api(o.key, 'POST', `/api/v1/contacts/${id}/archive`, {});
  return { id, email, kind };
}

async function newList(o: Org, name: string): Promise<string> {
  return (await api(o.key, 'POST', '/api/v1/lists', { name: `z174 ${name} ${tag}` })).data.id;
}

const onList = (o: Org, listId: string, contactId: string) =>
  call('POST', `/api/v1/lists/${listId}/contacts`, o.key, { contactId });

/** The recipient's own preference centre (per-list unsubscribe / resubscribe). */
function prefCentre(o: Org, contactId: string, body: Record<string, unknown>) {
  const t = createTrackingToken({
    type: 'pref',
    orgId: o.id,
    contactId,
    ts: Math.floor(Date.now() / 1000),
  });
  return call('POST', `/p/center/${t}`, null, body);
}

interface Row {
  status: string;
  archived_from: string | null;
  email: string | null;
  deleted: boolean;
}
async function row(id: string): Promise<Row | null> {
  const [r] = await sql<Row[]>`
    SELECT status::text AS status, archived_from::text AS archived_from, email,
           deleted_at IS NOT NULL AS deleted
    FROM contacts WHERE id = ${id}
  `;
  return r ?? null;
}

async function membership(contactId: string, listId: string) {
  const [r] = await sql<{ unsub: boolean }[]>`
    SELECT unsubscribed_at IS NOT NULL AS unsub
    FROM contact_lists WHERE contact_id = ${contactId} AND list_id = ${listId}
  `;
  return r ? (r.unsub ? 'unsubscribed_at SET' : 'unsubscribed_at NULL') : 'no row';
}

async function signalsOf(contactId: string): Promise<number> {
  const [r] = await sql<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM identity_signals WHERE contact_id = ${contactId}`;
  return r!.n;
}

const job = <T>(data: T): Job<T> =>
  ({
    id: `z174-${randomUUID()}`,
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
      out.push(`${j.data.toEmail} ${r.status}/${j.data.stream}/${j.data.purpose ?? '-'}`);
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

/** A campaign to `listId` of `o`, all the way to the engine; returns the addresses it reached. */
async function campaignTo(o: Org, listId: string): Promise<Campaign> {
  const subject = `Novinky ${randomUUID().slice(0, 8)}`;
  const created = await api(o.owner, 'POST', '/api/v1/campaigns', {
    name: `z174 ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail: `noreply@${o.domain}`,
    listId,
    content: { subject, blocks, globalStyles },
  });
  const campaignId = created.data.id;
  const beforeSplit = await idsOn(campaignSplitterQueue);
  const send = await call('POST', `/api/v1/campaigns/${campaignId}/send`, o.owner);
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

async function runsOf(workflowId: string) {
  return sql<{ contact_id: string; status: string }[]>`
    SELECT contact_id, status::text AS status FROM workflow_runs WHERE workflow_id = ${workflowId}
  `;
}

async function waitRuns(workflowId: string, n: number) {
  for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
    const r = await runsOf(workflowId);
    if (r.length >= n && r.every((x) => !['running', 'pending', 'waiting'].includes(x.status)))
      return r;
    await new Promise((res) => setTimeout(res, 300));
  }
  return runsOf(workflowId);
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
           (SELECT count(*)::int FROM identity_signals WHERE org_id = o.id) AS signals,
           (SELECT count(*)::int FROM identity_merges WHERE org_id = o.id) AS merges,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = o.id) AS workflow_runs,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

/** A transactional e-mail to `c` by POST /emails: did the engine get it? */
async function emailsTo(o: Org, c: C): Promise<{ answer: string; engine: boolean }> {
  const subject = `Faktura ${tag} ${c.id.slice(0, 8)}`;
  const e = await call('POST', '/api/v1/emails', o.key, {
    from: `noreply@${o.domain}`,
    to: c.email,
    subject,
    html: '<p>Faktura</p>',
  });
  engine.handed.length = 0;
  await deliverMine();
  return {
    answer: short(e),
    engine: engine.handed.some((m) => m.subject === subject && m.to === c.email),
  };
}

/** A flow event for `c`; the flow's e-mail walked to the engine. */
async function flowEventTo(o: Org, c: C, eventName: string, subjectPrefix: string) {
  const ev = await call('POST', '/api/v1/events', o.key, {
    contactId: c.id,
    eventName,
    properties: { eventTitle: 'Hamlet' },
  });
  const ej = await settleEmail([c.id]);
  const batch = await runTriggered([c.id]);
  engine.handed.length = 0;
  const mta = await deliverMine();
  return {
    event: ev.status,
    emailJob: ej,
    batch,
    mta,
    engine: engine.handed.some(
      (m) => m.subject.startsWith(`${subjectPrefix} ${tag}`) && m.to === c.email,
    ),
  };
}

const wantsCampaign = (camp: Campaign, c: C) =>
  c.email ? camp.reached.includes(c.email) : 'no address';

beforeAll(async () => {
  seed = await readSeedOrg(sql);
  seedBefore = await seedState();
  seedKey = await seedApiKey(sql, `z174-${tag}`);
  await makeOrg('a');
  await makeOrg('b');
  workers.push(startWorkflowEmailWorker());
}, 180_000);

afterAll(async () => {
  for (const w of workers) await w.close().catch(() => {});
  await deliverMine().catch(() => {});
  const ids = orgs.map((o) => o.id);
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
    // Everything else of the organisations goes with them (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ANY(${ids})`;
  }
  if (tplIds.length) await sql`DELETE FROM templates WHERE id = ANY(${tplIds})`;
  // Rate-limit counters of this file's keys and sessions (api/plugins/rate-limit.ts).
  let limitKeysRemoved = 0;
  for (const raw of [seedKey, ...orgs.flatMap((o) => [o.key, o.owner])]) {
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
  await sql`DELETE FROM api_keys WHERE name = ${`integration z174-${tag}`}`;
  const [left] = await sql<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM organizations WHERE id = ANY(${ids})) AS orgs,
           (SELECT count(*)::int FROM contacts WHERE org_id = ANY(${ids})) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ANY(${ids})) AS suppressions,
           (SELECT count(*)::int FROM email_events WHERE org_id = ANY(${ids})) AS email_events,
           (SELECT count(*)::int FROM identity_signals WHERE org_id = ANY(${ids})) AS signals,
           (SELECT count(*)::int FROM identity_merges WHERE org_id = ANY(${ids})) AS merges,
           (SELECT count(*)::int FROM workflows WHERE org_id = ANY(${ids})) AS workflows,
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
      `Z174_FLOW_CELLS_JSON ${String(i).padStart(4, '0')}/${parts} ${all.slice(i * 3000, (i + 1) * 3000)}`,
    );
  await sql.end();
  expect(left).toEqual({
    orgs: 0,
    contacts: 0,
    suppressions: 0,
    email_events: 0,
    signals: 0,
    merges: 0,
    workflows: 0,
    templates: 0,
  });
  expect(seedAfter, 'the seed organisation changed').toEqual(seedBefore);
}, 300_000);

// ── M / B / M0 / LU / C: manual merges, then campaigns and transactional mail ──
type Route = 'identity-graph' | 'duplicates';
/** Losers stricter than an active winner (M), a bounce (B) and equals (M0). */
const M_LOSERS: Kind[] = ['non_subscribed', 'pending', 'unsub_row', 'complained', 'archived_unsub'];
const B_LOSERS: Kind[] = ['bounced', 'archived_bounced'];
const M0_LOSERS: Kind[] = ['active'];

interface Pair {
  loser: Kind;
  winner: C;
  los: C;
  merge: string;
  winnerAfter: Row | null;
  winnerLU: string;
  LC?: boolean | string;
  LU?: boolean | string;
}

for (const route of ['identity-graph', 'duplicates'] as Route[]) {
  describe(`${route}/merge — the winner's campaigns`, () => {
    const pairs: Pair[] = [];
    let cLC: Campaign;
    let cLU: Campaign;

    beforeAll(async () => {
      const o = orgs[0]!;
      const LC = await newList(o, `${route} LC`);
      const LU = await newList(o, `${route} LU`);
      for (const l of [...M_LOSERS, ...B_LOSERS, ...M0_LOSERS]) {
        const s = `${route === 'identity-graph' ? 'ig' : 'dp'}-${l.replace(/_/g, '')}`;
        const winner = await contact(o, `${s}-w`, 'active');
        const los = await contact(o, `${s}-l`, l);
        await onList(o, LC, winner.id);
        await onList(o, LU, winner.id);
        await onList(o, LU, los.id);
        // The loser's own unsubscribe from LU, by the preference centre.
        await prefCentre(o, los.id, { unsubscribeFromLists: [LU] });
        const m =
          route === 'identity-graph'
            ? await call('POST', '/api/v1/identity-graph/merge', o.owner, {
                winnerContactId: winner.id,
                loserContactId: los.id,
              })
            : await call('POST', '/api/v1/duplicates/merge', o.owner, {
                primaryId: winner.id,
                duplicateIds: [los.id],
              });
        pairs.push({
          loser: l,
          winner,
          los,
          merge: short(m),
          winnerAfter: await row(winner.id),
          winnerLU: await membership(winner.id, LU),
        });
      }
      cLC = await campaignTo(o, LC);
      cLU = await campaignTo(o, LU);
      for (const p of pairs) {
        p.LC = wantsCampaign(cLC, p.winner);
        p.LU = wantsCampaign(cLU, p.winner);
      }
      cells[`MERGE ${route}`] = {
        pairs: pairs.map((p) => ({
          loser: p.loser,
          merge: p.merge,
          winnerAfter: p.winnerAfter,
          winnerLU: p.winnerLU,
          LC: p.LC,
          LU: p.LU,
        })),
        campaignLC: { ...cLC, reached: cLC.reached.length },
        campaignLU: { ...cLU, reached: cLU.reached.length },
      };
    }, 1_200_000);

    const of = (k: Kind) => pairs.find((p) => p.loser === k)!;

    it(`M ${route}: a winner merged with a stricter loser takes its status and gets no campaign`, () => {
      const expected: Record<string, string> = {
        non_subscribed: 'non_subscribed',
        pending: 'pending',
        unsub_row: 'unsubscribed',
        complained: 'complained',
        archived_unsub: 'unsubscribed',
      };
      for (const l of M_LOSERS) {
        expect(of(l).merge, l).toMatch(/^200 /);
        expect(of(l).winnerAfter?.status, l).toBe(expected[l]);
        expect(of(l).LC, `${l}: campaign LC`).toBe(false);
      }
    });

    it(`B ${route}: a bounced loser's bounce is not carried — the winner still gets the campaign`, () => {
      for (const l of B_LOSERS) {
        expect(of(l).merge, l).toMatch(/^200 /);
        expect(of(l).winnerAfter?.status, l).toBe('active');
        expect(of(l).LC, `${l}: campaign LC`).toBe(true);
      }
    });

    it(`M0 ${route}: a loser as strict as the winner — as before`, () => {
      for (const l of M0_LOSERS) {
        expect(of(l).winnerAfter?.status, l).toBe('active');
        expect(of(l).LC, `${l}: campaign LC`).toBe(true);
      }
    });

    it(`LU ${route}: the loser's unsubscribe from LU is the winner's — no campaign to LU`, () => {
      for (const p of pairs) {
        expect(p.winnerLU, p.loser).toBe('unsubscribed_at SET');
        expect(p.LU, `${p.loser}: campaign LU`).toBe(false);
      }
      expect(cLU.reached).toEqual([]);
    });

    if (route === 'identity-graph') {
      it('C identity-graph: transactional mail to the merged winners reaches them as before', async () => {
        const o = orgs[0]!;
        const used = await api(o.owner, 'POST', '/api/v1/templates/cs-order-confirm/use', {
          name: `z174 tx ${tag}`,
        });
        tplIds.push(used.data.id);
        const tpl = await api(o.owner, 'POST', '/api/v1/workflows', {
          name: `z174 C template ${tag}`,
          triggerType: 'api_event',
          triggerConfig: { eventName: 'ticketing.order_paid' },
          nodes: [
            { id: 'trigger', type: 'trigger', config: {} },
            {
              id: 'send',
              type: 'send_email',
              config: {
                templateId: used.data.id,
                subject: `Objednavka ${tag} {{first_name}}`,
                priority: 'transactional',
              },
            },
          ],
          edges: [{ id: 'e1', source: 'trigger', target: 'send' }],
        });
        const inline = await api(o.owner, 'POST', '/api/v1/workflows', {
          name: `z174 C inline ${tag}`,
          triggerType: 'api_event',
          triggerConfig: { eventName: 'ticketing.event_changed' },
          nodes: [
            { id: 'trigger', type: 'trigger', config: {} },
            {
              id: 'send',
              type: 'send_email',
              config: {
                subject: `Zmena ${tag} {{first_name}}`,
                html: '<p>Představení se mění, {{first_name}}.</p>',
                priority: 'transactional',
              },
            },
          ],
          edges: [{ id: 'e1', source: 'trigger', target: 'send' }],
        });
        for (const w of [tpl.data.id, inline.data.id])
          expect((await call('POST', `/api/v1/workflows/${w}/activate`, o.owner)).status).toBe(200);
        const out: Record<string, unknown> = {};
        for (const l of [
          'unsub_row',
          'complained',
          'pending',
          'non_subscribed',
          'bounced',
        ] as Kind[]) {
          const w = of(l).winner;
          const emails = await emailsTo(o, w);
          const template = await flowEventTo(o, w, 'ticketing.order_paid', 'Objednavka');
          const inl = await flowEventTo(o, w, 'ticketing.event_changed', 'Zmena');
          out[l] = { status: (await row(w.id))?.status, emails, template, inline: inl };
          expect(emails.engine, `${l}: POST /emails`).toBe(true);
          expect(template.engine, `${l}: transactional template node`).toBe(true);
          expect(inl.engine, `${l}: transactional inline node`).toBe(true);
        }
        for (const w of [tpl.data.id, inline.data.id])
          await call('POST', `/api/v1/workflows/${w}/deactivate`, o.owner);
        cells['C identity-graph transactional'] = out;
      }, 900_000);
    }
  });
}

// ── A: automatic merges through real routes ─────────────────────────────────
describe('automatic merge — identity-graph/ingest and cdp/events identify', () => {
  interface ACase {
    key: string;
    via: 'ingest' | 'cdp';
    w: Kind;
    l: Kind;
    wSig: string;
    lSig: string;
  }
  const cases: ACase[] = [
    { key: 'A1', via: 'ingest', w: 'active', l: 'unsub_norow', wSig: 'user_id', lSig: 'device_id' },
    {
      key: 'A2',
      via: 'ingest',
      w: 'active_phone',
      l: 'pending',
      wSig: 'user_id',
      lSig: 'device_id',
    },
    { key: 'A3', via: 'cdp', w: 'active', l: 'unsub_norow', wSig: 'user_id', lSig: 'device_id' },
    { key: 'A4', via: 'cdp', w: 'active_phone', l: 'pending', wSig: 'user_id', lSig: 'device_id' },
    { key: 'A5', via: 'ingest', w: 'active', l: 'unsub_norow', wSig: 'cookie', lSig: 'user_id' },
  ];
  interface AOut {
    a: C;
    b: C;
    merge: string;
    aAfter: Row | null;
    bAfter: Row | null;
    aSignals: number;
    bSignals: number;
    engine?: { a: boolean | string; b: boolean | string };
  }
  const out: Record<string, AOut> = {};

  beforeAll(async () => {
    const o = orgs[0]!;
    const LA = await newList(o, 'A');
    const camel: Record<string, string> = {
      user_id: 'userId',
      device_id: 'deviceId',
      cookie: 'cookie',
    };
    for (const c of cases) {
      const n = c.key.toLowerCase();
      const a = await contact(o, `a-${n}-a`, c.w);
      const b = await contact(o, `a-${n}-b`, c.l);
      if (a.email) await onList(o, LA, a.id);
      await onList(o, LA, b.id);
      const va = `${c.wSig}-${n}-${tag}`;
      const vb = `${c.lSig}-${n}-${tag}`;
      await call('POST', '/api/v1/identity-graph/ingest', o.owner, {
        contactId: a.id,
        signals: [{ type: c.wSig, value: va }],
      });
      await call('POST', '/api/v1/identity-graph/ingest', o.owner, {
        contactId: b.id,
        signals: [{ type: c.lSig, value: vb }],
      });
      const m =
        c.via === 'ingest'
          ? await call('POST', '/api/v1/identity-graph/ingest', o.owner, {
              signals: [
                { type: c.wSig, value: va },
                { type: c.lSig, value: vb },
              ],
            })
          : await call('POST', '/api/v1/cdp/events', o.owner, {
              type: 'identify',
              name: 'identify',
              [camel[c.wSig]!]: va,
              [camel[c.lSig]!]: vb,
            });
      out[c.key] = {
        a,
        b,
        merge: short(m),
        aAfter: await row(a.id),
        bAfter: await row(b.id),
        aSignals: await signalsOf(a.id),
        bSignals: await signalsOf(b.id),
      };
    }
    const camp = await campaignTo(o, LA);
    for (const v of Object.values(out))
      v.engine = { a: wantsCampaign(camp, v.a), b: wantsCampaign(camp, v.b) };
    cells.A = { cases: out, campaign: { ...camp, reached: camp.reached.length } };
  }, 900_000);

  it('A1 / A3: the winner of an automatic merge with an unsubscribed loser is unsubscribed — no campaign', () => {
    for (const k of ['A1', 'A3']) {
      expect(out[k]!.bAfter?.deleted, k).toBe(true);
      expect(out[k]!.aAfter?.status, k).toBe('unsubscribed');
      expect(out[k]!.engine, k).toEqual({ a: false, b: false });
    }
  });

  it('A2 / A4: a merge that fails on the one-address index writes nothing — the signals stay', () => {
    expect(out.A2!.merge).toMatch(/^409 /);
    for (const k of ['A2', 'A4']) {
      expect(out[k]!.bAfter, k).toMatchObject({ status: 'pending', deleted: false });
      expect(out[k]!.aAfter, k).toMatchObject({ status: 'active', email: null });
      expect([out[k]!.aSignals, out[k]!.bSignals], `${k}: signals of a, b`).toEqual([1, 1]);
    }
  });

  it('A5: the unsubscribed contact that won by its signals stays unsubscribed — as before', () => {
    expect(out.A5!.aAfter?.deleted).toBe(true);
    expect(out.A5!.bAfter?.status).toBe('unsubscribed');
    expect(out.A5!.engine).toEqual({ a: false, b: false });
  });
});

// ── L: list removal, re-adding, then campaigns to L1 and L2 ─────────────────
describe('list removal — a row with the recipient’s unsubscribe stays', () => {
  const people: Record<string, C> = {};
  const out: Record<string, Record<string, unknown>> = {};
  let c1: Campaign;
  let c2: Campaign;

  beforeAll(async () => {
    const o = orgs[0]!;
    const L1 = await newList(o, 'L1');
    const L2 = await newList(o, 'L2');
    const mk = async (name: string, unsub = true) => {
      const c = await contact(o, `l-${name}`, 'active');
      people[name] = c;
      await onList(o, L1, c.id);
      await onList(o, L2, c.id);
      if (unsub) await prefCentre(o, c.id, { unsubscribeFromLists: [L1] });
      return c;
    };
    const del = (id: string) => call('DELETE', `/api/v1/lists/${L1}/contacts/${id}`, o.key);

    {
      const c = await mk('a');
      const d = await del(c.id);
      const p = await onList(o, L1, c.id);
      out.a = { delete: d.status, add: p.status, row: await membership(c.id, L1) };
    }
    {
      const wf = await api(o.owner, 'POST', '/api/v1/workflows', {
        name: `z174 L b ${tag}`,
        triggerType: 'manual',
        nodes: [
          { id: 'trigger', type: 'trigger', config: {} },
          { id: 'rm', type: 'remove_from_list', config: { listId: L1 } },
          { id: 'add', type: 'move_to_list', config: { listId: L1 } },
        ],
        edges: [
          { id: 'e1', source: 'trigger', target: 'rm' },
          { id: 'e2', source: 'rm', target: 'add' },
        ],
      });
      const wf2 = await api(o.owner, 'POST', '/api/v1/workflows', {
        name: `z174 L b2 ${tag}`,
        triggerType: 'manual',
        nodes: [
          { id: 'trigger', type: 'trigger', config: {} },
          { id: 'rm', type: 'remove_from_list', config: { listId: L1 } },
        ],
        edges: [{ id: 'e1', source: 'trigger', target: 'rm' }],
      });
      for (const w of [wf.data.id, wf2.data.id])
        await call('POST', `/api/v1/workflows/${w}/activate`, o.owner);
      const b = await mk('b');
      const b2 = await mk('b2');
      const t1 = await call('POST', `/api/v1/workflows/${wf.data.id}/trigger`, o.owner, {
        contactId: b.id,
      });
      const t2 = await call('POST', `/api/v1/workflows/${wf2.data.id}/trigger`, o.owner, {
        contactId: b2.id,
      });
      const r1 = await waitRuns(wf.data.id, 1);
      const r2 = await waitRuns(wf2.data.id, 1);
      out.b = {
        trigger: t1.status,
        runs: r1.map((r) => r.status),
        row: await membership(b.id, L1),
      };
      out.b2 = {
        trigger: t2.status,
        runs: r2.map((r) => r.status),
        row: await membership(b2.id, L1),
      };
      for (const w of [wf.data.id, wf2.data.id])
        await call('POST', `/api/v1/workflows/${w}/deactivate`, o.owner);
    }
    {
      const c = await mk('c');
      const p = await onList(o, L1, c.id);
      out.c = { add: p.status, row: await membership(c.id, L1) };
    }
    {
      const c = await mk('d');
      const d = await del(c.id);
      const fd = new FormData();
      fd.append('file', new Blob([`email\n${c.email}\n`], { type: 'text/csv' }), `z174-${tag}.csv`);
      const up = await fetch(`${API}/api/v1/contacts/import/upload`, {
        method: 'POST',
        headers: authHeaders(o.key),
        body: fd,
      });
      const upText = await up.text();
      let imported = `upload ${up.status}`;
      if (up.status < 300) {
        const jobId = (JSON.parse(upText) as { data: { id: string } }).data.id;
        await call('POST', `/api/v1/contacts/import/${jobId}/mapping`, o.key, {
          mapping: { email: 'email' },
          defaultListId: L1,
        });
        await call('POST', `/api/v1/contacts/import/${jobId}/execute`, o.key, {});
        for (const deadline = Date.now() + 60_000; Date.now() < deadline; ) {
          const st = JSON.parse(
            (await call('GET', `/api/v1/contacts/import/${jobId}`, o.key)).text,
          ) as { data: { status: string } };
          imported = st.data.status;
          if (['completed', 'failed', 'done'].includes(imported)) break;
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      out.d = { delete: d.status, import: imported, row: await membership(c.id, L1) };
    }
    {
      const c = await mk('e');
      const d = await del(c.id);
      const s = await call('POST', `/api/v1/lists/${L1}/subscribe`, null, { email: c.email });
      const rowAfterSubscribe = await membership(c.id, L1);
      // The link out of the confirmation e-mail, and the button its page posts (Z176).
      await deliverMine();
      const link = confirmPathFor(c.email ?? '');
      const conf = link ? await call('POST', link, null) : null;
      out.e = {
        delete: d.status,
        subscribe: s.status,
        rowAfterSubscribe,
        confirm: conf?.status ?? 'no token',
        row: await membership(c.id, L1),
      };
      await deliverMine();
    }
    {
      const form = await api(o.owner, 'POST', '/api/v1/signup-forms', {
        name: `z174 ${tag}`,
        listId: L1,
        fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }],
      });
      const c = await mk('form');
      const d = await del(c.id);
      const f = await call('POST', `/public/forms/${form.data.id}/submit`, null, {
        email: c.email,
      });
      out.form = { delete: d.status, submit: f.status, row: await membership(c.id, L1) };
    }
    {
      const c = await mk('plain', false);
      const d = await del(c.id);
      out.plain = { delete: d.status, row: await membership(c.id, L1) };
    }
    await mk('ctrl', false);
    out.ctrl = { row: await membership(people.ctrl!.id, L1) };
    c1 = await campaignTo(o, L1);
    c2 = await campaignTo(o, L2);
    for (const [k, c] of Object.entries(people)) {
      out[k] = { ...(out[k] ?? {}), L1: wantsCampaign(c1, c), L2: wantsCampaign(c2, c) };
    }
    // kontrola C: the recipient's own resubscribe after a removal
    {
      const c = await mk('resub');
      const d = await del(c.id);
      const r = await prefCentre(o, c.id, { resubscribeToLists: [L1] });
      out.resub = { delete: d.status, centre: r.status, row: await membership(c.id, L1) };
    }
    cells.L = {
      cells: out,
      campaignL1: { ...c1, reached: c1.reached.length },
      campaignL2: { ...c2, reached: c2.reached.length },
    };
  }, 900_000);

  it('L: a removal keeps the unsubscribe — re-adding by the route, move_to_list, an import or a form sends nothing to L1', () => {
    expect(out.a).toMatchObject({
      delete: 204,
      add: 204,
      row: 'unsubscribed_at SET',
      L1: false,
      L2: true,
    });
    expect(out.b).toMatchObject({ row: 'unsubscribed_at SET', L1: false, L2: true });
    expect(out.b2).toMatchObject({ row: 'unsubscribed_at SET', L1: false, L2: true });
    expect(out.c).toMatchObject({ row: 'unsubscribed_at SET', L1: false, L2: true });
    expect(out.d).toMatchObject({ delete: 204, row: 'unsubscribed_at SET', L1: false, L2: true });
    expect(out.form).toMatchObject({
      delete: 204,
      submit: 200,
      row: 'unsubscribed_at SET',
      L1: false,
      L2: true,
    });
    expect(out.plain).toMatchObject({ delete: 204, row: 'no row', L1: false, L2: true });
  });

  it('C: the double opt-in, the control contact and the preference centre — as before', () => {
    // The recipient's own confirmation lifts their unsubscribe (consent).
    expect(out.e).toMatchObject({ confirm: 200, row: 'unsubscribed_at NULL', L1: true, L2: true });
    expect(out.ctrl).toMatchObject({ row: 'unsubscribed_at NULL', L1: true, L2: true });
    expect(out.resub).toMatchObject({ delete: 204, centre: 200, row: 'unsubscribed_at NULL' });
  });
});

// ── H: the holiday flow with a listId ───────────────────────────────────────
describe('holiday flow with listId — a member unsubscribed from the list', () => {
  const got: Record<string, Record<string, unknown>> = {};

  beforeAll(async () => {
    const o = orgs[0]!;
    const LH = await newList(o, 'H');
    const now = new Date();
    let daysAhead = -1;
    for (let d = 0; d <= 400; d++) {
      if (czechHolidaysInDays(now, d).length > 0) {
        daysAhead = d;
        break;
      }
    }
    const used = await api(o.owner, 'POST', '/api/v1/templates/cs-order-confirm/use', {
      name: `z174 h ${tag}`,
    });
    tplIds.push(used.data.id);
    const wf = await api(o.owner, 'POST', '/api/v1/workflows', {
      name: `z174 H ${tag}`,
      triggerType: 'n_days_before_holiday',
      triggerConfig: { locale: 'cs', daysAhead, listId: LH },
      nodes: [
        { id: 'trigger', type: 'trigger', config: {} },
        {
          id: 'send',
          type: 'send_email',
          config: { templateId: used.data.id, subject: `Svatek ${tag} {{first_name}}` },
        },
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'send' }],
    });
    const act = await call('POST', `/api/v1/workflows/${wf.data.id}/activate`, o.owner);
    const unsub = await contact(o, 'h-unsub', 'active');
    const ctrl = await contact(o, 'h-ctrl', 'active');
    const gone = await contact(o, 'h-deleted', 'active');
    for (const c of [unsub, ctrl, gone]) await onList(o, LH, c.id);
    await prefCentre(o, unsub.id, { unsubscribeFromLists: [LH] });
    await prefCentre(o, gone.id, { unsubscribeFromLists: [LH] });
    const d = await call('DELETE', `/api/v1/lists/${LH}/contacts/${gone.id}`, o.key);
    const run = await call('POST', '/api/v1/internal/triggers/daily-run', null, {}, INTERNAL);
    const runs = await waitRuns(wf.data.id, 1);
    const ids = [unsub.id, ctrl.id, gone.id];
    const emailJobs = await settleEmail(ids);
    const batch = await runTriggered(ids);
    engine.handed.length = 0;
    const mta = await deliverMine();
    const subj = engine.handed
      .filter((m) => m.subject.startsWith(`Svatek ${tag}`))
      .map((m) => m.to);
    for (const [k, c] of Object.entries({ unsub, ctrl, gone })) {
      got[k] = {
        row: await membership(c.id, LH),
        run: runs.find((r) => r.contact_id === c.id)?.status ?? 'no run',
        engine: subj.includes(c.email!),
      };
    }
    await call('POST', `/api/v1/workflows/${wf.data.id}/deactivate`, o.owner);
    cells.H = {
      daysAhead,
      activate: act.status,
      delete: d.status,
      dailyRun: short(run).slice(0, 120),
      emailJobs,
      batch,
      mta,
      got,
    };
  }, 600_000);

  it('H: the flow does not start for a member unsubscribed from the list, removed or not', () => {
    expect(got.unsub).toEqual({ row: 'unsubscribed_at SET', run: 'no run', engine: false });
    expect(got.gone).toEqual({ row: 'unsubscribed_at SET', run: 'no run', engine: false });
  });

  it('C: the control member gets the holiday flow as before', () => {
    expect(got.ctrl).toEqual({ row: 'unsubscribed_at NULL', run: 'completed', engine: true });
  });
});

// ── O: merges across organisations ──────────────────────────────────────────
describe('merges across organisations', () => {
  const out: Record<string, unknown> = {};
  type Snapshot = Record<string, unknown>;
  let before: Snapshot;
  const answers: Record<string, string> = {};
  const snapshots: Record<string, Snapshot> = {};

  beforeAll(async () => {
    const [a, b] = orgs as [Org, Org];
    const LA = await newList(a, 'O');
    const LB = await newList(b, 'O');
    const a1 = await contact(a, 'o-a1', 'active');
    const a2 = await contact(a, 'o-a2', 'active');
    const a3 = await contact(a, 'o-a3', 'active');
    const b1 = await contact(b, 'o-b1', 'active');
    const b2 = await contact(b, 'o-b2', 'active');
    const b3 = await contact(b, 'o-b3', 'unsub_norow');
    for (const c of [a1, a2, a3]) await onList(a, LA, c.id);
    for (const c of [b1, b2]) await onList(b, LB, c.id);
    await call('POST', '/api/v1/identity-graph/ingest', b.owner, {
      contactId: b3.id,
      signals: [{ type: 'device_id', value: `o-b3-${tag}` }],
    });
    // Real e-mail events on both sides: a campaign in each organisation.
    const ca = await campaignTo(a, LA);
    const cb = await campaignTo(b, LB);
    const name = (id: string | null) =>
      ({
        [a1.id]: 'a1',
        [a2.id]: 'a2',
        [a3.id]: 'a3',
        [b1.id]: 'b1',
        [b2.id]: 'b2',
        [b3.id]: 'b3',
      })[id ?? ''] ?? String(id);
    const snapshot = async (): Promise<Snapshot> => {
      const ev = await sql<{ org_id: string; contact_id: string | null; n: number }[]>`
        SELECT org_id, contact_id, count(*)::int AS n FROM email_events
        WHERE org_id IN (${a.id}, ${b.id}) GROUP BY org_id, contact_id ORDER BY org_id, contact_id
      `;
      const cs = await sql<{ id: string; status: string; deleted: boolean }[]>`
        SELECT id, status::text AS status, deleted_at IS NOT NULL AS deleted FROM contacts
        WHERE org_id IN (${a.id}, ${b.id}) AND id IN (${a1.id}, ${a2.id}, ${a3.id}, ${b1.id}, ${b2.id}, ${b3.id}) ORDER BY id
      `;
      const [m] = await sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM identity_merges WHERE org_id IN (${a.id}, ${b.id})`;
      const sg = await sql<{ contact_id: string; n: number }[]>`
        SELECT contact_id, count(*)::int AS n FROM identity_signals WHERE org_id IN (${a.id}, ${b.id}) GROUP BY contact_id ORDER BY contact_id
      `;
      return {
        events: ev.map((r) => `${r.org_id === a.id ? 'A' : 'B'}:${name(r.contact_id)}=${r.n}`),
        contacts: cs.map((r) => `${name(r.id)} ${r.status}${r.deleted ? ' deleted' : ''}`).sort(),
        identityMerges: m!.n,
        signals: sg.map((r) => `${name(r.contact_id)}=${r.n}`),
      };
    };
    before = await snapshot();
    const o1 = await call('POST', '/api/v1/duplicates/merge', a.owner, {
      primaryId: a1.id,
      duplicateIds: [b1.id],
    });
    answers.O1 = short(o1);
    snapshots.O1 = await snapshot();
    const o2 = await call('POST', '/api/v1/duplicates/merge', a.owner, {
      primaryId: b2.id,
      duplicateIds: [a2.id],
    });
    answers.O2 = short(o2);
    snapshots.O2 = await snapshot();
    const o3 = await call('POST', '/api/v1/identity-graph/merge', a.owner, {
      winnerContactId: a3.id,
      loserContactId: b3.id,
    });
    answers.O3 = short(o3);
    snapshots.O3 = await snapshot();
    const o4 = await call('POST', '/api/v1/identity-graph/merge', a.owner, {
      winnerContactId: b1.id,
      loserContactId: a3.id,
    });
    answers.O4 = short(o4);
    snapshots.O4 = await snapshot();
    Object.assign(out, {
      campaigns: { a: ca.reached.length, b: cb.reached.length },
      before,
      answers,
      snapshots,
    });
    cells.O = out;
  }, 600_000);

  it('O1–O4: a foreign id answers 404 and changes nothing in either organisation', () => {
    for (const k of ['O1', 'O2', 'O3', 'O4']) {
      expect(answers[k], k).toMatch(/^404 .*NOT_FOUND/);
      expect(snapshots[k], k).toEqual(before);
    }
  });
});
