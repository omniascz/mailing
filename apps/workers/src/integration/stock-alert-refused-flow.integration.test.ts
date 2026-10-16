/**
 * The restock / price-drop form and an SMS keyword, walked to the engine (Z172).
 *
 * ─── What was wrong (measured on master ced6a9a) ─────────────────────────────
 *
 * The form enrolled a pending, bounced and archived contact and an erased
 * address typed in again (only unsubscribed / complained and a row found by
 * the address were refused), and the next restock started the flow for each
 * of them. An SMS keyword from an unknown number made the contact 'active';
 * given an address and a list, it got the next e-mail campaign.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * An organisation of this file, its owner session from /me/orgs/switch, its
 * publishable keys from POST /api-keys (a fresh one every eight subscribes:
 * the form allows ten an hour per key and address). Contacts, archives, rows,
 * the erasure, keywords, SMS consent, lists, campaigns and flows through their
 * routes; the flows are forked from the gallery (back-in-stock-cs,
 * ecom-price-drop-alert) and activated by POST /workflows/:id/activate.
 * INSERTed, each with its reason: the organisation and its sending domain (as
 * Z171), the products (there is no product route; a feed fetches a URL), the
 * SMS sink route (as Z166: its provider does not exist, so "Unknown SMS
 * provider" means past every gate and nothing leaves the machine), and in C
 * one old subscription row of a pending contact (the branch's route no longer
 * writes one — it is the data master left behind).
 *
 * API → the flow executor → the 'email' queue → the real workflow-email worker
 * in this process → /internal/workflow/send-email → batch-sender (run here on
 * its job) → mta-sender (run here on its job) → the engine's gRPC client, the
 * only stub. An SMS campaign's jobs are posted as workflow-sms-sender posts
 * them (as Z143).
 *
 *   R   {pending, bounced, archived(active), active + {hard_bounce, manual,
 *       block}, erased + the address again} (S) and {new, active,
 *       non_subscribed} (S0) × {back-in-stock, price-drop}: subscribe →
 *       restock / price drop → run, job, batch, MTA, engine, notified_at;
 *   K   an SMS keyword from an unknown number: an SMS campaign to its list,
 *       the contact given an address + a list + an e-mail campaign, a
 *       list_subscribe flow, POST /emails;
 *   C   an old subscription of a pending contact (restock), a transactional
 *       node on a transactional trigger for it.
 *
 * Everything measured is printed once as `Z172_WORKERS_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { redis } from '@forgemsg/shared/redis';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { startWorkflowEmailWorker } from '../jobs/workflow-email-sender.js';
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

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({
  handed: [] as { to: string; subject: string }[],
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string }) => {
    engine.handed.push({ to: msg.toEmail, subject: msg.subject });
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
const sendingDomain = `z172-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const sinkProvider = `z172-sink-${tag}`;
const SMS_REACHED = `Unknown SMS provider: ${sinkProvider}`;
const BIS_SKU = `z172-bis-${tag}`;
const PD_SKU = `z172-pd-${tag}`;
const PHONE_BASE = 420_600_000_000 + Math.floor(Math.random() * 90_000_000);
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

let seed: SeedOrg;
let seedKey = '';
let seedBefore: Record<string, unknown> = {};
let org = '';
let owner = '';
const workers: Worker[] = [];
const emailQ = new Queue('email', { connection });
const smsQ = new Queue('sms', { connection });
const allAddresses: string[] = [];
const rawKeys: string[] = [];
const flows: Record<string, string> = {};
const cells: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag,
  mock:
    'the gRPC client of the engine only; SMS ends at a route whose provider does not exist; ' +
    'everything else is the real API, flow executor, queues, workflow-email worker, ' +
    'splitter, batch-sender and mta-sender',
};
let n = 0;
let phones = 0;

const address = (name: string) => {
  const a = `z172-${name}-${n++}-${tag}@test.local`;
  allAddresses.push(a);
  return a;
};
const newPhone = () => `+${PHONE_BASE + ++phones}`;

const job = <T>(data: T): Job<T> =>
  ({
    id: `z172-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  }) as unknown as Job<T>;

async function call(
  method: string,
  path: string,
  credential: string | null,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(credential ? authHeaders(credential) : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    // The owner session's 100 a minute: waited out and written down, not lifted.
    if (res.status === 429 && attempt < 3 && credential === owner) {
      const s = Number(res.headers.get('retry-after') ?? 60);
      ((report.rateLimitWaits ??= []) as unknown[]).push({ path: path.split('?')[0], s });
      await new Promise((r) => setTimeout(r, (s + 1) * 1000));
      continue;
    }
    return { status: res.status, text: await res.text() };
  }
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const r = await call(method, path, owner, body);
  if (r.status >= 300)
    throw new Error(`[z172] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return r.text ? JSON.parse(r.text) : null;
}

/** A key of this org from POST /api-keys. */
async function mintKey(isPublic: boolean): Promise<string> {
  const b = (await api('POST', '/api/v1/api-keys', {
    name: `z172 ${isPublic ? 'pub' : 'secret'} ${rawKeys.length} ${tag}`,
    isPublic,
  })) as { data: { rawKey: string } };
  rawKeys.push(b.data.rawKey);
  return b.data.rawKey;
}

