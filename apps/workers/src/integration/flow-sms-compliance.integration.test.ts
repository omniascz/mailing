/**
 * A flow's marketing SMS needs consent on the number, gets the opt-out suffix
 * and keeps the TCPA quiet hours — as an SMS campaign does (Z167).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * Michal, 14. 10. 22:10, point 4: "Marketingová SMS z flow: souhlas na čísle
 * (sms_consents), dovětek STOP a noční klid jako SMS kampaň." On master
 * routedSmsSend ran checkSmsCompliance only for `campaignId || workflowId`, and
 * a flow's SMS job carries workflowRunId and never workflowId — so a flow's
 * marketing SMS reached a number with no sms_consents row, or with a revoked
 * one. It now gets the very call an SMS campaign gets. A flow's transactional
 * SMS (priority 'transactional' on a trigger of the closed list) is unchanged.
 *
 * Z162 MIMO 4: a send_sms node with priority 'transactional' on a trigger
 * outside the closed list passed the organisation's quiet hours (the frequency
 * cap exempts 'transactional'). It is marketing, so it now waits like one.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Real chains: POST /api/v1/events (secret key) or POST /checkout-started
 * (publishable key) → onApiEvent → executor → the 'sms' queue → the real
 * workflow-sms worker in this process → the real POST /internal/workflow/
 * send-sms → the real routedSmsSend. An SMS campaign goes POST /campaigns →
 * /send → the same queue and worker. Consent is made by the real
 * POST /api/v1/sms/consents and revoked by the real DELETE
 * /api/v1/sms/consents/:phone (the STOP keyword arrives by the Twilio webhook,
 * whose signature this job's API has no token for — that path is walked in the
 * API suite, flow-sms-stop-keyword). The organisation's quiet hours are set by
 * the real PUT /api/v1/quiet-hours and put back as found.
 *
 * Stubbed: nothing in this process. SMS goes to a catch-all route whose
 * provider does not exist: "Unknown SMS provider" means past every gate, and
 * no SMS leaves the machine (as Z155/Z166). The worker drops the API's 502
 * body, so each settled SMS job's data is posted again to read why ("replay").
 * The text on the adapter (the opt-out suffix) is not visible here — the sink
 * throws before an adapter exists; routing.flow-compliance.test.ts sees it.
 *
 *   F   marketing SMS of a flow: send_sms without priority, the SMS review
 *       request, send_sms with priority 'transactional' on a trigger outside
 *       the list, abandoned-cart-sms-cascade s1 (the shipped template);
 *   T   transactional SMS of a flow: ticketing.order_paid send_sms with the
 *       priority, the seeded Day-of SMS (ticketing.day_of_sms);
 *   K   no flow: an SMS campaign, POST /messaging/send, POST /transactional/sms;
 *   Q   the organisation's quiet hours on the SMS channel (Z162 MIMO 4);
 *   R   one run, a marketing SMS to a number without consent, then a
 *       transactional one.
 *
 * Each cell is logged as `[z167] …` and the whole table once as
 * `Z167_CELLS_JSON {…}` at the end, for the report.
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers; the US night is whatever the clock says when CI runs (the
 *   expectation reads New York's hour at the send, nothing is moved).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue, type JobType, type Worker } from 'bullmq';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { startWorkflowSmsWorker } from '../jobs/workflow-sms-sender.js';
import { connection } from '../queues/index.js';

const API = process.env.API_URL!;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET! };
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `z167-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const sinkProvider = `z167-sink-${tag}`;
const SMS_REACHED = `Unknown SMS provider: ${sinkProvider}`;
const CONSENT_CONTEXT = `z167-${tag}`;
const PROPS = { eventTitle: 'Hamlet', ticket_url: 'https://tix.example/z167' };
const ALL: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
  'failed',
];

type Who =
  | 'cz_consent'
  | 'cz_none'
  | 'cz_revoked'
  | 'us_consent'
  | 'unsub_consent'
  | 'nonsub_consent';
const EVERYONE: Who[] = [
  'cz_consent',
  'cz_none',
  'cz_revoked',
  'us_consent',
  'unsub_consent',
  'nonsub_consent',
];

/** New York's hour now — the TCPA window checkSmsCompliance reads (8–21). */
function usHour(at = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }).format(at),
    10,
  );
}
const usNight = (h: number) => h < 8 || h >= 21;

