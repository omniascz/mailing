/**
 * A publishable key no longer starts a ticketing flow (Z161).
 *
 * ─── What was wrong (measured on master c1eae8c, Z161) ───────────────────────
 *
 * POST /api/v1/events accepts the publishable key (authenticatePublic): the
 * key a shop puts in its page source for the web SDK. The event name was free.
 * A flow on ticketing.order_paid / ticketing.event_changed carries the
 * transactional exception (Z156/Z158), so with the key and a contact id
 * anybody started it and its transactional nodes reached unsubscribed,
 * complained, pending and non_subscribed contacts — inline e-mail, template
 * e-mail and SMS alike.
 *
 * Michal, 15. 10. 19:40, point 1c d): measure it first; if it holds, limit
 * ticketing.* to the secret key / the ingest. A publishable key now gets 403
 * EVENT_NAME_RESERVED for any ticketing.* name, whatever the case; nothing is
 * stored and no flow starts. The secret key, the ticketing ingest and a
 * publishable key with any other name behave as before (the control cells).
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The real POST /api/v1/events (V, V', S, VX) and POST /api/v1/ticketing/events
 * (I, VI) with real keys → onApiEvent → executor → queue → the real
 * workflow-email / workflow-sms workers in this process → the real API →
 * (template branch) the real processBatchSender → the real mta-sender. The
 * gRPC client of the engine is the only stub. SMS goes to a catch-all route
 * whose provider does not exist: "Unknown SMS provider" means past every gate,
 * and no SMS leaves the machine; each settled SMS job's data is posted again
 * to read why (as in Z155/Z156/Z158).
 *
 *   V   publishable key, ticketing.order_paid / ticketing.event_changed
 *   V'  publishable key, Ticketing.Order_Paid
 *   S   secret key, the same two events (control)
 *   I   the ticketing ingest with a secret key (control)
 *   VI  the ticketing ingest with a publishable key (probe 2)
 *   VX  publishable key, an event of its own on a flow without priority (control)
 *
 * Every cell is printed as one Z161_CELLS_JSON line before any assertion, so
 * the run on master records what happened there, too.
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers and the engine. A browser: the requests are made here.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey, SEED_LOGIN } from './setup/login.js';
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
const engine = vi.hoisted(() => ({ handed: [] as { to: string; subject: string }[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string }) => {
    engine.handed.push({ to: msg.toEmail.toLowerCase(), subject: msg.subject });
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
const sendingDomain = `pkt-${tag}.test`;
const sinkProvider = `pkt-sink-${tag}`;
const SMS_REACHED = `Unknown SMS provider: ${sinkProvider}`;
const VX_EVENT = `pkt_viewed_product_${tag}`;
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

type State = 'active' | 'unsubscribed' | 'pending' | 'complained' | 'non_subscribed';
const STATES: State[] = ['active', 'unsubscribed', 'pending', 'complained', 'non_subscribed'];
type Path = 'V' | "V'" | 'S' | 'I' | 'VX';

let seed: SeedOrg;
let secretKey: string;
let publicKey: string;
let startedAt: Date;
let orgBefore: Record<string, unknown>;
let countersBefore: { period_start: Date; sends: number }[] = [];
const workers: Worker[] = [];
const smsQ = new Queue('sms', { connection });
const emailQ = new Queue('email', { connection });
const contactIds: string[] = [];
const workflowIds: string[] = [];
const templateIds: string[] = [];
const report: Record<string, unknown> = {};

async function call(key: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(key),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, text: await res.text() };
}

interface Person {
  id: string;
  email: string;
}
let serial = 0;
async function person(state: State): Promise<Person> {
  const phone = `+4207${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`;
  const email = `pkt-${state}-${++serial}-${tag}@test.local`;
  // complained without a suppression row, as the brief asks.
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, phone, first_name, status)
    VALUES (${seed.id}, ${email}, ${phone}, 'Petra', ${state}) RETURNING id
  `;
  contactIds.push(c!.id);
  return { id: c!.id, email };
}

/** An inactive api_event flow of this file: trigger → `node`. */
async function flowWith(eventName: string, node: { type: string; config: object }) {
  const nodes = [
    { id: 'trigger', type: 'trigger', config: {} },
    { id: 'send', type: node.type, config: node.config },
  ];
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${seed.id}, ${`pkt ${eventName} ${node.type} ${tag}`}, 'active', 'api_event',
            ${JSON.stringify({ eventName })}::jsonb, ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify([{ id: 'e1', source: 'trigger', target: 'send' }])}::jsonb)
    RETURNING id
  `;
  workflowIds.push(w!.id);
  return w!.id;
}

/** The seed org as a whole: what this file must leave as it found it. */
async function orgState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT o.plan,
           o.settings->'suspended' AS suspended,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = o.id) AS workflow_runs,
           (SELECT count(*)::int FROM workflow_events WHERE org_id = o.id) AS workflow_events,
           (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM plan_send_counters WHERE org_id = o.id) AS counter_rows,
           (SELECT COALESCE(sum(sends), 0)::int FROM plan_send_counters WHERE org_id = o.id) AS counter_sends,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys,
           (SELECT count(*)::int FROM templates WHERE org_id = o.id) AS templates
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

/** The contact's jobs on `q` once at least `min` exist and all settled. */
async function settled(q: Queue, contactId: string, min: number): Promise<string> {
  const appear = Date.now() + 5_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const jobs = (await q.getJobs(ALL, 0, 10_000)).filter((j) => j?.data?.contactId === contactId);
    if (!jobs.length && min === 0 && Date.now() > appear) return 'no job';
    const states = await Promise.all(jobs.map((j) => j.getState()));
    const done = states.every((s) => s === 'completed' || s === 'failed');
    if (jobs.length && done && (jobs.length >= min || Date.now() > appear + 25_000)) {
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

/** Run the template branch's batch-sender jobs for this contact: "sent=… skipped=…/flag". */
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
  return out.sort().join(',') || 'no mta job';
}

interface Cell {
  http: number;
  code: string | null;
  workflowEvents: number;
  runs: Record<string, number>;
  emailJobs: string;
  smsJob: string;
  batch: string;
  mta: string;
  engineInline: number;
  engineTemplate: number;
  engineVx: number;
  smsReached: boolean;
  reached: boolean;
}

/** One request for one fresh contact in `state`, walked to the end. */
async function cell(path: Path, eventName: string, state: State): Promise<Cell> {
  const p = await person(state);
  const r =
    path === 'I'
      ? await call(secretKey, 'POST', '/api/v1/ticketing/events', {
          type: eventName.replace(/^ticketing\./, ''),
          contact: { email: p.email },
        })
      : await call(path === 'S' ? secretKey : publicKey, 'POST', '/api/v1/events', {
          contactId: p.id,
          eventName,
          properties: { eventTitle: 'Hamlet', ticket_url: 'https://tix.example/pkt' },
        });
  let code: string | null = null;
  try {
    code = (JSON.parse(r.text) as { code?: string }).code ?? null;
  } catch {
    /* not JSON */
  }
  const ticketing = path !== 'VX';
  const ok = r.status < 300;
  // Let the runs appear before reading the queues (each flow starts its own).
  const wantRuns = ok ? (ticketing ? 3 : 1) : 0;
  for (const until = Date.now() + 30_000; wantRuns && Date.now() < until; ) {
    const [n] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM workflow_runs
      WHERE contact_id = ${p.id} AND workflow_id = ANY(${workflowIds})
    `;
    if (n!.n >= wantRuns) break;
    await new Promise((res) => setTimeout(res, 250));
  }
  const emailJobs = await settled(emailQ, p.id, ok ? (ticketing ? 2 : 1) : 0);
  const smsJob = ticketing ? await settled(smsQ, p.id, ok ? 1 : 0) : '-';
  const batch = await runBatch(p.id);
  const mta = await deliver(p.email);
  const mine = engine.handed.filter((h) => h.to === p.email.toLowerCase());
  const engineInline = mine.filter((h) => h.subject.startsWith('Z161 inline')).length;
  const engineVx = mine.filter((h) => h.subject.startsWith('Z161 vx')).length;
  const engineTemplate = mine.length - engineInline - engineVx;
  const runs = Object.fromEntries(
    (
      await sql<{ status: string; n: number }[]>`
        SELECT status::text, count(*)::int AS n FROM workflow_runs
        WHERE contact_id = ${p.id} AND workflow_id = ANY(${workflowIds})
        GROUP BY status ORDER BY status
      `
    ).map((x) => [x.status, x.n]),
  );
  const [we] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM workflow_events WHERE contact_id = ${p.id}
  `;
  const smsReached = smsJob.includes(SMS_REACHED);
  const c: Cell = {
    http: r.status,
    code,
    workflowEvents: we!.n,
    runs,
    emailJobs,
    smsJob,
    batch,
    mta,
    engineInline,
    engineTemplate,
    engineVx,
    smsReached,
    reached: mine.length > 0 || smsReached,
  };
  console.log(`[pkt] ${path} ${eventName} ${state}: ${JSON.stringify(c)}`);
  return c;
}

async function walk(path: Path, eventName: string): Promise<Record<State, Cell>> {
  const got = {} as Record<State, Cell>;
  await Promise.all(
    STATES.map(async (st) => {
      got[st] = await cell(path, eventName, st);
    }),
  );
  report[`${path} ${eventName}`] = got;
  return got;
}

const NOTHING = {
  workflowEvents: 0,
  runs: {},
  emailJobs: 'no job',
  smsJob: 'no job',
  batch: 'no batch job',
  mta: 'no mta job',
  engineInline: 0,
  engineTemplate: 0,
  engineVx: 0,
  smsReached: false,
  reached: false,
};

describe('a publishable key and the ticketing flows (Z161)', () => {
  beforeAll(async () => {
    startedAt = new Date();
    seed = await readSeedOrg(sql);
    orgBefore = await orgState();
    secretKey = await seedApiKey(sql, `pkt-${tag}`);
    // Editor at least, so the key can use a template (as in Z158).
    await sql`
      UPDATE api_keys SET role = 'owner'
      WHERE key_hash = ${createHash('sha256').update(secretKey).digest('hex')}
    `;
    // What a shop pastes into its page: a publishable key, written the way
    // createApiKey writes one.
    publicKey = `fm_pub_${randomBytes(24).toString('hex')}`;
    const [owner] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${SEED_LOGIN.email} LIMIT 1
    `;
    await sql`
      INSERT INTO api_keys (org_id, user_id, name, key_hash, key_prefix, is_public)
      VALUES (${seed.id}, ${owner!.id}, ${`integration pkt-pub-${tag}`},
              ${createHash('sha256').update(publicKey).digest('hex')}, ${publicKey.slice(0, 12)}, true)
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
    const used = await call(secretKey, 'POST', '/api/v1/templates/cs-order-confirm/use', {
      name: `pkt ${tag}`,
    });
    expect(used.status, used.text).toBeLessThan(300);
    const templateId = (JSON.parse(used.text) as { data: { id: string } }).data.id;
    templateIds.push(templateId);
    for (const ev of ['ticketing.order_paid', 'ticketing.event_changed']) {
      await flowWith(ev, {
        type: 'send_email',
        config: { subject: 'Z161 inline', html: '<p>Vstupenka</p>', priority: 'transactional' },
      });
      await flowWith(ev, {
        type: 'send_email',
        config: { templateId, subject: 'Objednávka {{first_name}}', priority: 'transactional' },
      });
      await flowWith(ev, {
        type: 'send_sms',
        config: { message: 'Vstupenka {{first_name}}', priority: 'transactional' },
      });
    }
    await flowWith(VX_EVENT, {
      type: 'send_email',
      config: { subject: 'Z161 vx', html: '<p>Prohlédli jste si</p>' },
    });
    // Other active flows of the seed org that would answer these events too.
    const [others] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM workflows
      WHERE org_id = ${seed.id} AND status = 'active' AND trigger_type = 'api_event'
        AND deleted_at IS NULL AND NOT (id = ANY(${workflowIds}))
        AND (coalesce(trigger_config->>'eventName', '') = ''
             OR trigger_config->>'eventName' ILIKE 'ticketing.%')
    `;
    report.otherListeningFlows = others!.n;
    console.log(`[pkt] seed org before: ${JSON.stringify(orgBefore)}; other flows ${others!.n}`);
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
    for (const j of await mtaQueues.other.getJobs(ALL, 0, 10_000)) {
      if (j?.data?.toEmail?.toLowerCase().endsWith(`-${tag}@test.local`))
        await j.remove().catch(() => {});
    }
    if (workflowIds.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${workflowIds})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${workflowIds})`;
    }
    await sql`DELETE FROM email_events WHERE org_id = ${seed.id} AND lower(recipient) LIKE ${`%-${tag}@test.local`}`;
    if (contactIds.length) {
      await sql`DELETE FROM workflow_runs WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM sms_send_log WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    if (templateIds.length) await sql`DELETE FROM templates WHERE id = ANY(${templateIds})`;
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND lower(email) LIKE ${`%-${tag}@test.local`}`;
    await sql`DELETE FROM sms_routes WHERE org_id = ${seed.id} AND provider = ${sinkProvider}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${seed.id} AND created_at >= ${startedAt}`;
    await sql`DELETE FROM api_keys WHERE name = ANY(${[`integration pkt-${tag}`, `integration pkt-pub-${tag}`]})`;
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
    console.log(`Z161_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    // The seed org exactly as this file found it, the fingerprint rows included.
    expect(orgAfter).toEqual(orgBefore);
    expect(orgAfter.hash_rows).toBe(orgBefore.hash_rows);
  }, 300_000);

  // The cells are measured first and asserted after, so a red run still
  // records every number (Z161_CELLS_JSON).
  const got = {} as Record<string, Record<State, Cell>>;
  const vi403 = {} as Record<string, { status: number; text: string }>;

  it('measures every cell', async () => {
    for (const ev of ['ticketing.order_paid', 'ticketing.event_changed']) {
      got[`V ${ev}`] = await walk('V', ev);
      got[`S ${ev}`] = await walk('S', ev);
      got[`I ${ev}`] = await walk('I', ev);
    }
    got["V' Ticketing.Order_Paid"] = await walk("V'", 'Ticketing.Order_Paid');
    got[`VX ${VX_EVENT}`] = await walk('VX', VX_EVENT);
    // The 403 for a contact that exists and one that does not.
    const existing = contactIds[0]!;
    vi403.existing = await call(publicKey, 'POST', '/api/v1/events', {
      contactId: existing,
      eventName: 'ticketing.order_paid',
    });
    vi403.missing = await call(publicKey, 'POST', '/api/v1/events', {
      contactId: randomUUID(),
      eventName: 'ticketing.order_paid',
    });
    // Probe 2: the ingest with the publishable key.
    vi403.ingest = await call(publicKey, 'POST', '/api/v1/ticketing/events', {
      type: 'order_paid',
      contact: { email: `pkt-vi-${tag}@test.local` },
    });
    const [viContact] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM contacts WHERE email = ${`pkt-vi-${tag}@test.local`}
    `;
    report.responses = { ...vi403, viContactCreated: viContact!.n };
    console.log(`[pkt] responses: ${JSON.stringify(report.responses)}`);
  }, 1_500_000);

  it.each(['ticketing.order_paid', 'ticketing.event_changed'])(
    'V — a publishable key with %s: 403, nothing stored, no run, nothing sent',
    (ev) => {
      for (const st of STATES) {
        const c = got[`V ${ev}`]![st];
        expect({ http: c.http, code: c.code }, `${st}: ${JSON.stringify(c)}`).toEqual({
          http: 403,
          code: 'EVENT_NAME_RESERVED',
        });
        expect(c, st).toMatchObject(NOTHING);
      }
    },
  );

  it("V' — Ticketing.Order_Paid from a publishable key: 403 as well", () => {
    for (const st of STATES) {
      const c = got["V' Ticketing.Order_Paid"]![st];
      expect({ http: c.http, code: c.code }, st).toEqual({
        http: 403,
        code: 'EVENT_NAME_RESERVED',
      });
      expect(c, st).toMatchObject(NOTHING);
    }
  });

  it('the 403 is the same for a contact that exists and one that does not', () => {
    expect(vi403.existing!.status).toBe(403);
    expect(vi403.missing!.text).toBe(vi403.existing!.text);
  });

  it.each([
    ['S', 'ticketing.order_paid'],
    ['S', 'ticketing.event_changed'],
    ['I', 'ticketing.order_paid'],
    ['I', 'ticketing.event_changed'],
  ])('control %s %s — unchanged: every transactional node reaches every state', (path, ev) => {
    for (const st of STATES) {
      const c = got[`${path} ${ev}`]![st];
      expect(c.http, `${st}: ${JSON.stringify(c)}`).toBe(path === 'I' ? 202 : 200);
      expect(c.runs, st).toEqual({ completed: 3 });
      expect(c.engineInline, `${st}: ${c.mta}`).toBe(1);
      expect(c.engineTemplate, `${st}: ${c.batch} ${c.mta}`).toBe(1);
      expect(c.smsReached, `${st}: ${c.smsJob}`).toBe(true);
    }
  });

  it('control VX — a publishable key with another event: unchanged (marketing node)', () => {
    const cells = got[`VX ${VX_EVENT}`]!;
    for (const st of STATES) {
      expect(cells[st].http, `${st}: ${JSON.stringify(cells[st])}`).toBe(200);
      expect(cells[st].runs, st).toEqual({ completed: 1 });
    }
    expect(cells.active.engineVx).toBe(1);
    expect(cells.non_subscribed.engineVx).toBe(1);
    for (const st of ['unsubscribed', 'pending', 'complained'] as State[]) {
      expect(cells[st].engineVx, `${st}: ${cells[st].emailJobs}`).toBe(0);
    }
  });

  it('VI — the ingest refuses a publishable key and creates nobody', () => {
    expect(vi403.ingest!.status, vi403.ingest!.text).toBe(403);
    expect((report.responses as { viContactCreated: number }).viContactCreated).toBe(0);
  });
});