let pub = '';
let pubUses = 0;
let pubLock: Promise<unknown> = Promise.resolve();
async function nextPublishable(): Promise<string> {
  if (!pub || pubUses >= 8) {
    pub = await mintKey(true);
    pubUses = 0;
  }
  pubUses++;
  return pub;
}
function publishable(): Promise<string> {
  const next = pubLock.then(nextPublishable);
  pubLock = next.catch(() => {});
  return next;
}

/** Run every queued MTA job for `to` through the real processor: "status/stream". */
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
      out.push(`${r.status}/${j.data.stream}`);
    } catch (err) {
      out.push(`threw ${(err as Error).message}/${j.data.stream}`);
    }
    await j.remove().catch(() => {});
  }
  return out.join(',') || 'no mta job';
}

/** Run the triggered batch-sender job(s) for this contact: "sent=… skipped=…". */
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
    const r = (await processBatchSender(job(j.data))) as { sent: number; skipped: number };
    out.push(`sent=${r.sent} skipped=${r.skipped}`);
    await j.remove().catch(() => {});
  }
  return out.join(',');
}

const reachedBy = (email: string, since: number) =>
  engine.handed.slice(since).filter((m) => m.to.toLowerCase() === email.toLowerCase());

async function runsOf(workflowId: string, contactId: string): Promise<string[]> {
  const rows = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM workflow_runs WHERE workflow_id = ${workflowId} AND contact_id = ${contactId}
  `;
  return rows.map((r) => r.status);
}

/** This flow's 'email' jobs for the contact once settled, as "state returnvalue". */
async function settledEmailJobs(workflowId: string, contactId: string): Promise<string> {
  const appear = Date.now() + 15_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const runs = (
      await sql<{ id: string }[]>`
        SELECT id FROM workflow_runs WHERE workflow_id = ${workflowId} AND contact_id = ${contactId}
      `
    ).map((r) => r.id);
    const jobs = (await emailQ.getJobs(ALL, 0, 10_000)).filter(
      (j) => j?.data?.contactId === contactId && runs.includes(j.data.workflowRunId),
    );
    if (!jobs.length) {
      if (Date.now() > appear) return 'no job';
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }
    const states = await Promise.all(jobs.map((j) => j.getState()));
    if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
      const out: string[] = [];
      for (const stale of jobs) {
        const j = (await emailQ.getJob(stale.id!)) ?? stale;
        out.push(`${await j.getState()} ${JSON.stringify(j.returnvalue)}`);
        await j.remove().catch(() => {});
      }
      return out.join(' | ');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'did not settle';
}

/** Follow a flow's e-mail for one contact to the engine. */
async function follow(workflowId: string, contactId: string, email: string) {
  const since = engine.handed.length;
  const emailJob = await settledEmailJobs(workflowId, contactId);
  const batch = await runBatch(contactId);
  const mta = await deliver(email);
  return {
    runs: await runsOf(workflowId, contactId),
    job: emailJob,
    batch,
    mta,
    engine: reachedBy(email, since).length,
  };
}

type Start =
  | 'new'
  | 'active'
  | 'non_subscribed'
  | 'pending'
  | 'bounced'
  | 'archived(active)'
  | 'active + hard_bounce'
  | 'active + manual'
  | 'active + block'
  | 'erased + again';

const S: Start[] = [
  'pending',
  'bounced',
  'archived(active)',
  'active + hard_bounce',
  'active + manual',
  'active + block',
  'erased + again',
];
const S0: Start[] = ['new', 'active', 'non_subscribed'];

/** A contact in `start`, made by the routes (none for a new or erased address). */
async function prepare(start: Start, email: string): Promise<string> {
  if (start === 'new') return 'no contact';
  if (start === 'erased + again') {
    const b = (await api('POST', '/api/v1/contacts', { email, firstName: 'Petra' })) as {
      data: { id: string };
    };
    await api('POST', `/api/v1/contacts/${b.data.id}/anonymize`, {});
    return 'POST /contacts + POST /anonymize';
  }
  const [base, row] = start.split(' + ') as [string, string | undefined];
  const archived = /^archived\((\w+)\)$/.exec(base)?.[1];
  const status = archived ?? base;
  const b = (await api('POST', '/api/v1/contacts', {
    email,
    firstName: 'Petra',
    ...(status === 'active' ? {} : { status }),
  })) as { data: { id: string } };
  let made = `POST /contacts ${status}`;
  if (archived) {
    await api('PUT', `/api/v1/contacts/${b.data.id}`, { status: 'archived' });
    made += ' + PUT archived';
  }
  if (row) {
    await api('POST', '/api/v1/suppressions', { email, reason: row });
    made += ` + POST /suppressions ${row}`;
  }
  return made;
}

async function liveContact(email: string): Promise<{ id: string; status: string } | null> {
  const [c] = await sql<{ id: string; status: string }[]>`
    SELECT id, status::text AS status FROM contacts
    WHERE org_id = ${org} AND lower(email) = lower(${email}) AND deleted_at IS NULL
  `;
  return c ?? null;
}

async function subscriptionOf(kind: 'bis' | 'pd', contactId: string | null) {
  if (!contactId) return { rows: 0, notifiedAt: null as string | null };
  const r =
    kind === 'bis'
      ? await sql<{ notified_at: Date | null }[]>`
          SELECT notified_at FROM back_in_stock_subscriptions WHERE org_id = ${org} AND contact_id = ${contactId}
        `
      : await sql<{ notified_at: Date | null }[]>`
          SELECT notified_at FROM price_drop_subscriptions WHERE org_id = ${org} AND contact_id = ${contactId}
        `;
  return {
    rows: r.length,
    notifiedAt: r[0]?.notified_at ? 'set' : r.length ? 'null' : null,
  };
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

async function idsOn(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs(ALL, 0, 5_000);
  return new Set(jobs.map((j) => String(j?.id)));
}

/** An e-mail campaign to `listId`, all the way to the engine. */
async function emailCampaign(listId: string, recipients: string[]) {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `z172 ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
  const beforeSplit = await idsOn(campaignSplitterQueue);
  await api('POST', `/api/v1/campaigns/${campaignId}/send`, {
    acknowledgeDeliverabilityRisk: true,
  });
  const split = (await campaignSplitterQueue.getJobs(ALL, 0, 5_000))
    .filter((j) => j && !beforeSplit.has(String(j.id)))
    .map((j) => j.data as CampaignSplitterJobData)
    .find((d) => d.campaignId === campaignId);
  expect(split, 'no splitter job').toBeTruthy();
  const beforeBatch = await idsOn(batchSenderQueue);
  await processCampaignSplitter(job(split!));
  const batches = (await batchSenderQueue.getJobs(ALL, 0, 5_000))
    .filter((j) => j && !beforeBatch.has(String(j.id)))
    .map((j) => j.data as BatchSenderJobData)
    .filter((d) => d.campaignId === campaignId);
  for (const b of batches) await processBatchSender(job(b));
  const since = engine.handed.length;
  for (const to of recipients) await deliver(to);
  return {
    split: batches.reduce((a, b) => a + (b.contactIds?.length ?? 0), 0),
    reached: engine.handed
      .slice(since)
      .filter((m) => m.subject === subject)
      .map((m) => m.to.toLowerCase())
      .sort(),
  };
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM back_in_stock_subscriptions WHERE org_id = o.id) AS bis,
           (SELECT count(*)::int FROM price_drop_subscriptions WHERE org_id = o.id) AS pd,
           (SELECT count(*)::int FROM products WHERE org_id = o.id) AS products,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = o.id) AS workflow_runs,
           (SELECT count(*)::int FROM sms_keywords WHERE org_id = o.id) AS sms_keywords,
           (SELECT count(*)::int FROM sms_consents WHERE org_id = o.id) AS sms_consents,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