/** A flow's marketing SMS — and an SMS campaign — as Michal decided (Z167). */
function marketingExpect(night: boolean): Record<Who, string> {
  return {
    cz_consent: 'reached',
    cz_none: 'SMS_COMPLIANCE_BLOCKED',
    cz_revoked: 'SMS_COMPLIANCE_BLOCKED',
    us_consent: night ? 'SMS_QUIET_HOURS' : 'reached',
    // The contact-state gate stays first: consent on the number does not
    // override the contact.
    unsub_consent: 'MARKETING_REFUSED',
    nonsub_consent: 'MARKETING_REFUSED',
  };
}
/** A transactional SMS of a flow on the closed list: everyone here (Z158). */
const T_EXPECT: Record<Who, string> = {
  cz_consent: 'reached',
  cz_none: 'reached',
  cz_revoked: 'reached',
  us_consent: 'reached',
  unsub_consent: 'reached',
  nonsub_consent: 'reached',
};

let seed: SeedOrg;
let token: string;
let startedAt: Date;
let countersBefore: { period_start: Date; sends: number }[] = [];
let orgBefore: Record<string, unknown> = {};
let templatesBefore = new Set<string>();
interface QuietRow {
  id: string;
  channel: string;
  start_hour: number;
  end_hour: number;
  timezone: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}
let quietBefore: QuietRow[] = [];
let othersDeactivated: string[] = [];
let seededHere: string[] = [];
/** The Day-of SMS's status before this file, when it was not seeded here. */
let daySmsStatusBefore: string | null = null;
const workers: Worker[] = [];
const smsQ = new Queue('sms', { connection });
const emailQ = new Queue('email', { connection });
const contactIds: string[] = [];
const workflowIds: string[] = [];
const campaignIds: string[] = [];
const listIds: string[] = [];
const apiKeyNames: string[] = [];
const flows = {} as Record<string, string>;
/** Everything measured, printed once as Z167_CELLS_JSON. */
const report: Record<string, unknown> = {
  tag,
  mock:
    'nothing in this process; SMS ends at a route whose provider does not exist ("Unknown SMS ' +
    'provider" = past every gate); the replay re-posts the settled job to read the code',
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
 * A publishable key of this file, written the way createApiKey writes one,
 * handed out only once its row exists. Only the checkout script uses it here.
 */
let pubKey = '';
async function publishable(): Promise<string> {
  if (pubKey) return pubKey;
  const raw = `fm_pub_${randomBytes(24).toString('hex')}`;
  const name = `integration z167-pub-${tag}`;
  const [owner] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email = ${SEED_LOGIN.email} LIMIT 1
  `;
  await sql`
    INSERT INTO api_keys (org_id, user_id, name, key_hash, key_prefix, is_public)
    VALUES (${seed.id}, ${owner!.id}, ${name},
            ${createHash('sha256').update(raw).digest('hex')}, ${raw.slice(0, 12)}, true)
  `;
  apiKeyNames.push(name);
  pubKey = raw;
  return pubKey;
}

interface Person {
  key: string;
  who: Who;
  id: string;
  email: string;
  phone: string;
  made: string;
}
let serial = 0;

/** A contact of the seed org; its number's consent made by the real API. */
async function person(who: Who, prefix: string): Promise<Person> {
  const n = ++serial;
  const email = `${prefix}-${who.replace(/_/g, '')}-${n}-${tag}@test.local`;
  const rand = Math.floor(Math.random() * 7_000);
  const phone = who.startsWith('us_')
    ? `+1212${String(2_000_000 + n * 7919 + rand)}`
    : `+4207${String(10_000_000 + n * 7919 + rand)}`;
  const status =
    who === 'unsub_consent'
      ? 'unsubscribed'
      : who === 'nonsub_consent'
        ? 'non_subscribed'
        : 'active';
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, phone, first_name, status)
    VALUES (${seed.id}, ${email}, ${phone}, 'Petra', ${status}) RETURNING id
  `;
  const p: Person = { key: `${who}#${n}`, who, id: c!.id, email, phone, made: `INSERT ${status}` };
  contactIds.push(p.id);
  if (who !== 'cz_none') {
    const r = await call('POST', '/api/v1/sms/consents', {
      phone,
      contactId: p.id,
      consentSource: 'api',
      consentContext: CONSENT_CONTEXT,
    });
    expect(r.status, r.text).toBe(201);
    p.made += `; POST /sms/consents ${r.status}`;
  }
  if (who === 'cz_revoked') {
    const r = await call('DELETE', `/api/v1/sms/consents/${encodeURIComponent(phone)}`);
    expect(r.status, r.text).toBe(204);
    const [row] = await sql<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM sms_consents WHERE org_id = ${seed.id} AND phone = ${phone}
    `;
    expect(row?.revoked_at, 'the consent is revoked').toBeTruthy();
    p.made += `; DELETE /sms/consents ${r.status} → revoked_at set`;
  }
  return p;
}

const people = (prefix: string, whos: Who[] = EVERYONE) =>
  Promise.all(whos.map((w) => person(w, prefix)));

interface WfNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
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
    VALUES (${seed.id}, ${`z167 ${eventName} ${tag}`}, 'inactive', 'api_event',
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

/** Post a settled SMS job's data to the route again: the code the worker drops. */
async function replay(data: unknown): Promise<string> {
  const r = await fetch(`${API}/api/v1/internal/workflow/send-sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...INTERNAL },
    body: JSON.stringify(data),
  });
  return `replay ${r.status} ${await r.text()}`;
}

