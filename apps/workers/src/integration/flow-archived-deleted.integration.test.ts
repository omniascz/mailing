/**
 * A flow e-mail reaches no archived contact and no soft-deleted one.
 *
 * ─── What was wrong (Z152 MIMO 1, measured on master by sending) ─────────────
 *
 * Z152 gated the inline-HTML branch of POST /internal/workflow/send-email on
 * the four statuses batch-sender refuses. Two kinds of people it still mailed:
 * - an `archived` contact — "Removed from marketing" in the enum, and left out
 *   of every campaign audience (listAudienceWhere) — on the inline branch AND
 *   on the template branch, because batch-sender refused only the four;
 * - a contact with `deleted_at` set, on the inline branch: its contact query
 *   did not filter deleted_at. The template branch already dropped them, as
 *   /internal/contacts/batch does.
 * A message to someone deleted is a send without consent (fixed rule of point
 * 1), and flow mail is marketing (standing decision). Z153 adds 'archived' to
 * MARKETING_REFUSED_CONTACT_STATUSES and filters deleted_at on the inline
 * branch, answered as its own skip reason.
 *
 * 'non_subscribed' is NOT refused: that waits on the owner's decision about
 * § 7(3). It is walked here to show it still gets what it got. Since Z166 a
 * flow's node skips it (Michal, 14. 10. 22:10, point 3); the direct job and
 * the sequence step carry no flow run and still reach it.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Six producers of the 'email' queue × six contact states. Five producers are
 * real: four flows started by POST /api/v1/events (send_email with
 * config.html, send_personal_email, send_review_request, send_email with a
 * templateId — the template branch) and a sales sequence enrolled through the
 * API whose step runs by processDueSequenceSteps (no production caller, so the
 * test calls it). The sixth is a job put on the queue directly. The real
 * workflow-email worker drains the queue into the real API; the template
 * branch's batch-sender job runs through the real processBatchSender, and
 * every MTA job through the real mta-sender. The gRPC client is the only stub.
 * Plus: a campaign to a list holding all four kinds (unchanged — its audience
 * already left archived and deleted out), and twenty jobs at once.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The engine and a real mailbox.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { processDueSequenceSteps } from '../../../api/dist/services/crm/sales-sequences.js';
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
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({ handed: [] as Handed[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: {
    toEmail: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    customHeaders?: Record<string, string>;
  }) => {
    engine.handed.push({
      to: msg.toEmail,
      subject: msg.subject,
      html: msg.htmlBody,
      text: msg.textBody,
      headers: msg.customHeaders ?? {},
    });
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
const sendingDomain = `fad-${tag}.test`;
const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];
const SETTLED: JobType[] = ['completed', 'failed'];

let seed: SeedOrg;
let token: string;
let worker: Worker;
let templateId: string;
const emailQueue = new Queue('email', { connection });
const workflowIds: string[] = [];
const sequenceIds: string[] = [];
const templateIds: string[] = [];
const campaignIds: string[] = [];
const listIds: string[] = [];
const allAddresses: string[] = [];
const contactIds: string[] = [];

type Producer = 'direct' | 'send_email' | 'personal' | 'review' | 'sequence' | 'template';
type State =
  | 'active'
  | 'non_subscribed'
  | 'archived'
  | 'deleted'
  | 'deleted-archived'
  | 'archived-unsub-row';

const STATES: State[] = [
  'active',
  'non_subscribed',
  'archived',
  'deleted',
  'deleted-archived',
  'archived-unsub-row',
];

/** Who may still get a flow e-mail: the control, and non_subscribed (unchanged, § 7(3) open). */
const REACHED: Record<State, boolean> = {
  active: true,
  non_subscribed: true,
  archived: false,
  deleted: false,
  'deleted-archived': false,
  'archived-unsub-row': false,
};

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(token),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await call(method, path, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`[fad] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function insertContact(
  email: string | null,
  status: string,
  deleted = false,
): Promise<string> {
  if (email) allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  if (deleted) await sql`UPDATE contacts SET deleted_at = now() WHERE id = ${c!.id}`;
  return c!.id;
}

let serial = 0;

/** A contact in `state`; returns its id and address. */
async function contactIn(producer: Producer, state: State): Promise<{ id: string; email: string }> {
  const email = `fad-${producer}-${state}-${++serial}-${tag}@test.local`;
  switch (state) {
    case 'active':
    case 'non_subscribed':
    case 'archived':
      return { id: await insertContact(email, state), email };
    case 'deleted':
      return { id: await insertContact(email, 'active', true), email };
    case 'deleted-archived':
      return { id: await insertContact(email, 'archived', true), email };
    case 'archived-unsub-row':
      await sql`
        INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, 'unsubscribe')
      `;
      return { id: await insertContact(email, 'archived'), email };
  }
}

/** An active api_event flow: trigger → `node` → add_tag. Returns its event name. */
async function flowWith(
  key: string,
  node: { type: string; config: Record<string, unknown> },
): Promise<string> {
  const eventName = `fad-${key}-${tag}`;
  const nodes = [
    { id: 'trigger', type: 'trigger', config: {} },
    { id: 'send', type: node.type, config: node.config },
    { id: 'after', type: 'add_tag', config: { tag: `fad-after-${tag}` } },
  ];
  const edges = [
    { id: 'e1', source: 'trigger', target: 'send' },
    { id: 'e2', source: 'send', target: 'after' },
  ];
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${seed.id}, ${eventName}, 'active', 'api_event',
            ${JSON.stringify({ eventName })}::jsonb, ${JSON.stringify(nodes)}::jsonb, ${JSON.stringify(edges)}::jsonb)
    RETURNING id
  `;
  workflowIds.push(w!.id);
  return eventName;
}

