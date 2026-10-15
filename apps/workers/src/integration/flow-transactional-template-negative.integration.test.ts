/**
 * The template branch's transactional exception does not let a flow e-mail
 * through to where it must not go. Tests and measurement only (Z159).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * Z158 gave the template branch of a flow the transactional exception: a
 * send_email node with a template, priority 'transactional', on a trigger of
 * the closed list (the order, the ticket, the change of an event) is queued
 * with `flowTransactional`, batch-sender lets the lifted statuses through and
 * checks only the transactional suppression reasons, and mta-sender gets the
 * purpose 'flow_transactional' (SUPPRESSES_TRANSACTIONAL: hard_bounce,
 * complaint, manual, block, invalid_email). It was measured only towards
 * "reaches": active, pending, archived and an unsubscribe row, and against a
 * hard_bounce row and bounced. The other direction — that it does not reach a
 * complaint, invalid, manual or block row, the GDPR fingerprint, a deleted
 * contact — was only read. flow-transactional-template.integration.test.ts
 * walks the "reaches" side; this file walks the other one, beside it so the
 * Z158 file and its assertions stay exactly as they were.
 *
 * Every suppression row is made the way production makes it: the complaint by
 * an ARF report through POST /api/v1/isp/feedback (fbl-processor), the GDPR
 * fingerprint by POST /contacts/:id/anonymize and the same address created
 * again by POST /contacts, invalid_email / manual / block / hard_bounce /
 * unsubscribe by POST /api/v1/suppressions (the operator's route), the
 * soft-deleted contact by DELETE /contacts/:id. A contact's status without a
 * row (complained, unsubscribed, bounced, pending, non_subscribed) has no
 * route of its own and is written to the table, as in Z158.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * POST /api/v1/events → executor → queue → the real workflow-email worker in
 * this process → the real API route → the real processBatchSender → the real
 * mta-sender. The gRPC client of the engine is the only stub; it keeps what
 * it was handed, so the render is compared at the engine.
 *
 *   T2  a flow of its own on ticketing.order_paid, send_email with a TEMPLATE
 *       (cs-order-confirm, used through the real API), priority transactional;
 *   K1  T2 without the priority (marketing);
 *   K3  a campaign and POST /emails to the same kinds of contact.
 *
 * Each cell is logged as `[ftn] …` and the whole table once as
 * `FTN_CELLS_JSON {…}` at the end, for the report.
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers and the engine; an ISP's real FBL mailbox (the ARF report
 *   is posted to the route the forwarder posts to).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
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

const API = process.env.API_URL!;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET! };
// The API's own development default (config/env.ts) unless CI sets one.
const FBL_SECRET = process.env.FBL_WEBHOOK_SECRET ?? 'dev-fbl-webhook-secret-change-me-32ch';
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `ftn-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
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
const PROPS = { eventTitle: 'Hamlet', ticket_url: 'https://tix.example/ftn' };

type State =
  | 'active'
  | 'non_subscribed'
  | 'complained'
  | 'unsubscribed'
  | 'pending'
  | 'bounced'
  | 'unsub_row'
  | 'complaint_fbl'
  | 'invalid_row'
  | 'manual_row'
  | 'block_row'
  | 'hard_bounce_row'
  | 'gdpr'
  | 'deleted'
  | 'deleted_late';

/** Must not reach the engine under the exception. */
const MUST_NOT: State[] = [
  'complaint_fbl',
  'invalid_row',
  'manual_row',
  'block_row',
  'gdpr',
  'deleted',
  'deleted_late',
  'bounced',
  'hard_bounce_row',
];
/** Reach the engine under the exception (nothing the exception lifts was broken). */
const MUST: State[] = ['active', 'complained', 'unsubscribed', 'non_subscribed'];
const ALL_T2: State[] = [...MUST, 'pending', ...MUST_NOT];
/** K1 (marketing) reaches only these. */
const K1_REACHES: State[] = ['active', 'non_subscribed'];

const ROW_REASON: Partial<Record<State, string>> = {
  invalid_row: 'invalid_email',
  manual_row: 'manual',
  block_row: 'block',
  hard_bounce_row: 'hard_bounce',
  unsub_row: 'unsubscribe',
};