/**
 * The SMS jobs matching `pick` once settled: "state attempts=n returnvalue |
 * replay …". 'no job' when none appeared within `appearMs`.
 */
async function settled(
  pick: (d: Record<string, unknown>) => boolean | Promise<boolean>,
  appearMs = 20_000,
): Promise<string> {
  const appear = Date.now() + appearMs;
  for (const deadline = Date.now() + 120_000; Date.now() < deadline; ) {
    const all = await smsQ.getJobs(ALL, 0, 10_000);
    const jobs = [];
    for (const j of all) if (j?.data && (await pick(j.data))) jobs.push(j);
    if (!jobs.length && Date.now() > appear) return 'no job';
    const states = await Promise.all(jobs.map((j) => j.getState()));
    if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
      const out: string[] = [];
      for (const stale of jobs) {
        const j = (await smsQ.getJob(stale.id!)) ?? stale;
        out.push(
          `${await j.getState()} attempts=${j.attemptsMade} ${JSON.stringify(j.returnvalue)}`,
        );
        out.push(await replay(j.data));
      }
      return out.join(' | ');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'did not settle';
}

const flowJob =
  (workflowId: string, contactId: string, nodeId?: string) => async (d: Record<string, unknown>) =>
    d.contactId === contactId &&
    (await runIdsOf(workflowId, contactId)).includes(String(d.workflowRunId)) &&
    (nodeId === undefined || d.nodeId === undefined || d.nodeId === nodeId);

/** What the cell came to: 'reached', the gate's code, or the job line. */
function outcome(job: string): string {
  if (job.includes(SMS_REACHED)) return 'reached';
  const code = /"code":"([A-Z_]+)"/.exec(job)?.[1];
  return code ?? job.slice(0, 80);
}

interface Cell {
  made: string;
  trigger: string;
  job: string;
  outcome: string;
  reached: boolean;
  run: string;
  usHourAtSend?: number;
}
type Cells = Record<string, Cell>;

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

async function runOf(workflowId: string, contactId: string) {
  const rows = await sql<
    { status: string; current_node_id: string | null; next_execution_at: Date | null }[]
  >`
    SELECT status, current_node_id, next_execution_at FROM workflow_runs
    WHERE workflow_id = ${workflowId} AND contact_id = ${contactId}
  `;
  return rows;
}

/** Start `workflowId` for everyone with `fire`, shorten `waits`, follow node `node`. */
async function walk(opts: {
  label: string;
  workflowId: string;
  people: Person[];
  fire: (p: Person) => Promise<{ status: number; text: string }>;
  waits?: string[];
  node: string;
}): Promise<Cells> {
  const { label, workflowId, node } = opts;
  await onlyActive(workflowId);
  const trigger: Record<string, string> = {};
  await Promise.all(
    opts.people.map(async (p) => {
      const r = await opts.fire(p);
      trigger[p.key] = `${r.status}${r.status >= 300 ? ` ${r.text.slice(0, 160)}` : ''}`;
    }),
  );
  const ids = opts.people.map((p) => p.id);
  for (const w of opts.waits ?? [])
    report[`${label}.advanced.${w}`] = await advance(workflowId, ids, w);
  const cells: Cells = {};
  await Promise.all(
    opts.people.map(async (p) => {
      const job = await settled(flowJob(workflowId, p.id, node));
      const runs = await runOf(workflowId, p.id);
      cells[p.key] = {
        made: p.made,
        trigger: trigger[p.key]!,
        job,
        outcome: outcome(job),
        reached: job.includes(SMS_REACHED),
        run: runs.map((r) => `${r.status}@${r.current_node_id}`).join(',') || 'no run',
        usHourAtSend: usHour(),
      };
      console.log(
        `[z167] ${label} ${p.key}: trigger=${trigger[p.key]} outcome=${cells[p.key]!.outcome} ` +
          `run=${cells[p.key]!.run} job=${job} | ${p.made}`,
      );
    }),
  );
  report[label] = cells;
  return cells;
}

const outcomeByWho = (cells: Cells) =>
  Object.fromEntries(
    Object.entries(cells).map(([key, c]) => [key.split('#')[0], c.outcome]),
  ) as Record<Who, string>;
const nightOf = (cells: Cells) =>
  Object.values(cells).some((c) => usNight(c.usHourAtSend ?? usHour()));

const byEvent =
  (eventName: string, properties: Record<string, unknown> = {}) =>
  (p: Person) =>
    call('POST', '/api/v1/events', { contactId: p.id, eventName, properties });

/** The seed org as a whole: what this file must leave as it found it. */
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
           (SELECT count(*)::int FROM workflow_events WHERE org_id = o.id) AS workflow_events,
           (SELECT count(*)::int FROM templates WHERE org_id = o.id) AS templates,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM review_requests WHERE org_id = o.id) AS review_requests,
           (SELECT count(*)::int FROM sms_routes WHERE org_id = o.id) AS sms_routes,
           (SELECT count(*)::int FROM sms_consents WHERE org_id = o.id) AS sms_consents,
           (SELECT count(*)::int FROM sms_send_log WHERE org_id = o.id) AS sms_send_log,
           (SELECT count(*)::int FROM frequency_suppressions WHERE org_id = o.id) AS frequency_suppressions,
           (SELECT COALESCE(json_agg(json_build_object('channel', q.channel, 'start', q.start_hour,
                    'end', q.end_hour, 'tz', q.timezone, 'enabled', q.enabled) ORDER BY q.channel), '[]'::json)
              FROM quiet_hours q WHERE q.org_id = o.id) AS quiet_hours,
           (SELECT count(*)::int FROM sending_domains WHERE org_id = o.id) AS sending_domains,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