const flows = {} as Record<'send_email' | 'personal' | 'review' | 'template', string>;
let sequenceId: string;

const DIRECT_HTML = '<p>Ahoj Petra, Z153 přímý job.</p>';
const DIRECT_TEXT = 'Ahoj Petra, Z153 přímý job.';

/** Make `producer` put a job on the 'email' queue for this contact; what happened. */
async function produce(producer: Producer, contactId: string): Promise<string> {
  if (producer === 'direct') {
    await emailQueue.add(
      'workflow-email',
      {
        orgId: seed.id,
        contactId,
        subject: `Z153-direct ${tag}`,
        html: DIRECT_HTML,
        text: DIRECT_TEXT,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    return 'queued';
  }
  if (producer === 'sequence') {
    const res = await call('POST', `/api/v1/crm/sequences/${sequenceId}/enroll`, { contactId });
    if (!res.ok) return `enroll ${res.status}`;
    await res.text();
    const r = await processDueSequenceSteps({ limit: 50 });
    return `enrolled, processed ${r.processed}`;
  }
  const res = await call('POST', '/api/v1/events', { contactId, eventName: flows[producer] });
  await res.text();
  return `event ${res.status}`;
}

type RunRow = { status: string; current_node_id: string | null; error_message: string | null };

/** The flow run for this contact, once it stops running. */
async function settledRun(contactId: string): Promise<RunRow | undefined> {
  let run: RunRow | undefined;
  for (const until = Date.now() + 10_000; Date.now() < until; ) {
    [run] = await sql<RunRow[]>`
      SELECT status, current_node_id, error_message FROM workflow_runs
      WHERE org_id = ${seed.id} AND contact_id = ${contactId}
    `;
    if (run && run.status !== 'running' && run.status !== 'pending') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return run;
}

/** The 'email' job for this contact once settled, or undefined if none was made. */
async function settledJob(contactId: string, appearWithinMs: number): Promise<Job | undefined> {
  const appear = Date.now() + appearWithinMs;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const settled = await emailQueue.getJobs(SETTLED, 0, 5_000);
    const done = settled.find((j) => j?.data?.contactId === contactId);
    if (done) return done;
    if (Date.now() > appear) {
      const open = await emailQueue.getJobs(ALL_STATES, 0, 5_000);
      if (!open.some((j) => j?.data?.contactId === contactId)) return undefined;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`[fad] email job for ${contactId} did not settle`);
}

/** Run the template branch's batch-sender job for this contact, if there is one. */
async function runBatch(contactId: string): Promise<string> {
  const jobs = (await batchSenderQueues.triggered.getJobs(
    [...ALL_STATES, 'completed'],
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
    out.push(`sent=${r.sent} skipped=${r.skipped}`);
    await j.remove().catch(() => {});
  }
  return out.join(',');
}

/** Run every queued MTA job for `to` through the real processor. */
async function deliver(to: string): Promise<string[]> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase());
  const out: string[] = [];
  for (const j of jobs) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    let status: string;
    try {
      status = (
        (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as { status: string }
      ).status;
    } catch (err) {
      status = `threw: ${(err as Error).message}`;
    }
    out.push(`${status}/${j.data.stream}/${j.data.purpose ?? '-'}`);
    await j.remove().catch(() => {});
  }
  return out;
}

interface Outcome {
  produced: string;
  job: string;
  answer: unknown;
  batch: string;
  mta: string;
  run: RunRow | undefined;
  reached: Handed | undefined;
}

/** One producer, one state, all the way to the engine. */
async function walk(producer: Producer, state: State): Promise<Outcome> {
  const c = await contactIn(producer, state);
  const produced = await produce(producer, c.id);
  const isFlow = producer !== 'direct' && producer !== 'sequence';
  const run = isFlow ? await settledRun(c.id) : undefined;
  const job = await settledJob(c.id, producer === 'direct' ? 30_000 : 3_000);
  const batch = producer === 'template' ? await runBatch(c.id) : '-';
  engine.handed.length = 0;
  const mta = await deliver(c.email);
  const reached = engine.handed.find((m) => m.to.toLowerCase() === c.email.toLowerCase());
  const out: Outcome = {
    produced,
    job: job ? `${await job.getState()}/${job.attemptsMade}` : 'no job',
    answer: job?.returnvalue,
    batch,
    mta: mta.length ? mta.join(',') : 'no job',
    run,
    reached,
  };
  console.log(
    `[fad] ${producer} ${state}: produced=${produced} job=${out.job} answer=${JSON.stringify(out.answer)} ` +
      `batch=${batch} mta=${out.mta} engine=${reached ? 'ANO' : 'NE'} run=${JSON.stringify(run ?? null)}`,
  );
  if (reached && state === 'active')
    console.log(`[fad] content ${producer} ${JSON.stringify(reached)}`);
  return out;
}

describe('a flow e-mail reaches no archived and no deleted contact', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await seedApiKey(sql, `fad-${tag}`);
    // Owner, so the same key can send the campaign (a key without a user is a viewer).
    await sql`
      UPDATE api_keys SET role = 'owner'
      WHERE key_hash = ${createHash('sha256').update(token).digest('hex')}
    `;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    const used = await api<{ data: { id: string } }>(
      'POST',
      '/api/v1/templates/cs-order-confirm/use',
      { name: `fad ${tag}` },
    );
    templateId = used.data.id;
    templateIds.push(templateId);
    flows.send_email = await flowWith('send_email', {
      type: 'send_email',
      config: {
        subject: 'Z153-A {{first_name}}',
        html: '<p>Ahoj {{first_name}}, Z153-A tělo.</p>',
      },
    });
    flows.personal = await flowWith('personal', {
      type: 'send_personal_email',
      config: {
        fromEmail: `rep@${sendingDomain}`,
        subject: 'Z153-B {{first_name}}',
        body: 'Z153-B osobní.',
      },
    });
    flows.review = await flowWith('review', { type: 'send_review_request', config: {} });
    flows.template = await flowWith('template', {
      type: 'send_email',
      config: { templateId, subject: 'Z153-E {{first_name}}' },
    });
    const seq = await api<{ data: { id: string } }>('POST', '/api/v1/crm/sequences', {
      name: `fad ${tag}`,
      steps: [
        {
          id: 's1',
          type: 'email',
          order: 0,
          delayDays: 0,
          config: { subject: 'Z153-D {{first_name}}', body: 'Z153-D sekvence.' },
        },
      ],
    });
    sequenceId = seq.data.id;
    sequenceIds.push(sequenceId);
    worker = startWorkflowEmailWorker();
  }, 120_000);

  afterAll(async () => {
    await worker?.close();
    for (const a of allAddresses) await deliver(a).catch(() => {});
    const ids = contactIds;
    for (const id of ids) await runBatch(id).catch(() => {});
    for (const a of allAddresses) await deliver(a).catch(() => {});
    if (workflowIds.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${workflowIds})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${workflowIds})`;
    }
    if (sequenceIds.length) {
      await sql`DELETE FROM sequence_enrollments WHERE sequence_id = ANY(${sequenceIds})`;
      await sql`DELETE FROM sales_sequences WHERE id = ANY(${sequenceIds})`;
    }
    if (campaignIds.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${campaignIds})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${campaignIds})`;
    }
    if (ids.length) {
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM review_requests WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_tags WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    if (templateIds.length) await sql`DELETE FROM templates WHERE id = ANY(${templateIds})`;
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email LIKE ${`%-${tag}@test.local`}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await emailQueue.close();
    await sql.end();
  }, 180_000);

  const PRODUCERS: Producer[] = [
    'direct',
    'send_email',
    'personal',
    'review',
    'sequence',
    'template',
  ];

  // Z166 — Michal, 14. 10. 22:10, point 3: the four flow producers (their job
  // carries workflowRunId) skip non_subscribed. It was REACHED for all six.
  const FLOW_PRODUCERS: Producer[] = ['send_email', 'personal', 'review', 'template'];

  it.each(PRODUCERS)(
    '%s: active (and non_subscribed outside a flow) reach the engine, archived and deleted do not',
    async (producer) => {
      const reached: Record<string, boolean> = {};
      for (const state of STATES) {
        const o = await walk(producer, state);
        // Whatever job there is settles once, as completed: a refusal is not a failure to retry.
        if (o.job !== 'no job') expect(`${state}: ${o.job}`).toBe(`${state}: completed/1`);
        if (o.run) expect(`${state}: ${o.run.status}`).toBe(`${state}: completed`);
        reached[state] = Boolean(o.reached);
      }
      expect(reached).toEqual(
        FLOW_PRODUCERS.includes(producer) ? { ...REACHED, non_subscribed: false } : REACHED,
      );
    },
  );

  it('the inline branch names why it skipped, and keeps "no contact email" apart', async () => {
    const reasons: Record<string, unknown> = {};
    for (const state of ['archived', 'deleted', 'deleted-archived'] as const) {
      reasons[state] = (await walk('direct', state)).answer;
    }
    const noEmail = await insertContact(null, 'active');
    await produce('direct', noEmail);
    reasons['no-email'] = (await settledJob(noEmail, 30_000))?.returnvalue;
    const unknown = randomUUID();
    await produce('direct', unknown);
    reasons['unknown-id'] = (await settledJob(unknown, 30_000))?.returnvalue;
    console.log(`[fad] reasons ${JSON.stringify(reasons)}`);
    expect(reasons).toEqual({
      archived: { data: { skipped: true, reason: 'contact status archived' } },
      deleted: { data: { skipped: true, reason: 'contact deleted' } },
      'deleted-archived': { data: { skipped: true, reason: 'contact deleted' } },
      'no-email': { data: { skipped: true, reason: 'no contact email' } },
      'unknown-id': { data: { skipped: true, reason: 'no contact email' } },
    });
  });

  it('the control gets the content it was given, unchanged, and then the opt-out footer', async () => {
    const o = await walk('direct', 'active');
    expect(o.reached).toMatchObject({
      to: expect.stringMatching(/^fad-direct-active-/),
      subject: `Z153-direct ${tag}`,
    });
    // Changed by Z157, not by Z153: Michal (14. 10. 22:10, point 2) decided that
    // the system appends a footer with the sender and an unsubscribe link to a
    // marketing inline flow e-mail and sends List-Unsubscribe with it, so
    // `headers: {}` and the body as given are no longer the right answer. What
    // this test is for still holds: the job's html and text arrive first and
    // unchanged; only the footer follows them.
    const unsub = o.reached!.headers['List-Unsubscribe']!.slice(1, -1);
    expect(unsub).toMatch(/\/api\/v1\/unsubscribe\/[\w-]+\.[\w-]+$/);
    expect(o.reached!.headers).toEqual({
      'List-Unsubscribe': `<${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(o.reached!.html.startsWith(DIRECT_HTML)).toBe(true);
    expect(o.reached!.html.slice(DIRECT_HTML.length)).toBe(
      '<div data-fm-optout="1" style="padding:16px 24px;font-size:12px;color:#6b7280;text-align:center;">' +
        `<div style="margin-top:8px;">${seed.companyName}<br/>${seed.postalAddress}</div>` +
        `<div style="margin-top:8px;"><a href="${unsub}" style="color:#6b7280;text-decoration:underline;">Odhlásit z odběru</a></div>` +
        '</div>',
    );
    expect(o.reached!.text).toBe(
      `${DIRECT_TEXT}\n\n${seed.companyName}\n${seed.postalAddress}\nOdhlásit z odběru: ${unsub}`,
    );
    const t = await walk('template', 'active');
    expect(t.reached?.subject).toBe('Z153-E Petra');
    expect(t.reached?.html.startsWith('<!DOCTYPE html')).toBe(true);
  });

  it('twenty at once: ten active get it, ten archived do not', async () => {
    const people: { id: string; email: string; status: string }[] = [];
    for (let i = 0; i < 20; i++) {
      const status = i % 2 === 0 ? 'active' : 'archived';
      const email = `fad-burst${i}-${status}-${tag}@test.local`;
      people.push({ id: await insertContact(email, status), email, status });
    }
    await Promise.all(people.map((p) => produce('direct', p.id)));
    const jobs = await Promise.all(people.map((p) => settledJob(p.id, 30_000)));
    const states = await Promise.all(jobs.map((j) => j!.getState()));
    expect(states.every((s) => s === 'completed')).toBe(true);
    expect(Math.max(...jobs.map((j) => j!.attemptsMade))).toBe(1);

    engine.handed.length = 0;
    for (const p of people) await deliver(p.email);
    const got = engine.handed.map((m) => m.to);
    console.log(`[fad] burst engine=${got.length}`);
    expect(got.sort()).toEqual(
      people
        .filter((p) => p.status === 'active')
        .map((p) => p.email)
        .sort(),
    );
  });

  it('a campaign is unchanged: its audience already left archived and deleted out', async () => {
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`fad ${tag}`}) RETURNING id
    `;
    listIds.push(list!.id);
    const people: Record<string, string> = {};
    for (const [name, status, deleted] of [
      ['active', 'active', false],
      ['archived', 'archived', false],
      ['non_subscribed', 'non_subscribed', false],
      ['deleted', 'active', true],
    ] as const) {
      const email = `fad-camp-${name}-${tag}@test.local`;
      const id = await insertContact(email, status, deleted);
      await sql`
        INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${id}, ${list!.id}, now())
      `;
      people[name] = email;
    }
    const subject = `Z153 kampaň ${tag}`;
    const created = await api<{ data: { id: string } }>('POST', '/api/v1/campaigns', {
      name: `fad ${tag}`,
      subject,
      fromName: 'Obchod',
      fromEmail: `noreply@${sendingDomain}`,
      listId: list!.id,
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
    const campaignId = created.data.id;
    campaignIds.push(campaignId);

    const panel = await api<{ data: { checks: { id: string; title: string }[] } }>(
      'GET',
      `/api/v1/campaigns/${campaignId}/pre-send-checks`,
    );
    const size = panel.data.checks.find((c) => c.id.startsWith('audience'));

    const idsOn = async (q: Queue) =>
      new Set((await q.getJobs([...ALL_STATES, 'completed'], 0, 5_000)).map((j) => String(j?.id)));
    const beforeSplit = await idsOn(campaignSplitterQueue);
    await api('POST', `/api/v1/campaigns/${campaignId}/send`);
    const split = (await campaignSplitterQueue.getJobs([...ALL_STATES, 'completed'], 0, 5_000))
      .filter((j) => j && !beforeSplit.has(String(j.id)))
      .map((j) => j.data as CampaignSplitterJobData)
      .find((d) => d.campaignId === campaignId);
    expect(split, 'no splitter job').toBeTruthy();
    const fake = <T>(data: T) =>
      ({
        id: `fad-${randomUUID()}`,
        timestamp: Date.now(),
        data,
        log: async () => {},
      }) as unknown as Job<T>;
    const beforeBatch = await idsOn(batchSenderQueue);
    await processCampaignSplitter(fake(split!));
    const batches = (await batchSenderQueue.getJobs([...ALL_STATES, 'completed'], 0, 5_000))
      .filter((j) => j && !beforeBatch.has(String(j.id)))
      .map((j) => j.data as BatchSenderJobData)
      .filter((d) => d.campaignId === campaignId);
    for (const b of batches) await processBatchSender(fake(b));

    engine.handed.length = 0;
    for (const to of Object.values(people)) await deliver(to);
    const reached = engine.handed
      .filter((m) => m.subject === subject)
      .map((m) => m.to)
      .sort();
    console.log(`[fad] campaign panel=${JSON.stringify(size)} reached=${JSON.stringify(reached)}`);
    expect(size?.title).toBe('1 recipients');
    expect(reached).toEqual([people.active]);
  });
});