let seed: SeedOrg;
let token: string;
let startedAt: Date;
let countersBefore: { period_start: Date; sends: number }[] = [];
let fblKeyBefore: string | null = null;
let orgBefore: Record<string, unknown> = {};
const workers: Worker[] = [];
const emailQ = new Queue('email', { connection });
const contactIds: string[] = [];
const erasureHashes: string[] = [];
const workflowIds: string[] = [];
const templateIds: string[] = [];
const campaignIds: string[] = [];
const listIds: string[] = [];
const flows = {} as Record<'t2' | 'k1', string>;
/** Everything measured, printed once as FTN_CELLS_JSON. */
const report: Record<string, unknown> = { tag };

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(token),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, text: await res.text() };
}

interface Person {
  state: State;
  id: string;
  email: string;
  /** How the state was made, for the report. */
  made: string;
}
let serial = 0;

/** An ISP's ARF complaint about `email`, posted where the mailbox forwarder posts it. */
async function fblComplaint(email: string) {
  const arf = [
    'From: fbl@isp.example',
    'Content-Type: multipart/report; report-type=feedback-report',
    '',
    'Feedback-Type: abuse',
    'User-Agent: ftn/1.0',
    'Version: 1',
    `Original-Rcpt-To: <${email}>`,
    `Original-Message-ID: <ftn-${randomUUID()}@${sendingDomain}>`,
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

async function person(state: State, prefix = 'ftn'): Promise<Person> {
  const email = `${prefix}-${state.replace(/_/g, '')}-${++serial}-${tag}@test.local`;
  const status =
    (
      {
        non_subscribed: 'non_subscribed',
        complained: 'complained',
        unsubscribed: 'unsubscribed',
        pending: 'pending',
        bounced: 'bounced',
        unsub_row: 'unsubscribed',
      } as Partial<Record<State, string>>
    )[state] ?? 'active';
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  let id = c!.id;
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
    const [after] = await sql<{ status: string; complaint_count: number }[]>`
      SELECT status, complaint_count FROM contacts WHERE id = ${id}
    `;
    const rows = await sql<{ reason: string }[]>`
      SELECT reason FROM suppressions WHERE org_id = ${seed.id} AND lower(email) = ${email}
    `;
    made += ` + POST /isp/feedback ${r.status} ${r.text} → status ${after!.status}, complaint_count ${after!.complaint_count}, rows ${JSON.stringify(rows.map((x) => x.reason))}`;
  }
  if (state === 'gdpr') {
    const erased = await call('POST', `/api/v1/contacts/${id}/anonymize`, {});
    expect(erased.status, erased.text).toBe(200);
    const hash = (JSON.parse(erased.text) as { data: { emailHash: string } }).data.emailHash;
    erasureHashes.push(hash);
    const again = await call('POST', '/api/v1/contacts', { email, firstName: 'Petra' });
    expect(again.status, again.text).toBeLessThan(300);
    id = (JSON.parse(again.text) as { data: { id: string } }).data.id;
    contactIds.push(id);
    const [recreated] = await sql<
      { status: string }[]
    >`SELECT status FROM contacts WHERE id = ${id}`;
    made += ` + POST /anonymize ${erased.status} + POST /contacts ${again.status} → status ${recreated!.status}`;
  }
  if (state === 'deleted') {
    const del = await call('DELETE', `/api/v1/contacts/${id}`);
    expect(del.status, del.text).toBe(204);
    made += ` + DELETE /contacts ${del.status}`;
  }
  return { state, id, email, made };
}

/** An inactive api_event flow of this file: trigger → send_email. */
async function flowWith(eventName: string, config: Record<string, unknown>) {
  const nodes = [
    { id: 'trigger', type: 'trigger', config: {} },
    { id: 'send', type: 'send_email', config },
  ];
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${seed.id}, ${`ftn ${eventName} ${tag}`}, 'inactive', 'api_event',
            ${JSON.stringify({ eventName })}::jsonb, ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify([{ id: 'e1', source: 'trigger', target: 'send' }])}::jsonb)
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

