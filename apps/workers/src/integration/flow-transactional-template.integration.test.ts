/**
 * The ticket, the order and the change of an event reach a pending and an
 * archived contact too — and a flow e-mail from a template has the exception
 * as well. Nothing else changes.
 *
 * ─── What was wrong (measured on master b318c6b, Z156/Z157) ──────────────────
 *
 * The flow's transactional exception (Z156) lifted only unsubscribed and
 * complained: the seeded Day-of SMS answered CONSENT_PENDING for a pending
 * buyer and MARKETING_REFUSED for an archived one, the seeded Day-of reminder
 * "contact status pending / archived". And only the inline-HTML e-mail had it:
 * a send_email node with a template went through batch-sender, which refused
 * every marketing-refused status and stopped on any suppression row,
 * 'unsubscribe' included.
 *
 * Michal, 15. 10. 6:10, point 1b ("of course he must get the informational
 * mail"), which overrides the commissioner's narrower reading of Z156: the
 * ticket, the order and the change of an event reach a pending, archived,
 * unsubscribed, complained and non_subscribed contact, in every kind of flow
 * node. Only the GDPR fingerprint and a hard bounce / invalid address stop
 * it. Bounced without a row, the complaint / manual / block rows and the
 * soft-deleted contact wait on Michal and are unchanged.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * POST /api/v1/events → executor → queue → the real workflow-email /
 * workflow-sms workers in this process → the real API → (template branch) the
 * real processBatchSender → the real mta-sender. The gRPC client of the
 * engine is the only stub. SMS goes to a catch-all route whose provider does
 * not exist: "Unknown SMS provider" means past every gate, and no SMS leaves
 * the machine. The worker drops the API's 502 body, so each settled SMS job's
 * data is posted again to read why (as in Z155/Z156).
 *
 *   T1  the seeded Day-of reminder (inline HTML, priority transactional);
 *   T2  a flow of its own on ticketing.order_paid, send_email with a TEMPLATE
 *       (cs-order-confirm, used through the real API), priority transactional;
 *   T3  the seeded Day-of SMS;
 *   K1  T2 without the priority (marketing);
 *   K2  T2 with priority transactional on ticketing.lottery_won (not listed).
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers and the engine. The ticketing cron that fires the day-of
 *   events in production (the events are posted here instead).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { startWorkflowSmsWorker } from '../jobs/workflow-sms-sender.js';
import { startWorkflowEmailWorker } from '../jobs/workflow-email-sender.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import {
  batchSenderQueues,
  connection,
  mtaQueues,
  type BatchSenderJobData,
  type MtaSendJobData,
} from '../queues/index.js';

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({ handed: [] as string[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string }) => {
    engine.handed.push(msg.toEmail.toLowerCase());
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
const sendingDomain = `ftt-${tag}.test`;
const sinkProvider = `ftt-sink-${tag}`;
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
const PROPS = { eventTitle: 'Hamlet', ticket_url: 'https://tix.example/ftt' };

type State = 'active' | 'pending' | 'archived' | 'unsub_row' | 'hard_bounce_row' | 'bounced';

let seed: SeedOrg;
let token: string;
let startedAt: Date;
let countersBefore: { period_start: Date; sends: number }[] = [];
const workers: Worker[] = [];
const smsQ = new Queue('sms', { connection });
const emailQ = new Queue('email', { connection });
const contactIds: string[] = [];
const workflowIds: string[] = [];
const templateIds: string[] = [];
const flows = {} as Record<'daySms' | 'dayMail' | 't2' | 'k1' | 'k2', string>;

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
  id: string;
  phone: string;
  email: string;
}
let serial = 0;
async function person(state: State): Promise<Person> {
  const phone = `+4207${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`;
  const email = `ftt-${state}-${++serial}-${tag}@test.local`;
  const status =
    state === 'unsub_row' ? 'unsubscribed' : state === 'hard_bounce_row' ? 'active' : state;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, phone, first_name, status)
    VALUES (${seed.id}, ${email}, ${phone}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  if (state === 'unsub_row') {
    await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, 'unsubscribe')`;
  }
  if (state === 'hard_bounce_row') {
    await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, 'hard_bounce')`;
  }
  return { id: c!.id, phone, email };
}

/** An inactive api_event flow of this file: trigger → `node`. */
async function flowWith(
  eventName: string,
  node: { type: string; config: Record<string, unknown> },
) {
  const nodes = [
    { id: 'trigger', type: 'trigger', config: {} },
    { id: 'send', type: node.type, config: node.config },
  ];
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${seed.id}, ${`ftt ${eventName} ${tag}`}, 'inactive', 'api_event',
            ${JSON.stringify({ eventName })}::jsonb, ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify([{ id: 'e1', source: 'trigger', target: 'send' }])}::jsonb)
    RETURNING id
  `;
  workflowIds.push(w!.id);
  return w!.id;
}

/** Only these flows answer an event while the test runs. */
async function onlyActive(...ids: string[]) {
  await sql`UPDATE workflows SET status = 'inactive' WHERE id = ANY(${workflowIds})`;
  await sql`UPDATE workflows SET status = 'active' WHERE id = ANY(${ids})`;
}

/** The contact's jobs once settled: "state returnvalue", plus the SMS replay. */
async function settled(q: Queue, contactId: string): Promise<string> {
  const appear = Date.now() + 5_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const jobs = (await q.getJobs(ALL, 0, 10_000)).filter((j) => j?.data?.contactId === contactId);
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

/** Run the template branch's batch-sender job for this contact: "sent=… skipped=…/flag". */
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
    const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
      status: string;
    };
    out.push(`${r.status}/${j.data.stream}/${j.data.purpose ?? '-'}`);
    await j.remove().catch(() => {});
  }
  return out.join(',') || 'no mta job';
}

interface Cell {
  job: string;
  batch: string;
  mta: string;
  reached: boolean;
}

/** Fire `eventName` for each state; what the route, batch-sender and the engine saw. */
async function walk(
  eventName: string,
  kind: 'sms' | 'email',
  states: State[],
): Promise<Record<string, Cell>> {
  const got: Record<string, Cell> = {};
  await Promise.all(
    states.map(async (st) => {
      const p = await person(st);
      const r = await call('POST', '/api/v1/events', {
        contactId: p.id,
        eventName,
        properties: PROPS,
      });
      expect(r.status, r.text).toBeLessThan(300);
      const job = await settled(kind === 'sms' ? smsQ : emailQ, p.id);
      const batch = kind === 'email' ? await runBatch(p.id) : '-';
      const mta = kind === 'email' ? await deliver(p.email) : '-';
      const reached =
        kind === 'sms' ? job.includes(SMS_REACHED) : engine.handed.includes(p.email.toLowerCase());
      got[st] = { job, batch, mta, reached };
      console.log(
        `[ftt] ${eventName} ${kind} ${st}: job=${job} batch=${batch} mta=${mta} engine=${reached ? 'ANO' : 'NE'}`,
      );
    }),
  );
  return got;
}

describe('the flow transactional exception: pending, archived and the template branch (Z158)', () => {
  beforeAll(async () => {
    startedAt = new Date();
    seed = await readSeedOrg(sql);
    token = await seedApiKey(sql, `ftt-${tag}`);
    // Editor at least, so the key can use a template (as in flow-archived-deleted).
    await sql`
      UPDATE api_keys SET role = 'owner'
      WHERE key_hash = ${createHash('sha256').update(token).digest('hex')}
    `;
    countersBefore = await sql`
      SELECT period_start, sends FROM plan_send_counters WHERE org_id = ${seed.id}
    `;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    await sql`
      INSERT INTO sms_routes (org_id, country_code, provider, priority, active, config)
      VALUES (${seed.id}, '*', ${sinkProvider}, 0, true, '{}'::jsonb)
    `;
    // The seeds exactly as a customer gets them.
    const seeded = await call('POST', '/api/v1/ticketing/seed-workflows');
    expect(seeded.status, seeded.text).toBe(200);
    const rows = await sql<{ id: string; name: string; description: string }[]>`
      SELECT id, name, description FROM workflows
      WHERE org_id = ${seed.id} AND name LIKE 'Ticketing — %'
    `;
    const created = (JSON.parse(seeded.text) as { data: { created: string[] } }).data.created;
    for (const r of rows) {
      if (created.some((k) => r.description?.includes(`(${k})`))) workflowIds.push(r.id);
    }
    const byName = (n: string) => rows.find((r) => r.name === n)!.id;
    flows.daySms = byName('Ticketing — Day-of SMS (ticket QR)');
    flows.dayMail = byName('Ticketing — Day-of reminder');
    // The template: cs-order-confirm, used through the real API.
    const used = await call('POST', '/api/v1/templates/cs-order-confirm/use', {
      name: `ftt ${tag}`,
    });
    expect(used.status, used.text).toBeLessThan(300);
    const templateId = (JSON.parse(used.text) as { data: { id: string } }).data.id;
    templateIds.push(templateId);
    const node = (priority?: 'transactional') => ({
      type: 'send_email',
      config: {
        templateId,
        subject: 'Objednávka {{first_name}}',
        ...(priority ? { priority } : {}),
      },
    });
    flows.t2 = await flowWith('ticketing.order_paid', node('transactional'));
    flows.k1 = await flowWith('ticketing.order_paid', node());
    flows.k2 = await flowWith('ticketing.lottery_won', node('transactional'));
    workers.push(startWorkflowSmsWorker(), startWorkflowEmailWorker());
  }, 120_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    for (const q of [smsQ, emailQ]) {
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        if (j && contactIds.includes(j.data?.contactId)) await j.remove().catch(() => {});
      }
      await q.close();
    }
    for (const j of await batchSenderQueues.triggered.getJobs(ALL, 0, 10_000)) {
      if (j && j.data?.contactIds?.some((id: string) => contactIds.includes(id)))
        await j.remove().catch(() => {});
    }
    if (workflowIds.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${workflowIds})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${workflowIds})`;
    }
    if (contactIds.length) {
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM sms_send_log WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    if (templateIds.length) await sql`DELETE FROM templates WHERE id = ANY(${templateIds})`;
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email LIKE ${`%-${tag}@test.local`}`;
    await sql`DELETE FROM sms_routes WHERE org_id = ${seed.id} AND provider = ${sinkProvider}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${seed.id} AND created_at >= ${startedAt}`;
    await sql`DELETE FROM api_keys WHERE name = ${`integration ftt-${tag}`}`;
    // The seed org's plan counters as this file found them.
    await sql`DELETE FROM plan_send_counters WHERE org_id = ${seed.id}`;
    for (const c of countersBefore) {
      await sql`
        INSERT INTO plan_send_counters (org_id, period_start, sends)
        VALUES (${seed.id}, ${c.period_start}, ${c.sends})
      `;
    }
    await sql.end();
  }, 300_000);

  it('T1 — the seeded Day-of reminder reaches pending and archived (inline, transactional purpose)', async () => {
    await onlyActive(flows.dayMail);
    const got = await walk('ticketing.day_of_reminder', 'email', ['pending', 'archived']);
    for (const st of ['pending', 'archived'] as State[]) {
      expect(got[st]!.reached, `${st}: ${got[st]!.job} ${got[st]!.mta}`).toBe(true);
      expect(got[st]!.mta, st).toBe('sent/transactional/-');
    }
  }, 600_000);

  it('T3 — the seeded Day-of SMS reaches pending and archived', async () => {
    await onlyActive(flows.daySms);
    const got = await walk('ticketing.day_of_sms', 'sms', ['pending', 'archived']);
    for (const st of ['pending', 'archived'] as State[]) {
      expect(got[st]!.job, st).toContain(SMS_REACHED);
    }
  }, 600_000);

  it('T2 — the template node on order_paid reaches pending, archived and an unsubscribe row; not a hard bounce row nor bounced', async () => {
    await onlyActive(flows.t2);
    const got = await walk('ticketing.order_paid', 'email', [
      'active',
      'pending',
      'archived',
      'unsub_row',
      'hard_bounce_row',
      'bounced',
    ]);
    for (const st of ['active', 'pending', 'archived', 'unsub_row'] as State[]) {
      expect(got[st]!.reached, `${st}: ${got[st]!.job} ${got[st]!.batch} ${got[st]!.mta}`).toBe(
        true,
      );
      expect(got[st]!.batch, st).toBe('sent=1 skipped=0/ft');
      // Still the triggered stream, now with the transactional reasons.
      expect(got[st]!.mta, st).toBe('sent/triggered/flow_transactional');
    }
    // A hard bounce row stops it in batch-sender, as before.
    expect(got.hard_bounce_row!.batch).toBe('sent=0 skipped=1/ft');
    expect(got.hard_bounce_row!.reached).toBe(false);
    // Bounced without a row waits on Michal: refused as before.
    expect(got.bounced!.batch).toBe('sent=0 skipped=1/ft');
    expect(got.bounced!.reached).toBe(false);
  }, 600_000);

  it('K1 — the same template node without the priority stays marketing', async () => {
    await onlyActive(flows.k1);
    const got = await walk('ticketing.order_paid', 'email', ['active', 'pending', 'unsub_row']);
    expect(got.active!.reached).toBe(true);
    expect(got.active!.mta).toBe('sent/triggered/-');
    for (const st of ['pending', 'unsub_row'] as State[]) {
      expect(got[st]!.batch, st).toBe('sent=0 skipped=1/-');
      expect(got[st]!.reached, st).toBe(false);
    }
  }, 600_000);

  it('K2 — a transactional template node on lottery_won (not on the list) stays marketing', async () => {
    await onlyActive(flows.k2);
    const got = await walk('ticketing.lottery_won', 'email', ['active', 'pending', 'unsub_row']);
    expect(got.active!.reached).toBe(true);
    expect(got.active!.mta).toBe('sent/triggered/-');
    for (const st of ['pending', 'unsub_row'] as State[]) {
      expect(got[st]!.batch, st).toBe('sent=0 skipped=1/-');
      expect(got[st]!.reached, st).toBe(false);
    }
  }, 600_000);
});