/** An SMS campaign to a list of these people, through the real worker. */
async function smsCampaign(label: string, list: Person[]): Promise<Cells> {
  const [l] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`z167 ${label} ${tag}`}) RETURNING id
  `;
  listIds.push(l!.id);
  for (const p of list) {
    await sql`
      INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${p.id}, ${l!.id}, now())
    `;
  }
  const created = await call('POST', '/api/v1/campaigns', {
    name: `z167 ${label} ${tag}`,
    type: 'sms',
    listId: l!.id,
    // validateCampaignReadiness asks an SMS campaign for these too.
    subject: `SMS ${label}`,
    fromName: 'Obchod',
    fromEmail,
    content: { body: `Akce ${label}` },
  });
  expect(created.status, created.text).toBeLessThan(300);
  const campaignId = (JSON.parse(created.text) as { data: { id: string } }).data.id;
  campaignIds.push(campaignId);
  const send = await call('POST', `/api/v1/campaigns/${campaignId}/send`, {
    acknowledgeDeliverabilityRisk: true,
  });
  expect(send.status, send.text).toBe(200);
  report[`${label}.send`] = `${send.status} ${send.text.slice(0, 200)}`;
  const cells: Cells = {};
  await Promise.all(
    list.map(async (p) => {
      const job = await settled((d) => d.campaignId === campaignId && d.contactId === p.id, 8_000);
      cells[p.key] = {
        made: p.made,
        trigger: `campaign ${send.status}`,
        job,
        outcome: job === 'no job' ? 'not enqueued' : outcome(job),
        reached: job.includes(SMS_REACHED),
        run: '-',
        usHourAtSend: usHour(),
      };
      console.log(`[z167] ${label} ${p.key}: outcome=${cells[p.key]!.outcome} job=${job}`);
    }),
  );
  report[label] = cells;
  return cells;
}

describe("a flow's marketing SMS: consent on the number, opt-out suffix and quiet hours, as an SMS campaign (Z167)", () => {
  beforeAll(async () => {
    startedAt = new Date();
    seed = await readSeedOrg(sql);
    orgBefore = await orgState();
    token = await seedApiKey(sql, `z167-${tag}`);
    apiKeyNames.push(`integration z167-${tag}`);
    // Owner, so the key can set quiet hours, fork and send campaigns.
    await sql`
      UPDATE api_keys SET role = 'owner'
      WHERE key_hash = ${createHash('sha256').update(token).digest('hex')}
    `;
    countersBefore = await sql`
      SELECT period_start, sends FROM plan_send_counters WHERE org_id = ${seed.id}
    `;
    quietBefore = await sql<QuietRow[]>`
      SELECT id, channel, start_hour, end_hour, timezone, enabled, created_at, updated_at
      FROM quiet_hours WHERE org_id = ${seed.id}
    `;
    const tpl = await sql<{ id: string }[]>`SELECT id FROM templates WHERE org_id = ${seed.id}`;
    templatesBefore = new Set(tpl.map((t) => t.id));
    // Anything of the seed org an event or a basket would start besides this
    // file's flows is set inactive for the file and put back.
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

    const ev = (k: string) => `z167-${k}-${tag}`;
    flows.fSms = await flowOf(ev('sms'), [
      { id: 'send', type: 'send_sms', config: { message: 'Akce {{first_name}}' } },
    ]);
    flows.fReview = await flowOf(ev('review'), [
      {
        id: 'send',
        type: 'send_review_request',
        config: { channel: 'sms', message: 'Jak se líbilo? {{review_url}}' },
      },
    ]);
    flows.fTxOff = await flowOf(ev('txoff'), [
      {
        id: 'send',
        type: 'send_sms',
        config: { message: 'Info {{first_name}}', priority: 'transactional' },
      },
    ]);
    flows.tSms = await flowOf('ticketing.order_paid', [
      {
        id: 'send',
        type: 'send_sms',
        config: { message: 'Vstupenka {{first_name}}', priority: 'transactional' },
      },
    ]);
    flows.rMixed = await flowOf('ticketing.order_paid', [
      { id: 'm', type: 'send_sms', config: { message: 'Akce {{first_name}}' } },
      {
        id: 't',
        type: 'send_sms',
        config: { message: 'Vstupenka {{first_name}}', priority: 'transactional' },
      },
    ]);
    flows.qNone = await flowOf(ev('qnone'), [
      { id: 'send', type: 'send_sms', config: { message: 'Akce {{first_name}}' } },
    ]);

    // The shipped Email → SMS cascade, forked the way the gallery does.
    const fork = await call('POST', '/api/v1/workflow-templates/abandoned-cart-sms-cascade/fork', {
      name: `z167 ac ${tag}`,
    });
    expect(fork.status, fork.text).toBe(201);
    const forked = (JSON.parse(fork.text) as { data: { id: string; nodes: WfNode[] } }).data;
    workflowIds.push(forked.id);
    flows.ac = forked.id;
    report.acNodes = forked.nodes.map((n) => `${n.id}:${n.type}`);

    // The ticketing seeds exactly as a customer gets them.
    const seeded = await call('POST', '/api/v1/ticketing/seed-workflows');
    expect(seeded.status, seeded.text).toBe(200);
    const created = (JSON.parse(seeded.text) as { data: { created: string[] } }).data.created;
    const allSeeded = await sql<
      { id: string; name: string; status: string; description: string | null }[]
    >`
      SELECT id, name, status, description FROM workflows
      WHERE org_id = ${seed.id} AND name LIKE 'Ticketing — %' AND deleted_at IS NULL
    `;
    seededHere = allSeeded
      .filter((r) => created.some((k) => r.description?.includes(`(${k})`)))
      .map((r) => r.id);
    const day = allSeeded.find((r) => r.name === 'Ticketing — Day-of SMS (ticket QR)');
    expect(day, 'the seeded Day-of SMS').toBeTruthy();
    flows.daySms = day!.id;
    // One that was there before takes part in onlyActive and gets its own
    // status back at the end; only what was seeded here is deleted.
    if (!seededHere.includes(day!.id)) daySmsStatusBefore = day!.status;
    workflowIds.push(...seededHere);
    if (!workflowIds.includes(day!.id)) workflowIds.push(day!.id);
    report.seededHere = seededHere.length;
    report.daySmsStatusBefore = daySmsStatusBefore;

    workers.push(startWorkflowSmsWorker());
    console.log(`[z167] seed org before: ${JSON.stringify(orgBefore)}`);
  }, 180_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    const mine = `%-${tag}@test.local`;
    const found = await sql<{ id: string }[]>`
      SELECT id FROM contacts
      WHERE org_id = ${seed.id} AND (id = ANY(${contactIds}) OR email LIKE ${mine})
    `;
    const ids = [...new Set([...contactIds, ...found.map((p) => p.id)])];

    const runRows = workflowIds.length
      ? await sql<{ status: string; n: number }[]>`
          SELECT status, count(*)::int AS n FROM workflow_runs
          WHERE workflow_id = ANY(${workflowIds}) AND contact_id = ANY(${ids})
          GROUP BY status ORDER BY status
        `
      : [];
    const jobs: Record<string, Record<string, number>> = {};
    for (const [name, q] of Object.entries({ sms: smsQ, email: emailQ })) {
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

    // The quiet hours as this file found them, whatever happened in Q.
    await restoreQuiet();
    const own = workflowIds.filter((id) => id !== flows.daySms || seededHere.includes(id));
    if (workflowIds.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${workflowIds}) AND contact_id = ANY(${ids})`;
    }
    if (own.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${own})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${own})`;
    }
    if (daySmsStatusBefore !== null) {
      await sql`UPDATE workflows SET status = ${daySmsStatusBefore} WHERE id = ${flows.daySms!}`;
    }
    if (othersDeactivated.length) {
      await sql`UPDATE workflows SET status = 'active' WHERE id = ANY(${othersDeactivated})`;
    }
    if (campaignIds.length) {
      await sql`DELETE FROM audit_logs WHERE resource_id = ANY(${campaignIds.map(String)})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${campaignIds})`;
    }
    if (ids.length) {
      await sql`DELETE FROM review_requests WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM workflow_runs WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM sms_send_log WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM frequency_suppressions WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_engagement WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM sms_consents WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    const tpl = await sql<{ id: string }[]>`SELECT id FROM templates WHERE org_id = ${seed.id}`;
    const madeHere = tpl.map((t) => t.id).filter((id) => !templatesBefore.has(id));
    if (madeHere.length) await sql`DELETE FROM templates WHERE id = ANY(${madeHere})`;
    await sql`DELETE FROM sms_consents WHERE org_id = ${seed.id} AND consent_context = ${CONSENT_CONTEXT}`;
    await sql`DELETE FROM sms_send_log WHERE org_id = ${seed.id} AND provider = ${sinkProvider}`;
    await sql`DELETE FROM sms_routes WHERE org_id = ${seed.id} AND provider = ${sinkProvider}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${seed.id} AND created_at >= ${startedAt}`;
    await sql`DELETE FROM api_keys WHERE name = ANY(${apiKeyNames})`;
    await sql`DELETE FROM plan_send_counters WHERE org_id = ${seed.id}`;
    for (const c of countersBefore) {
      await sql`
        INSERT INTO plan_send_counters (org_id, period_start, sends)
        VALUES (${seed.id}, ${c.period_start}, ${c.sends})
      `;
    }
    const orgAfter = await orgState();
    report.seedOrg = { before: orgBefore, after: orgAfter };
    console.log(`Z167_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    // The seed org exactly as this file found it — a snapshot, not zeros:
    // suppressions (fingerprint rows included), sms_consents, quiet_hours,
    // counters, contacts, flows, runs, templates, campaigns, keys.
    expect(orgAfter).toEqual(orgBefore);
  }, 300_000);

  /** quiet_hours of the seed org back to the rows found in beforeAll. */
  async function restoreQuiet() {
    await sql`DELETE FROM quiet_hours WHERE org_id = ${seed.id}`;
    for (const q of quietBefore) {
      await sql`
        INSERT INTO quiet_hours (id, org_id, channel, start_hour, end_hour, timezone, enabled, created_at, updated_at)
        VALUES (${q.id}, ${seed.id}, ${q.channel}, ${q.start_hour}, ${q.end_hour}, ${q.timezone},
                ${q.enabled}, ${q.created_at}, ${q.updated_at})
      `;
    }
  }

  // ── F: marketing SMS of a flow ────────────────────────────────────────────

  it.each([
    ['F send_sms', 'fSms', 'sms'],
    ['F review request (SMS)', 'fReview', 'review'],
    ['F transactional priority off the list', 'fTxOff', 'txoff'],
  ] as const)(
    '%s — needs consent on the number; US gets the TCPA window; the contact-state gate stays first',
    async (label, key, ev) => {
      const cells = await walk({
        label,
        workflowId: flows[key]!,
        people: await people(`z167${ev}`),
        fire: byEvent(`z167-${ev}-${tag}`),
        node: 'send',
      });
      expect(outcomeByWho(cells), JSON.stringify(cells)).toEqual(marketingExpect(nightOf(cells)));
      // A blocked SMS ends the job, not the run (the executor enqueued it).
      for (const c of Object.values(cells)) expect(c.run, JSON.stringify(c)).toMatch(/^completed@/);
    },
    600_000,
  );

  it('F abandoned-cart-sms-cascade s1 — the shipped template, the checkout script, both waits shortened', async () => {
    const list = await people('z167ac', ['cz_consent', 'cz_none']);
    const cells = await walk({
      label: 'F abandoned-cart-sms-cascade',
      workflowId: flows.ac!,
      people: list,
      fire: async (p) =>
        call(
          'POST',
          '/api/v1/checkout-started',
          {
            email: p.email,
            cartId: `z167-cart-${randomUUID()}`,
            amount: 499,
            currency: 'CZK',
            itemCount: 2,
            recoveryUrl: 'https://z167.example.com/cart',
          },
          await publishable(),
        ),
      waits: ['w0', 'w1'],
      node: 's1',
    });
    // Whatever c1 decides, a marketing SMS never reaches a number without consent.
    const none = Object.entries(cells).find(([k]) => k.startsWith('cz_none#'))![1];
    expect(none.reached, JSON.stringify(none)).toBe(false);
  }, 600_000);

  // ── T: the transactional SMS of a flow, unchanged ─────────────────────────

  it.each([
    ['T ticketing.order_paid send_sms (priority)', 'tSms', 'ticketing.order_paid'],
    ['T seeded Day-of SMS', 'daySms', 'ticketing.day_of_sms'],
  ] as const)(
    '%s — reaches everyone here: no consent on the number, no quiet hours',
    async (label, key, eventName) => {
      const cells = await walk({
        label,
        workflowId: flows[key]!,
        people: await people(`z167${key.toLowerCase()}`),
        fire: byEvent(eventName, PROPS),
        node: 'send',
      });
      expect(outcomeByWho(cells), JSON.stringify(cells)).toEqual(T_EXPECT);
    },
    600_000,
  );

  // ── R: one run, the marketing SMS blocked, the transactional one sent ────

  it('R — a blocked marketing SMS neither fails the run nor stops its transactional SMS', async () => {
    await onlyActive(flows.rMixed!);
    const p = await person('cz_none', 'z167r');
    const r = await byEvent('ticketing.order_paid', PROPS)(p);
    expect(r.status, r.text).toBeLessThan(300);
    const m = await settled(flowJob(flows.rMixed!, p.id, 'm'));
    const t = await settled(flowJob(flows.rMixed!, p.id, 't'));
    const run = await runOf(flows.rMixed!, p.id);
    report.R = { made: p.made, m, t, mOutcome: outcome(m), tOutcome: outcome(t), run };
    console.log(`[z167] R ${p.key}: ${JSON.stringify(report.R)}`);
    expect(outcome(m)).toBe('SMS_COMPLIANCE_BLOCKED');
    expect(outcome(t)).toBe('reached');
    expect(run.map((x) => x.status)).toEqual(['completed']);
  }, 600_000);

  // ── K: no flow — the same on master and the branch ───────────────────────

  it('K SMS campaign — consent on the number and the TCPA window, as before', async () => {
    const cells = await smsCampaign('K sms campaign', await people('z167kc'));
    const expected = {
      ...marketingExpect(nightOf(cells)),
      // A channel campaign's audience leaves them out.
      unsub_consent: 'not enqueued',
      nonsub_consent: 'not enqueued',
    };
    expect(outcomeByWho(cells), JSON.stringify(cells)).toEqual(expected);
  }, 600_000);

  it('K POST /messaging/send and POST /transactional/sms — no contact, no consent read (unchanged)', async () => {
    const list = await people('z167kd', ['cz_consent', 'cz_none', 'cz_revoked', 'us_consent']);
    const out: Record<string, string> = {};
    for (const p of list) {
      const m = await call('POST', '/api/v1/messaging/send', {
        channel: 'sms',
        payload: { to: p.phone, text: 'Kód 1234' },
      });
      const t = await call('POST', '/api/v1/transactional/sms', { to: p.phone, text: 'Kód 1234' });
      out[p.key] =
        `messaging ${m.status} ${m.text.includes(SMS_REACHED) ? 'reached' : m.text.slice(0, 120)}` +
        ` | transactional ${t.status} ${t.text.includes(SMS_REACHED) ? 'reached' : t.text.slice(0, 120)}`;
      console.log(`[z167] K direct ${p.key}: ${out[p.key]}`);
      expect(m.text, p.key).toContain(SMS_REACHED);
    }
    report['K direct'] = out;
  }, 600_000);

  // ── Q: the organisation's quiet hours (Z162 MIMO 4) ───────────────────────

  it("Q — a 'transactional' send_sms off the list waits for the org's quiet window; on the list it does not", async () => {
    const h = new Date().getUTCHours();
    const window = { channel: 'sms', startHour: h, endHour: (h + 2) % 24, timezone: 'UTC' };
    try {
      const put = await call('PUT', '/api/v1/quiet-hours', { ...window, enabled: true });
      expect(put.status, put.text).toBe(200);
      const out: Record<string, unknown> = { window, put: put.status };
      const cases = [
        ['off the list, priority transactional', flows.fTxOff!, `z167-txoff-${tag}`],
        [
          'on the list (ticketing.order_paid), priority transactional',
          flows.tSms!,
          'ticketing.order_paid',
        ],
        ['no priority', flows.qNone!, `z167-qnone-${tag}`],
      ] as const;
      for (const [label, workflowId, eventName] of cases) {
        await onlyActive(workflowId);
        const p = await person('cz_consent', 'z167q');
        const r = await byEvent(eventName, PROPS)(p);
        expect(r.status, r.text).toBeLessThan(300);
        let run = await runOf(workflowId, p.id);
        for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
          run = await runOf(workflowId, p.id);
          if (run.length && run.every((x) => ['waiting', 'completed', 'failed'].includes(x.status)))
            break;
          await new Promise((res) => setTimeout(res, 250));
        }
        const job = await settled(flowJob(workflowId, p.id, 'send'));
        out[label] = {
          made: p.made,
          job,
          outcome: outcome(job),
          run: run.map((x) => ({
            status: x.status,
            node: x.current_node_id,
            next: x.next_execution_at ? new Date(x.next_execution_at).toISOString() : null,
          })),
        };
        console.log(`[z167] Q ${label}: ${JSON.stringify(out[label])}`);
      }
      report.Q = out;
      type QCell = {
        outcome: string;
        run: { status: string; node: string | null; next: string | null }[];
      };
      const off = out['off the list, priority transactional'] as QCell;
      const on = out['on the list (ticketing.order_paid), priority transactional'] as QCell;
      const none = out['no priority'] as QCell;
      // Parked on the node until the window ends, nothing queued.
      for (const c of [off, none]) {
        expect(c.outcome, JSON.stringify(c)).toBe('no job');
        expect(
          c.run.map((x) => `${x.status}@${x.node}`),
          JSON.stringify(c),
        ).toEqual(['waiting@send']);
        const next = new Date(c.run[0]!.next!);
        expect(next.getUTCHours(), JSON.stringify(c)).toBe(window.endHour);
        expect(next.getTime()).toBeGreaterThan(Date.now());
      }
      expect(on.outcome, JSON.stringify(on)).toBe('reached');
      expect(on.run.map((x) => x.status)).toEqual(['completed']);
    } finally {
      await restoreQuiet();
    }
  }, 600_000);
});