/** The contact's email jobs once settled: "state returnvalue", and the last job's data. */
async function settled(contactId: string): Promise<{ text: string; data: unknown }> {
  const appear = Date.now() + 5_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const jobs = (await emailQ.getJobs(ALL, 0, 10_000)).filter(
      (j) => j?.data?.contactId === contactId,
    );
    if (!jobs.length && Date.now() > appear) return { text: 'no job', data: null };
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
  return { text: 'did not settle', data: null };
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

/** Drop the queued MTA jobs for `to` without sending them. */
async function dropMta(to: string): Promise<number> {
  const jobs = ((await mtaQueues.other.getJobs(OPEN, 0, 5_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase(),
  );
  for (const j of jobs) await j.remove().catch(() => {});
  return jobs.length;
}

const handedTo = (email: string) =>
  engine.handed.filter((m) => m.toEmail.toLowerCase() === email.toLowerCase());

interface Cell {
  made: string;
  event: string;
  job: string;
  batch: string;
  mta: string;
  reached: boolean;
}

/** Fire `eventName` for every person at once; what the route, batch-sender and the engine saw. */
async function walkPeople(
  label: string,
  eventName: string,
  people: Person[],
): Promise<{ cells: Record<string, Cell>; data: Record<string, unknown> }> {
  const cells: Record<string, Cell> = {};
  const data: Record<string, unknown> = {};
  await Promise.all(
    people.map(async (p, i) => {
      const key =
        people.filter((q) => q.state === p.state).length > 1 ? `${p.state}#${i}` : p.state;
      const r = await call('POST', '/api/v1/events', {
        contactId: p.id,
        eventName,
        properties: PROPS,
      });
      const event = `${r.status}`;
      const job = r.status < 300 ? await settled(p.id) : { text: `event ${r.text}`, data: null };
      let made = p.made;
      if (p.state === 'deleted_late') {
        // Deleted after the flow queued the mail and before batch-sender ran it.
        const del = await call('DELETE', `/api/v1/contacts/${p.id}`);
        expect(del.status, del.text).toBe(204);
        made += ` + DELETE /contacts ${del.status} after the job settled`;
      }
      const batch = await runBatch(p.id);
      const mta = await deliver(p.email);
      const reached = handedTo(p.email).length > 0;
      cells[key] = { made, event, job: job.text, batch, mta, reached };
      data[key] = job.data;
      console.log(
        `[ftn] ${label} ${key}: event=${event} job=${job.text} batch=${batch} mta=${mta} engine=${reached ? 'ANO' : 'NE'} | ${made}`,
      );
    }),
  );
  return { cells, data };
}

async function walk(label: string, states: State[]) {
  const people = await Promise.all(states.map((s) => person(s)));
  return { people, ...(await walkPeople(label, 'ticketing.order_paid', people)) };
}

/** The message as the engine got it, with what differs per recipient replaced. */
function normalised(m: Handed, p: Person): string {
  const strip = (s: string) =>
    s
      .split(p.email)
      .join('<EMAIL>')
      .split(p.email.toUpperCase())
      .join('<EMAIL>')
      .split(encodeURIComponent(p.email))
      .join('<EMAIL>')
      .split(p.id)
      .join('<CONTACT>')
      .split(m.messageId)
      .join('<MID>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      .replace(/[A-Za-z0-9_-]{24,}(\.[A-Za-z0-9_-]{10,})*/g, '<TOKEN>');
  const headers = Object.keys(m.customHeaders)
    .sort()
    .map((k) => `${k}: ${m.customHeaders[k]}`);
  return strip(
    [
      `From: ${m.fromName} <${m.fromEmail}>`,
      `Reply-To: ${m.replyTo}`,
      `Subject: ${m.subject}`,
      ...headers,
      '--- text',
      m.textBody,
      '--- html',
      m.htmlBody,
    ].join('\n'),
  );
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

async function sends(): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    SELECT COALESCE(sum(sends), 0)::int AS n FROM plan_send_counters WHERE org_id = ${seed.id}
  `;
  return r!.n;
}

async function eventsOf(contactId: string): Promise<Record<string, number>> {
  const rows = await sql<{ event_type: string; n: number }[]>`
    SELECT event_type, count(*)::int AS n FROM email_events
    WHERE org_id = ${seed.id} AND contact_id = ${contactId}
    GROUP BY event_type ORDER BY event_type
  `;
  return Object.fromEntries(rows.map((r) => [r.event_type, r.n]));
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
           (SELECT count(*)::int FROM abuse_events WHERE org_id = o.id) AS abuse_events
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};
const p90 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)]!;
};

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

const plainJob = <T>(data: T): Job<T> =>
  ({
    id: `ftn-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  }) as unknown as Job<T>;

async function jobIds(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs(ALL, 0, 5_000);
  return new Set(jobs.map((j) => String(j?.id)));
}

async function added<T>(queue: Queue, before: Set<string>): Promise<Job<T>[]> {
  const jobs = await queue.getJobs(ALL, 0, 5_000);
  return jobs.filter((j) => j && !before.has(String(j.id))) as Job<T>[];
}

let t2: Awaited<ReturnType<typeof walk>>;
let k1: Awaited<ReturnType<typeof walk>>;

describe('the template branch exception reaches no one it must not (Z159)', () => {
  beforeAll(async () => {
    startedAt = new Date();
    seed = await readSeedOrg(sql);
    orgBefore = await orgState();
    token = await seedApiKey(sql, `ftn-${tag}`);
    // Editor at least, so the key can use a template and erase a contact.
    await sql`
      UPDATE api_keys SET role = 'owner'
      WHERE key_hash = ${createHash('sha256').update(token).digest('hex')}
    `;
    countersBefore = await sql`
      SELECT period_start, sends FROM plan_send_counters WHERE org_id = ${seed.id}
    `;
    fblKeyBefore = await (await emailQ.client).get(`fbl:complaints24h:${seed.id}`);
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    const used = await call('POST', '/api/v1/templates/cs-order-confirm/use', {
      name: `ftn ${tag}`,
    });
    expect(used.status, used.text).toBeLessThan(300);
    const templateId = (JSON.parse(used.text) as { data: { id: string } }).data.id;
    templateIds.push(templateId);
    const node = (priority?: 'transactional') => ({
      templateId,
      subject: 'Objednávka {{first_name}}',
      ...(priority ? { priority } : {}),
    });
    flows.t2 = await flowWith('ticketing.order_paid', node('transactional'));
    flows.k1 = await flowWith('ticketing.order_paid', node());
    workers.push(startWorkflowEmailWorker());
    console.log(`[ftn] seed org before: ${JSON.stringify(orgBefore)}`);
  }, 120_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    const people = contactIds;
    for (const j of await emailQ.getJobs(ALL, 0, 10_000)) {
      if (j && people.includes(j.data?.contactId)) await j.remove().catch(() => {});
    }
    await emailQ.close();
    for (const q of [batchSenderQueues.triggered, batchSenderQueue]) {
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        const d = j?.data as BatchSenderJobData | undefined;
        if (
          d &&
          (d.contactIds?.some((id) => people.includes(id)) || campaignIds.includes(d.campaignId))
        )
          await j.remove().catch(() => {});
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
    if (campaignIds.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${campaignIds})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${campaignIds})`;
    }
    await sql`DELETE FROM email_events WHERE org_id = ${seed.id} AND lower(recipient) LIKE ${`%-${tag}@test.local`}`;
    if (contactIds.length) {
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    if (templateIds.length) await sql`DELETE FROM templates WHERE id = ANY(${templateIds})`;
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND lower(email) LIKE ${`%-${tag}@test.local`}`;
    if (erasureHashes.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email_hash = ANY(${erasureHashes})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${seed.id} AND created_at >= ${startedAt}`;
    await sql`DELETE FROM api_keys WHERE name = ${`integration ftn-${tag}`}`;
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
    console.log(`FTN_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    // The seed org exactly as this file found it: plan, events, every
    // suppression (the fingerprint rows included), counters, abuse events.
    expect(orgAfter).toEqual(orgBefore);
  }, 300_000);

  it('T2 — the exception reaches active, complained, unsubscribed, non_subscribed and pending; walk all', async () => {
    await onlyActive(flows.t2);
    t2 = await walk('T2', ALL_T2);
    report.T2 = t2.cells;
    for (const st of [...MUST, 'pending'] as State[]) {
      const c = t2.cells[st]!;
      expect(c.reached, `${st}: ${JSON.stringify(c)}`).toBe(true);
      expect(c.batch, st).toBe('sent=1 skipped=0/ft');
      expect(c.mta, st).toBe('sent/triggered/flow_transactional');
    }
  }, 600_000);

  it.each(MUST_NOT)('T2 — %s does not reach the engine', (st) => {
    const c = t2.cells[st]!;
    expect(c.reached, `${st}: ${JSON.stringify(c)}`).toBe(false);
  });

  it('K1 — the same node without the priority reaches only active and non_subscribed', async () => {
    await onlyActive(flows.k1);
    k1 = await walk('K1', ALL_T2);
    report.K1 = k1.cells;
    for (const st of ALL_T2) {
      const c = k1.cells[st]!;
      expect(c.reached, `${st}: ${JSON.stringify(c)}`).toBe(K1_REACHES.includes(st));
    }
    expect(k1.cells.active!.mta).toBe('sent/triggered/-');
  }, 600_000);

  it('render — T2/pending (exception) is T2/active and K1/active at the engine', () => {
    const one = (w: typeof t2, st: State) => {
      const p = w.people.find((x) => x.state === st)!;
      const m = handedTo(p.email);
      expect(m, `${st}: ${m.length} messages`).toHaveLength(1);
      return normalised(m[0]!, p);
    };
    const t2Pending = one(t2, 'pending');
    const t2Active = one(t2, 'active');
    const k1Active = one(k1, 'active');
    const diffs = {
      't2pending-vs-t2active': lineDiff(t2Pending, t2Active),
      't2pending-vs-k1active': lineDiff(t2Pending, k1Active),
      't2active-vs-k1active': lineDiff(t2Active, k1Active),
    };
    report.render = {
      lines: t2Pending.split('\n').length,
      bytes: { t2Pending: t2Pending.length, t2Active: t2Active.length, k1Active: k1Active.length },
      diffs,
      sample: t2Pending.split('\n').slice(0, 12),
    };
    console.log(`[ftn] render ${JSON.stringify(report.render)}`);
    expect(diffs['t2pending-vs-t2active']).toEqual([]);
    expect(diffs['t2pending-vs-k1active']).toEqual([]);
  });

  it('counter — T2/pending (exception) and K1/active each add one send and one unit', async () => {
    const out: Record<string, unknown> = {};
    for (const [label, flow, st] of [
      ['T2/pending', flows.t2, 'pending'],
      ['K1/active', flows.k1, 'active'],
    ] as const) {
      await onlyActive(flow);
      const before = await sends();
      const p = await person(st, 'ftnc');
      const w = await walkPeople(`counter ${label}`, 'ticketing.order_paid', [p]);
      const after = await sends();
      const events = await eventsOf(p.id);
      out[label] = { cell: w.cells[st], units: after - before, events };
      expect(w.cells[st]!.reached, label).toBe(true);
      expect(after - before, label).toBe(1);
      expect(events.send ?? 0, `${label}: ${JSON.stringify(events)}`).toBe(1);
    }
    report.counter = out;
    console.log(`[ftn] counter ${JSON.stringify(out)}`);
  }, 600_000);

  it('concurrency — 20 T2 at once: 10 pending reach, 10 GDPR fingerprints do not', async () => {
    await onlyActive(flows.t2);
    const people = [
      ...(await Promise.all(Array.from({ length: 10 }, () => person('pending', 'ftnp')))),
      ...(await Promise.all(Array.from({ length: 10 }, () => person('gdpr', 'ftnp')))),
    ];
    const w = await walkPeople('concurrency', 'ticketing.order_paid', people);
    const reached = (st: State) =>
      people.filter((p) => p.state === st && handedTo(p.email).length > 0).length;
    const handed = (st: State) =>
      people.filter((p) => p.state === st).reduce((n, p) => n + handedTo(p.email).length, 0);
    const split = {
      pendingReached: reached('pending'),
      gdprReached: reached('gdpr'),
      pendingHanded: handed('pending'),
      gdprHanded: handed('gdpr'),
    };
    report.concurrency = { split, cells: w.cells };
    console.log(`[ftn] concurrency ${JSON.stringify(split)}`);
    expect(split).toEqual({ pendingReached: 10, gdprReached: 0, pendingHanded: 10, gdprHanded: 0 });
  }, 600_000);

  it('K3 — a campaign and POST /emails to active, pending, unsub_row, a complaint row and a fingerprint', async () => {
    const states: State[] = ['active', 'pending', 'unsub_row', 'complaint_fbl', 'gdpr'];
    const people = await Promise.all(states.map((s) => person(s, 'ftnk')));
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`ftn k3 ${tag}`}) RETURNING id
    `;
    listIds.push(list!.id);
    for (const p of people) {
      await sql`
        INSERT INTO contact_lists (contact_id, list_id, confirmed_at)
        VALUES (${p.id}, ${list!.id}, now()) ON CONFLICT DO NOTHING
      `;
    }
    // The campaign, all the way to the engine.
    const subject = `Novinky ${tag}`;
    const created = await call('POST', '/api/v1/campaigns', {
      name: `ftn k3 ${tag}`,
      subject,
      fromName: 'Obchod',
      fromEmail,
      listId: list!.id,
      content: { subject, blocks, globalStyles },
    });
    expect(created.status, created.text).toBeLessThan(300);
    const campaignId = (JSON.parse(created.text) as { data: { id: string } }).data.id;
    campaignIds.push(campaignId);
    const beforeSplit = await jobIds(campaignSplitterQueue);
    const sent = await call('POST', `/api/v1/campaigns/${campaignId}/send`);
    expect(sent.status, sent.text).toBeLessThan(300);
    const split = (await added<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)).filter(
      (j) => j.data.campaignId === campaignId,
    );
    expect(split, 'no splitter job').toHaveLength(1);
    const beforeBatch = await jobIds(batchSenderQueue);
    await processCampaignSplitter(plainJob(split[0]!.data));
    for (const j of split) await j.remove().catch(() => {});
    const batches = (await added<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
      (j) => j.data.campaignId === campaignId,
    );
    for (const b of batches) {
      await processBatchSender(plainJob(b.data));
      await b.remove().catch(() => {});
    }
    const campaign: Record<string, { mta: string; reached: boolean }> = {};
    for (const p of people) {
      const mta = await deliver(p.email);
      campaign[p.state] = {
        mta,
        reached: handedTo(p.email).some((m) => m.subject === subject),
      };
    }
    // POST /emails (Resend-compatible), the same people.
    const emails: Record<string, { answer: string; mta: string; reached: boolean }> = {};
    for (const p of people) {
      const s = `Faktura ${tag} ${p.state}`;
      const r = await call('POST', '/api/v1/emails', {
        from: fromEmail,
        to: p.email,
        subject: s,
        html: '<p>x</p>',
      });
      const mta = await deliver(p.email);
      emails[p.state] = {
        answer: `${r.status} ${r.text.slice(0, 120)}`,
        mta,
        reached: handedTo(p.email).some((m) => m.subject === s),
      };
    }
    report.K3 = {
      made: Object.fromEntries(people.map((p) => [p.state, p.made])),
      campaign,
      emails,
    };
    console.log(`[ftn] K3 ${JSON.stringify(report.K3)}`);
    // What holds since Z150/Z152: the campaign reaches only active; POST /emails
    // reaches an unsubscribe row and stops a complaint row and the fingerprint.
    expect(campaign.active!.reached).toBe(true);
    for (const st of ['pending', 'unsub_row', 'complaint_fbl', 'gdpr'])
      expect(campaign[st]!.reached, `campaign ${st}`).toBe(false);
    expect(emails.active!.reached).toBe(true);
    expect(emails.unsub_row!.reached).toBe(true);
    expect(emails.pending!.reached).toBe(true);
    expect(emails.complaint_fbl!.reached).toBe(false);
    expect(emails.gdpr!.reached).toBe(false);
  }, 600_000);

  it('probes — the FBL complaint row and the GDPR fingerprint row, as production writes them', async () => {
    const fbl = await person('complaint_fbl', 'ftns');
    const fblRows = await sql<
      { reason: string; email: string | null; email_hash: string | null }[]
    >`
      SELECT reason, email, email_hash FROM suppressions
      WHERE org_id = ${seed.id} AND lower(email) = ${fbl.email}
    `;
    const [fblContact] = await sql<{ status: string; complaint_count: number }[]>`
      SELECT status, complaint_count FROM contacts WHERE id = ${fbl.id}
    `;
    const gdpr = await person('gdpr', 'ftns');
    const hash = erasureHashes[erasureHashes.length - 1]!;
    const gdprRows = await sql<Record<string, unknown>[]>`
      SELECT reason, email, phone, (email_hash IS NOT NULL) AS has_hash,
             (email_hash = ${hash}) AS hash_is_response, left(notes, 16) AS notes_prefix
      FROM suppressions WHERE org_id = ${seed.id} AND email_hash = ${hash}
    `;
    const [recreated] = await sql<{ status: string; deleted_at: Date | null }[]>`
      SELECT status, deleted_at FROM contacts WHERE id = ${gdpr.id}
    `;
    report.probes = {
      fbl: { made: fbl.made, rows: fblRows, contact: fblContact },
      gdpr: { made: gdpr.made, rows: gdprRows, recreated },
    };
    console.log(`[ftn] probes ${JSON.stringify(report.probes)}`);
    expect(fblRows.map((r) => r.reason)).toEqual(['complaint']);
    expect(fblContact!.status).toBe('complained');
    expect(gdprRows).toHaveLength(1);
    expect(gdprRows[0]!.reason).toBe('manual');
    expect(gdprRows[0]!.email).toBeNull();
  }, 120_000);

  it('cost — internal calls, Postgres transactions and time of the route and batch-sender, T2 vs K1', async () => {
    const statSql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    const xacts = async () => {
      await statSql`SELECT pg_stat_clear_snapshot()`;
      const [r] = await statSql<{ n: string }[]>`
        SELECT (xact_commit + xact_rollback)::text AS n FROM pg_stat_database
        WHERE datname = current_database()
      `;
      return Number(r!.n);
    };
    // A backend's statistics reach pg_stat_database within 10 s of going idle.
    const settle = () => new Promise((r) => setTimeout(r, 11_000));
    const realFetch = globalThis.fetch;
    const out: Record<string, unknown> = {};
    try {
      for (const [label, w, st] of [
        ['T2/pending', t2, 'pending'],
        ['K1/active', k1, 'active'],
      ] as const) {
        const p = w.people.find((x) => x.state === st)!;
        const data = w.data[st];
        expect(data, `${label}: no job data`).toBeTruthy();
        const route = async () => {
          const t0 = performance.now();
          const r = await realFetch(`${API}/api/v1/internal/workflow/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...INTERNAL },
            body: JSON.stringify(data),
          });
          const text = await r.text();
          expect(r.status, text).toBe(200);
          return performance.now() - t0;
        };
        const batch = async () => {
          const jobs = (
            (await batchSenderQueues.triggered.getJobs(ALL, 0, 5_000)) as Job<BatchSenderJobData>[]
          ).filter((j) => j?.data?.contactIds?.includes(p.id));
          expect(jobs, `${label}: batch jobs`).toHaveLength(1);
          let calls = 0;
          globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
            calls++;
            return realFetch(...args);
          }) as typeof fetch;
          const t0 = performance.now();
          const r = (await processBatchSender(plainJob(jobs[0]!.data))) as {
            sent: number;
            skipped: number;
          };
          const ms = performance.now() - t0;
          globalThis.fetch = realFetch;
          await jobs[0]!.remove().catch(() => {});
          await dropMta(p.email);
          return { ms, calls, result: `sent=${r.sent} skipped=${r.skipped}` };
        };
        // Time: 20 calls of each.
        const routeMs: number[] = [];
        const batchMs: number[] = [];
        const calls = new Set<number>();
        const results = new Set<string>();
        for (let i = 0; i < 20; i++) {
          routeMs.push(await route());
          const b = await batch();
          batchMs.push(b.ms);
          calls.add(b.calls);
          results.add(b.result);
        }
        // Postgres transactions per call: three samples each, after a quiet spell.
        const routeX: number[] = [];
        const batchX: number[] = [];
        for (let i = 0; i < 3; i++) {
          await settle();
          let x0 = await xacts();
          await route();
          await settle();
          routeX.push((await xacts()) - x0);
          x0 = await xacts();
          await batch();
          await settle();
          batchX.push((await xacts()) - x0);
        }
        out[label] = {
          routeMs: { median: median(routeMs), p90: p90(routeMs), all: routeMs.map(Math.round) },
          batchMs: { median: median(batchMs), p90: p90(batchMs), all: batchMs.map(Math.round) },
          batchInternalCalls: [...calls],
          batchResults: [...results],
          routeXacts: routeX,
          batchXacts: batchX,
        };
      }
      const idle: number[] = [];
      for (let i = 0; i < 3; i++) {
        await settle();
        const x0 = await xacts();
        await settle();
        idle.push((await xacts()) - x0);
      }
      out.idleXacts = idle;
    } finally {
      globalThis.fetch = realFetch;
      await statSql.end();
    }
    report.cost = out;
    console.log(`[ftn] cost ${JSON.stringify(out)}`);
  }, 900_000);
});
