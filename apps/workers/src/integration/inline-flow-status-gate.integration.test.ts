/**
 * A flow e-mail with inline HTML reaches nobody who refused marketing: not an
 * unsubscribed, pending, bounced or complained contact, and not an address
 * with any suppression row — 'unsubscribe' included, whatever its case.
 *
 * ─── What was wrong (Z151, measured on master by sending) ────────────────────
 *
 * The inline branch of POST /internal/workflow/send-email — a flow's
 * send_email with config.html, send_personal_email, send_review_request, a
 * sales-sequence e-mail step, the seeded ticketing flows — sent through
 * sendTransactionalEmail. It never read the contact's status, and mta-sender
 * checked a transactional job against every suppression reason but
 * 'unsubscribe'. 35 of 45 measured sends reached the engine, 30 of them for
 * people with no consent. Only a complaint row and a GDPR erasure stopped one.
 *
 * Flow mail is marketing (standing decision), so the branch now refuses the
 * four statuses batch-sender refuses and marks the job purpose
 * 'workflow_marketing', for which mta-sender checks every reason (Z152). The
 * job answers a skip with 200: completed, one attempt, never retried.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Five producers of the 'email' queue × nine contact states. Four producers are
 * real: three flows started by POST /api/v1/events (send_email with
 * config.html, send_personal_email, send_review_request) and a sales sequence
 * enrolled through the API whose step runs by processDueSequenceSteps — which
 * has no production caller, so the test calls it. The fifth is a job put on the
 * queue directly. The real workflow-email worker drains the queue into the real
 * API; its MTA jobs go through the real mta-sender. The gRPC client is the only
 * stub. An active control contact must be mailed by every producer, its content
 * unchanged.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The engine and a real mailbox.
 * - The link and footer this mail still lacks (owner's decision pending).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { processDueSequenceSteps } from '../../../api/dist/services/crm/sales-sequences.js';
import { suppressionEmailHash } from '../../../api/dist/services/suppressions/email.js';
import { startWorkflowEmailWorker } from '../jobs/workflow-email-sender.js';
import { connection, mtaQueues, type MtaSendJobData } from '../queues/index.js';

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
const sendingDomain = `ifl-${tag}.test`;
const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

let seed: SeedOrg;
let token: string;
let worker: Worker;
const emailQueue = new Queue('email', { connection });
const workflowIds: string[] = [];
const sequenceIds: string[] = [];
const allAddresses: string[] = [];
const contactIds: string[] = [];
const erased: string[] = [];

type Producer = 'direct' | 'send_email' | 'personal' | 'review' | 'sequence';
type State =
  | 'active'
  | 'unsubscribed'
  | 'unsub-row'
  | 'pending'
  | 'bounced'
  | 'complained'
  | 'complaint-row'
  | 'gdpr-again'
  | 'upper-unsub-row';

/** Every state but the control refuses marketing. */
const STATES: State[] = [
  'active',
  'unsubscribed',
  'unsub-row',
  'pending',
  'bounced',
  'complained',
  'complaint-row',
  'gdpr-again',
  'upper-unsub-row',
];

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
  if (!res.ok) throw new Error(`[ifl] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function insertContact(email: string, status: string): Promise<string> {
  allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  return c!.id;
}

async function suppress(email: string, reason: string): Promise<void> {
  await sql`
    INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, ${reason})
  `;
}

let serial = 0;

/** A contact in `state`; returns its id and address as stored. */
async function contactIn(producer: Producer, state: State): Promise<{ id: string; email: string }> {
  const email = `ifl-${producer}-${state}-${++serial}-${tag}@test.local`;
  switch (state) {
    case 'active':
    case 'unsubscribed':
    case 'pending':
    case 'bounced':
    case 'complained':
      return { id: await insertContact(email, state), email };
    case 'unsub-row':
      await suppress(email, 'unsubscribe');
      return { id: await insertContact(email, 'active'), email };
    case 'complaint-row':
      await suppress(email, 'complaint');
      return { id: await insertContact(email, 'active'), email };
    case 'upper-unsub-row': {
      // Z144: the row in lower case, the contact as typed in capitals.
      await suppress(email, 'unsubscribe');
      const upper = email.toUpperCase();
      return { id: await insertContact(upper, 'active'), email: upper };
    }
    case 'gdpr-again': {
      // Erased through the API, then created again the same way: active.
      const first = await insertContact(email, 'active');
      const res = await call('POST', `/api/v1/contacts/${first}/anonymize`, {});
      expect(res.status, await res.text()).toBe(200);
      erased.push(email);
      const again = await api<{ data: { id: string } }>('POST', '/api/v1/contacts', {
        email,
        firstName: 'Petra',
      });
      contactIds.push(again.data.id);
      return { id: again.data.id, email };
    }
  }
}

/** An active api_event flow: trigger → `node` → add_tag. Returns its event name. */
async function flowWith(node: { type: string; config: Record<string, unknown> }): Promise<string> {
  const eventName = `ifl-${node.type}-${tag}`;
  const nodes = [
    { id: 'trigger', type: 'trigger', config: {} },
    { id: 'send', type: node.type, config: node.config },
    { id: 'after', type: 'add_tag', config: { tag: `ifl-after-${tag}` } },
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

const flows = {} as Record<'send_email' | 'personal' | 'review', string>;
let sequenceId: string;

const DIRECT_HTML = '<p>Ahoj Petra, Z152 přímý job.</p><p>Zbylý tag: {{ nevyplneno }}</p>';
const DIRECT_TEXT = 'Ahoj Petra, Z152 přímý job.';

/** Make `producer` put one job on the 'email' queue for this contact. */
async function produce(producer: Producer, contactId: string): Promise<void> {
  if (producer === 'direct') {
    await emailQueue.add(
      'workflow-email',
      {
        orgId: seed.id,
        contactId,
        subject: `Z152-direct ${tag}`,
        html: DIRECT_HTML,
        text: DIRECT_TEXT,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    return;
  }
  if (producer === 'sequence') {
    await api('POST', `/api/v1/crm/sequences/${sequenceId}/enroll`, { contactId });
    const r = await processDueSequenceSteps({ limit: 50 });
    expect(r.processed).toBeGreaterThanOrEqual(1);
    return;
  }
  await api('POST', '/api/v1/events', { contactId, eventName: flows[producer] });
}

/** The settled 'email' job for this contact, waited for. */
async function settledJob(contactId: string): Promise<Job> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const jobs = await emailQueue.getJobs(['completed', 'failed'], 0, 5_000);
    const mine = jobs.find((j) => j?.data?.contactId === contactId);
    if (mine) return mine;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`[ifl] no settled email job for ${contactId}`);
}

/** Run every queued MTA job for `to` (any case) through the real processor. */
async function deliver(to: string): Promise<{ status: string; stream: string; purpose: string }[]> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase());
  const out: { status: string; stream: string; purpose: string }[] = [];
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
    out.push({ status, stream: j.data.stream, purpose: j.data.purpose ?? '-' });
    await j.remove().catch(() => {});
  }
  return out;
}

interface Outcome {
  jobState: string;
  attempts: number;
  answer: unknown;
  mta: string;
  reached: Handed | undefined;
}

/** One producer, one state, all the way to the engine. */
async function walk(producer: Producer, state: State): Promise<Outcome> {
  const c = await contactIn(producer, state);
  await produce(producer, c.id);
  const job = await settledJob(c.id);
  engine.handed.length = 0;
  const mta = await deliver(c.email);
  const reached = engine.handed.find((m) => m.to.toLowerCase() === c.email.toLowerCase());
  const out: Outcome = {
    jobState: await job.getState(),
    attempts: job.attemptsMade,
    answer: job.returnvalue,
    mta: mta.length ? mta.map((m) => `${m.status}/${m.stream}/${m.purpose}`).join(',') : 'no job',
    reached,
  };
  console.log(
    `[ifl] ${producer} ${state}: job=${out.jobState}/${out.attempts} answer=${JSON.stringify(out.answer)} ` +
      `mta=${out.mta} engine=${reached ? 'ANO' : 'NE'}`,
  );
  if (reached && state === 'active')
    console.log(`[ifl] content ${producer} ${JSON.stringify(reached)}`);
  if (producer !== 'direct' && producer !== 'sequence') {
    // The run goes on to add_tag after the send; wait for it to settle.
    let run: { status: string; current_node_id: string; error_message: string | null } | undefined;
    for (const until = Date.now() + 10_000; Date.now() < until; ) {
      [run] = await sql<
        { status: string; current_node_id: string; error_message: string | null }[]
      >`
        SELECT status, current_node_id, error_message FROM workflow_runs
        WHERE org_id = ${seed.id} AND contact_id = ${c.id}
      `;
      if (run && run.status !== 'running' && run.status !== 'pending') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log(`[ifl] run ${producer} ${state}: ${JSON.stringify(run)}`);
    expect(run?.status).toBe('completed');
  }
  return out;
}

describe('a flow e-mail with inline HTML reaches only who may get marketing', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await seedApiKey(sql, `ifl-${tag}`);
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    flows.send_email = await flowWith({
      type: 'send_email',
      config: {
        subject: 'Z152-A {{first_name}}',
        html: '<p>Ahoj {{first_name}}, Z152-A tělo.</p><p>Zbylý tag: {{ nevyplneno }}</p>',
      },
    });
    flows.personal = await flowWith({
      type: 'send_personal_email',
      config: {
        fromEmail: `rep@${sendingDomain}`,
        subject: 'Z152-B {{first_name}}',
        body: 'Z152-B osobní.',
      },
    });
    flows.review = await flowWith({ type: 'send_review_request', config: {} });
    const seq = await api<{ data: { id: string } }>('POST', '/api/v1/crm/sequences', {
      name: `ifl ${tag}`,
      steps: [
        {
          id: 's1',
          type: 'email',
          order: 0,
          delayDays: 0,
          config: { subject: 'Z152-D {{first_name}}', body: 'Z152-D sekvence.' },
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
    if (workflowIds.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${workflowIds})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${workflowIds})`;
    }
    if (sequenceIds.length) {
      await sql`DELETE FROM sequence_enrollments WHERE sequence_id = ANY(${sequenceIds})`;
      await sql`DELETE FROM sales_sequences WHERE id = ANY(${sequenceIds})`;
    }
    if (ids.length) {
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM review_requests WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_tags WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND lower(email) LIKE ${`%-${tag}@test.local`}`;
    const hashes = erased.map((e) => suppressionEmailHash(e));
    if (hashes.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email_hash = ANY(${hashes})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await emailQueue.close();
    await sql.end();
  }, 180_000);

  const PRODUCERS: Producer[] = ['direct', 'send_email', 'personal', 'review', 'sequence'];

  it.each(PRODUCERS)('%s: only the active control reaches the engine', async (producer) => {
    const reached: Record<string, boolean> = {};
    for (const state of STATES) {
      const o = await walk(producer, state);
      // The job settles once, as completed: a refusal is not a failure to retry.
      expect(`${state}: ${o.jobState}/${o.attempts}`).toBe(`${state}: completed/1`);
      reached[state] = Boolean(o.reached);
    }
    expect(reached).toEqual({
      active: true,
      unsubscribed: false,
      'unsub-row': false,
      pending: false,
      bounced: false,
      complained: false,
      'complaint-row': false,
      'gdpr-again': false,
      'upper-unsub-row': false,
    });
  });

  it('the control gets the content it was given, unchanged', async () => {
    const o = await walk('direct', 'active');
    expect(o.reached).toEqual({
      to: expect.stringMatching(/^ifl-direct-active-/),
      subject: `Z152-direct ${tag}`,
      html: DIRECT_HTML,
      text: DIRECT_TEXT,
      headers: {},
    });
  });

  it('a refused status is a completed skip that names it', async () => {
    const o = await walk('direct', 'pending');
    expect(o.answer).toEqual({ data: { skipped: true, reason: 'contact status pending' } });
    expect(o.mta).toBe('no job');
  });

  it('twenty at once: ten active get it, ten unsubscribed do not', async () => {
    const people: { id: string; email: string; status: string }[] = [];
    for (let i = 0; i < 20; i++) {
      const status = i % 2 === 0 ? 'active' : 'unsubscribed';
      const email = `ifl-burst${i}-${status}-${tag}@test.local`;
      people.push({ id: await insertContact(email, status), email, status });
    }
    await Promise.all(people.map((p) => produce('direct', p.id)));
    const jobs = await Promise.all(people.map((p) => settledJob(p.id)));
    const states = await Promise.all(jobs.map((j) => j.getState()));
    expect(states.every((s) => s === 'completed')).toBe(true);
    expect(Math.max(...jobs.map((j) => j.attemptsMade))).toBe(1);

    engine.handed.length = 0;
    for (const p of people) await deliver(p.email);
    const got = engine.handed.map((m) => m.to);
    console.log(`[ifl] burst engine=${got.length}`);
    expect(got.sort()).toEqual(
      people
        .filter((p) => p.status === 'active')
        .map((p) => p.email)
        .sort(),
    );
  });
});