/** Fork a gallery template into this org and switch it on. */
async function forkActive(slug: string): Promise<string> {
  const f = (await api('POST', `/api/v1/workflow-templates/${slug}/fork`, {
    name: `z172 ${slug} ${tag}`,
  })) as { data: { id: string } };
  await api('POST', `/api/v1/workflows/${f.data.id}/activate`);
  return f.data.id;
}

describe('the restock form and an SMS keyword, walked to the engine (Z172)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    seedBefore = await seedState();
    seedKey = await seedApiKey(sql, `z172-${tag}`);
    const [o] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
      VALUES (${`z172 ${tag}`}, ${`z172-${tag}`}, 'production', 'Obchod z172 s.r.o.',
              'Nádražní 1, 110 00 Praha')
      RETURNING id
    `;
    org = o!.id;
    await sql`
      INSERT INTO organization_members (org_id, user_id, email, role, status)
      SELECT ${org}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
    `;
    const r = await call('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: org });
    expect(r.status, r.text).toBe(200);
    owner = (JSON.parse(r.text) as { data: { token: string } }).data.token;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${org}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    await sql`
      INSERT INTO sms_routes (org_id, country_code, provider, priority, active, config)
      VALUES (${org}, '*', ${sinkProvider}, 0, true, '{}'::jsonb)
    `;
    await sql`
      INSERT INTO products (org_id, sku, name, price, currency, stock)
      VALUES (${org}, ${BIS_SKU}, 'Hrnek', 199, 'CZK', 0),
             (${org}, ${PD_SKU}, 'Kávovar', 800, 'CZK', 5)
    `;
    flows.bis = await forkActive('back-in-stock-cs');
    flows.pd = await forkActive('ecom-price-drop-alert');
    workers.push(startWorkflowEmailWorker());
  }, 180_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    for (const a of allAddresses) await deliver(a).catch(() => {});
    // This org's jobs left on the queues.
    let jobsRemoved = 0;
    for (const q of [emailQ, smsQ, batchSenderQueues.triggered, batchSenderQueue]) {
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        if (j?.data?.orgId === org) {
          await j.remove().catch(() => {});
          jobsRemoved++;
        }
      }
    }
    // Rate-limit counters of this file's keys.
    let limitKeysRemoved = 0;
    for (const k of rawKeys) {
      const d = createHash('sha256').update(k).digest('hex').slice(0, 32);
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
    await sql`DELETE FROM email_events WHERE org_id = ${org}`;
    await sql`DELETE FROM campaigns WHERE org_id = ${org}`;
    await sql`DELETE FROM consent_events WHERE org_id = ${org}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${org}`;
    await sql`DELETE FROM sms_consents WHERE org_id = ${org}`;
    await sql`DELETE FROM sms_routes WHERE org_id = ${org}`;
    await sql`DELETE FROM sms_send_log WHERE org_id = ${org}`;
    await sql`DELETE FROM api_keys WHERE org_id = ${org}`;
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ${org}`;
    await sql`DELETE FROM api_keys WHERE name = ${`integration z172-${tag}`}`;
    const [left] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}) AS orgs,
             (SELECT count(*)::int FROM contacts WHERE org_id = ${org}) AS contacts,
             (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}) AS suppressions,
             (SELECT count(*)::int FROM email_events WHERE org_id = ${org}) AS email_events,
             (SELECT count(*)::int FROM back_in_stock_subscriptions WHERE org_id = ${org}) AS bis,
             (SELECT count(*)::int FROM price_drop_subscriptions WHERE org_id = ${org}) AS pd,
             (SELECT count(*)::int FROM products WHERE org_id = ${org}) AS products,
             (SELECT count(*)::int FROM workflows WHERE org_id = ${org}) AS workflows,
             (SELECT count(*)::int FROM workflow_runs WHERE org_id = ${org}) AS workflow_runs,
             (SELECT count(*)::int FROM sms_keywords WHERE org_id = ${org}) AS sms_keywords,
             (SELECT count(*)::int FROM sms_consents WHERE org_id = ${org}) AS sms_consents,
             (SELECT count(*)::int FROM sms_routes WHERE org_id = ${org}) AS sms_routes,
             (SELECT count(*)::int FROM lists WHERE org_id = ${org}) AS lists,
             (SELECT count(*)::int FROM campaigns WHERE org_id = ${org}) AS campaigns,
             (SELECT count(*)::int FROM api_keys WHERE org_id = ${org}) AS api_keys,
             (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}) AS members
    `;
    const seedAfter = await seedState();
    report.cells = cells;
    report.leftover = { ...left, jobsRemoved, limitKeysRemoved };
    report.seedOrg = { before: seedBefore, after: seedAfter };
    console.log(`Z172_WORKERS_CELLS_JSON ${JSON.stringify(report)}`);
    await emailQ.close();
    await smsQ.close();
    await sql.end();
    expect(left).toEqual({
      orgs: 0,
      contacts: 0,
      suppressions: 0,
      email_events: 0,
      bis: 0,
      pd: 0,
      products: 0,
      workflows: 0,
      workflow_runs: 0,
      sms_keywords: 0,
      sms_consents: 0,
      sms_routes: 0,
      lists: 0,
      campaigns: 0,
      api_keys: 0,
      members: 0,
    });
    // The seed org exactly as this file found it — a snapshot, not zeros.
    expect(seedAfter).toEqual(seedBefore);
    expect(seedAfter.hash_rows).toBe(0);
  }, 180_000);

  for (const kind of ['bis', 'pd'] as const) {
    it(`R ${kind} — subscribe, then ${kind === 'bis' ? 'a restock' : 'a price drop'}: the flow starts only for what the form accepted`, async () => {
      const people = await Promise.all(
        [...S, ...S0].map(async (start) => {
          const email = address(`${kind}-${start.replace(/[^a-z]+/g, '-')}`);
          const made = await prepare(start, email);
          return { start, email, made };
        }),
      );
      const subscribed: Record<string, string> = {};
      for (const p of people) {
        const r = await call(
          'POST',
          `/api/v1/${kind === 'bis' ? 'back-in-stock' : 'price-drop'}/subscribe`,
          await publishable(),
          { sku: kind === 'bis' ? BIS_SKU : PD_SKU, email: p.email },
        );
        subscribed[p.start] = `${r.status}`;
      }
      const notify =
        kind === 'bis'
          ? await call('POST', '/api/v1/back-in-stock/notify', owner, { sku: BIS_SKU })
          : await call('POST', '/api/v1/price-drop/notify', owner, {
              sku: PD_SKU,
              newPrice: 500,
            });
      const out: Record<string, unknown> = {};
      await Promise.all(
        people.map(async (p) => {
          const live = await liveContact(p.email);
          const sub = await subscriptionOf(kind, live?.id ?? null);
          const walked = live
            ? await follow(flows[kind]!, live.id, p.email)
            : { runs: [], job: 'no contact', batch: '-', mta: '-', engine: 0 };
          out[p.start] = {
            made: p.made,
            subscribe: subscribed[p.start],
            statusAfter: live?.status ?? null,
            rows: sub.rows,
            notifiedAt: sub.notifiedAt,
            ...walked,
          };
          console.log(`[z172] R ${kind} ${p.start}: ${JSON.stringify(out[p.start])}`);
        }),
      );
      cells[`R ${kind}`] = { notify: `${notify.status} ${notify.text}`, people: out };
      expect(notify.status, notify.text).toBe(200);
      const at = (s: Start) => out[s] as { rows: number; runs: string[]; engine: number };
      for (const s of S) {
        expect({ rows: at(s).rows, runs: at(s).runs.length, engine: at(s).engine }, s).toEqual({
          rows: 0,
          runs: 0,
          engine: 0,
        });
      }
      for (const s of S0) expect(at(s).rows, s).toBe(1);
      // A flow's marketing node skips non_subscribed (Z166); active gets it.
      expect(at('new').engine).toBe(0);
      expect(at('non_subscribed').engine).toBe(0);
      if (kind === 'bis') expect(at('active').engine).toBe(1);
    }, 900_000);
  }

  it('K an SMS keyword contact: no SMS campaign without consent, no e-mail campaign or list flow once it has an address', async () => {
    const JOIN = `join${tag.slice(0, 6)}`;
    await api('POST', '/api/v1/sms/keywords', {
      keyword: JOIN,
      action: 'subscribe',
      reply: 'Díky, SMS novinky jsou zapnuté.',
    });
    const phone = newPhone();
    const kw = await call('POST', '/api/v1/sms/inbound', owner, { fromPhone: phone, body: JOIN });
    const [c] = await sql<{ id: string; status: string }[]>`
      SELECT id, status::text AS status FROM contacts WHERE org_id = ${org} AND phone = ${phone}
    `;
    // A control with an address, a phone and SMS consent through the route.
    const controlPhone = newPhone();
    const controlEmail = address('kw-control');
    const control = (await api('POST', '/api/v1/contacts', {
      email: controlEmail,
      phone: controlPhone,
      firstName: 'Petra',
    })) as { data: { id: string } };
    await api('POST', '/api/v1/sms/consents', {
      phone: controlPhone,
      contactId: control.data.id,
      consentSource: 'web_form',
    });
    const smsList = (await api('POST', '/api/v1/lists', { name: `z172 sms ${tag}` })) as {
      data: { id: string };
    };
    for (const id of [c!.id, control.data.id]) {
      await api('POST', `/api/v1/lists/${smsList.data.id}/contacts`, { contactId: id });
    }

    // a) An SMS campaign to the list; each job posted as workflow-sms-sender posts it.
    const smsCamp = (await api('POST', '/api/v1/campaigns', {
      name: `z172 sms ${tag}`,
      type: 'sms',
      listId: smsList.data.id,
      subject: 'SMS',
      fromName: 'Obchod',
      fromEmail,
      content: { body: 'Akce z172' },
    })) as { data: { id: string } };
    const beforeSms = await idsOn(smsQ);
    const smsSend = await call('POST', `/api/v1/campaigns/${smsCamp.data.id}/send`, owner, {
      acknowledgeDeliverabilityRisk: true,
    });
    const smsJobs = (await smsQ.getJobs(ALL, 0, 5_000)).filter(
      (j) =>
        j &&
        !beforeSms.has(String(j.id)) &&
        (j.data as { campaignId?: string }).campaignId === smsCamp.data.id,
    );
    const sms: Record<string, string> = {};
    for (const [name, ph] of [
      ['keyword', phone],
      ['control', controlPhone],
    ] as const) {
      const j = smsJobs.find((x) => (x.data as { phone: string }).phone === ph);
      if (!j) {
        sms[name] = 'not enqueued';
        continue;
      }
      const r = await fetch(`${API}/api/v1/internal/workflow/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...INTERNAL },
        body: JSON.stringify(j.data),
      });
      sms[name] = `${r.status} ${(await r.text()).slice(0, 140)}`;
    }
    for (const j of smsJobs) await j.remove().catch(() => {});

    // b) The keyword contact given an address, put on a list, an e-mail campaign.
    const email = address('kw-email');
    const put = await call('PUT', `/api/v1/contacts/${c!.id}`, owner, { email });
    const mailList = (await api('POST', '/api/v1/lists', { name: `z172 mail ${tag}` })) as {
      data: { id: string };
    };
    // c) A list_subscribe flow with a marketing e-mail on that list: adding to
    // the list is the event a keyword contact meets (there is no flow trigger
    // on contact creation; contact.created is an outbound webhook only).
    const lf = (await api('POST', '/api/v1/workflows', {
      name: `z172 list ${tag}`,
      triggerType: 'list_subscribe',
      triggerConfig: { listId: mailList.data.id },
      nodes: [
        { id: 'trigger', type: 'trigger', config: {} },
        {
          id: 'send',
          type: 'send_email',
          config: { subject: 'Z172 vítejte', html: '<p>Vítejte {{first_name}}.</p>' },
        },
      ],
      edges: [{ id: 'e0', source: 'trigger', target: 'send' }],
    })) as { data: { id: string } };
    await api('POST', `/api/v1/workflows/${lf.data.id}/activate`);
    flows.list = lf.data.id;
    for (const id of [c!.id, control.data.id]) {
      await api('POST', `/api/v1/lists/${mailList.data.id}/contacts`, { contactId: id });
    }
    const listFlow = {
      keyword: await follow(lf.data.id, c!.id, email),
      control: await follow(lf.data.id, control.data.id, controlEmail),
    };
    const campaign = await emailCampaign(mailList.data.id, [email, controlEmail]);

    // C POST /emails (transactional) to the keyword contact's address.
    const since = engine.handed.length;
    const tx = await call('POST', '/api/v1/emails', owner, {
      from: fromEmail,
      to: email,
      subject: `Z172 faktura ${tag}`,
      html: '<p>Faktura</p>',
    });
    const txMta = await deliver(email);

    const cell = {
      keyword: `${kw.status} ${kw.text.replace(/[0-9a-f-]{36}/g, '<uuid>')}`,
      statusAfterKeyword: c!.status,
      a_smsCampaign: { send: `${smsSend.status}`, jobs: smsJobs.length, sms },
      b_put: put.status,
      statusAfterPut: (
        await sql<{ status: string }[]>`
        SELECT status::text AS status FROM contacts WHERE id = ${c!.id}
      `
      )[0]!.status,
      c_listFlow: listFlow,
      b_emailCampaign: campaign,
      C_emails: { answer: tx.status, mta: txMta, engine: reachedBy(email, since).length },
    };
    cells.K = cell;
    console.log(`[z172] K: ${JSON.stringify(cell)}`);

    expect(cell.statusAfterKeyword).toBe('non_subscribed');
    expect(cell.statusAfterPut).toBe('non_subscribed');
    expect(sms.control).toContain(SMS_REACHED);
    expect(sms.keyword).not.toContain(SMS_REACHED);
    expect(campaign.reached).toEqual([controlEmail.toLowerCase()]);
    expect(listFlow.keyword.engine).toBe(0);
    expect(cell.C_emails.engine).toBe(1);
  }, 900_000);

  it('C an old subscription of a pending contact, and a transactional node for it: as on master', async () => {
    const email = address('c-pending');
    const p = (await api('POST', '/api/v1/contacts', {
      email,
      firstName: 'Petra',
      status: 'pending',
    })) as { data: { id: string } };
    // The row master's form wrote for a pending contact; the branch writes none.
    await sql`
      INSERT INTO back_in_stock_subscriptions (org_id, contact_id, sku, channel)
      VALUES (${org}, ${p.data.id}, ${BIS_SKU}, 'email')
    `;
    const notify = await call('POST', '/api/v1/back-in-stock/notify', owner, { sku: BIS_SKU });
    const restock = {
      notify: `${notify.status} ${notify.text}`,
      ...(await follow(flows.bis!, p.data.id, email)),
      ...(await subscriptionOf('bis', p.data.id)),
    };

    // ticketing.order_paid is on the closed list; the node says 'transactional'.
    const tf = (await api('POST', '/api/v1/workflows', {
      name: `z172 tx ${tag}`,
      triggerType: 'api_event',
      triggerConfig: { eventName: 'ticketing.order_paid' },
      nodes: [
        { id: 'trigger', type: 'trigger', config: {} },
        {
          id: 'send',
          type: 'send_email',
          config: {
            subject: 'Z172 vstupenka',
            html: '<p>Vaše vstupenka.</p>',
            priority: 'transactional',
          },
        },
      ],
      edges: [{ id: 'e0', source: 'trigger', target: 'send' }],
    })) as { data: { id: string } };
    await api('POST', `/api/v1/workflows/${tf.data.id}/activate`);
    flows.tx = tf.data.id;
    const ev = await call('POST', '/api/v1/events', owner, {
      contactId: p.data.id,
      eventName: 'ticketing.order_paid',
      properties: { eventTitle: 'Hamlet' },
    });
    const transactional = {
      event: ev.status,
      ...(await follow(tf.data.id, p.data.id, email)),
    };
    const cell = { restock, transactional };
    cells.C = cell;
    console.log(`[z172] C: ${JSON.stringify(cell)}`);
    expect(restock.engine).toBe(0);
    expect(transactional.engine).toBe(1);
  }, 600_000);
});
