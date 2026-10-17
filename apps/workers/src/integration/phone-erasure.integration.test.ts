/**
 * A number a GDPR erasure left the fingerprint of gets no campaign or flow
 * SMS and no WhatsApp, whatever contact holds it now and whatever consent lies
 * on it; the double opt-in confirmation of the erased address does not lift
 * it; a transactional SMS is unchanged (Z180).
 *
 * ─── What was wrong (measured on master d9dc522, Z179) ───────────────────────
 *
 * The erasure deleted the number without a trace. A contact made again with
 * the same number got the SMS campaign and the flow's marketing SMS — over a
 * consent the erasure never touched (no contact_id) or one the owner wrote
 * afterwards — and the WhatsApp campaign and flow went past marketingSkip. A
 * contact with a number and no address left no row at all.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * An organisation of this file: the seed user is its owner (a member row, then
 * POST /me/orgs/switch), and the owner's session mints the owner's key. Every
 * contact is made by POST /contacts, every consent by POST /sms/consents or
 * /whatsapp/consents, every erasure by POST /contacts/:id/anonymize, every
 * suppression by POST /suppressions, the DOI by POST /lists/:id/subscribe →
 * the token → POST /confirm/:token.
 *
 * Real chains: POST /api/v1/events → the executor → the 'sms' / 'whatsapp-send'
 * queue → the real worker in this process → (SMS) the real POST
 * /internal/workflow/send-sms → routedSmsSend; an SMS or WhatsApp campaign goes
 * POST /campaigns → /send → the same queues. Mock: none in this process. SMS
 * ends at a route whose provider does not exist ("Unknown SMS provider" = past
 * every gate, nothing leaves); WhatsApp is not configured in this process, so
 * 'skipped_unconfigured' = past marketingSkip, nothing leaves. The code of a
 * settled SMS job is read by re-posting its data to the internal route.
 *
 *   GS  K1 (e-mail + number), consent on the number with / without
 *       contact_id, erased; K2 made again with the number → SMS campaign and
 *       flow; then a new consent by the owner → again;
 *   GW  the same number → WhatsApp campaign and flow;
 *   GP  a contact with a number and no e-mail, erased; K2 → SMS;
 *   D   the erasure, then the DOI confirmation of the erased address: the
 *       rows and a marketing SMS to the number before / after;
 *   N   three spellings of the erased number on contacts made again;
 *   K   a flow's transactional SMS (ticketing.order_paid), a number never
 *       erased with and without consent, an ordinary 'manual' row of a number:
 *       as on master.
 *
 * Every cell is printed once as `Z180_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue, type JobType, type Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { redis } from '@forgemsg/shared/redis';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { startWorkflowSmsWorker } from '../jobs/workflow-sms-sender.js';
import { startWhatsappSenderWorker } from '../jobs/whatsapp-sender.js';
import { connection } from '../queues/index.js';

const API = process.env.API_URL!;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `z180-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const sinkProvider = `z180-sink-${tag}`;
const SMS_REACHED = `Unknown SMS provider: ${sinkProvider}`;
const CONSENT_CONTEXT = `z180-${tag}`;
const SMS_EVENT = `z180-sms-${tag}`;
const WA_EVENT = `z180-wa-${tag}`;
// Names this file gives, as LIKE patterns for the leftover check. Named, not
// written inline in the sql`` template: the statement check reads an inline
// template literal as composed SQL and cannot plan it.
const NAMED_LIKE = `z180 % ${tag}`;
const KEY_LIKE = `%z180%${tag}`;
const SEED_KEY_NAME = `integration z180-${tag}`;
// Valid CZ mobile numbers (Vodafone 777), so POST /contacts stores them E.164.
const PHONE_BASE = 420_777_000_000 + Math.floor(Math.random() * 800_000);
const ALL: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
  'failed',
];

let org = '';
let seedOrgId = '';
let seedKey = '';
let owner = '';
let ownerKey = '';
let hasPhoneHash = false;
let seedBefore: Record<string, unknown> = {};
const credentials: string[] = [];
const workers: Worker[] = [];
const smsQ = new Queue('sms', { connection });
const waQ = new Queue('whatsapp-send', { connection });
const flows: Record<string, string> = {};
const report: Record<string, unknown> = {
  tag,
  mock:
    'nothing in this process; SMS ends at a route whose provider does not exist ("Unknown SMS ' +
    'provider" = past every gate); WhatsApp unconfigured ("skipped_unconfigured" = past ' +
    'marketingSkip); the SMS replay re-posts the settled job to read the code',
};
let phones = 0;
const newPhone = () => `+${PHONE_BASE + ++phones * 7}`;
let emails = 0;
const newEmail = (label: string) => `z180-${label}-${++emails}-${tag}@test.local`;
const scrub = (s: string) =>
  s
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
    .replace(new RegExp(tag, 'g'), '<tag>');

async function call(method: string, path: string, credential: string | null, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(credential ? authHeaders(credential) : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, text: await res.text() };
}

async function ok(method: string, path: string, credential: string, body?: unknown) {
  const r = await call(method, path, credential, body);
  if (r.status >= 300)
    throw new Error(`[z180] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return r.text ? (JSON.parse(r.text) as { data: Record<string, unknown> }) : { data: {} };
}

interface Person {
  key: string;
  id: string;
  email: string | null;
  phone: string;
  stored: string | null;
  status: string;
}

/** A contact made by POST /contacts (the owner's key), read back from the row. */
async function contact(label: string, phone: string, withEmail = true): Promise<Person> {
  const email = withEmail ? newEmail(label) : null;
  const made = await ok('POST', '/api/v1/contacts', ownerKey, {
    ...(email ? { email } : {}),
    phone,
    firstName: 'Petra',
  });
  const id = String(made.data.id);
  const [row] = await sql<{ phone: string | null; status: string }[]>`
    SELECT phone, status FROM contacts WHERE id = ${id}
  `;
  return { key: label, id, email, phone, stored: row!.phone, status: row!.status };
}

async function smsConsent(phone: string, contactId?: string) {
  const r = await call('POST', '/api/v1/sms/consents', owner, {
    phone,
    ...(contactId ? { contactId } : {}),
    consentSource: 'api',
    consentContext: CONSENT_CONTEXT,
  });
  return r.status;
}

async function waConsent(phone: string, contactId?: string) {
  const r = await call('POST', '/api/v1/whatsapp/consents', owner, {
    phone,
    ...(contactId ? { contactId } : {}),
    consentSource: 'api',
    consentContext: CONSENT_CONTEXT,
  });
  return r.status;
}

async function erase(id: string) {
  const r = await call('POST', `/api/v1/contacts/${id}/anonymize`, owner, {});
  return r.status;
}

/**
 * The erasure rows of this organisation by kind, read by notes so the same
 * query runs on master (no phone_hash column there).
 */
async function erasureRows(): Promise<{ email: number; phone: number }> {
  const [r] = await sql<{ email: number; phone: number }[]>`
    SELECT count(*) FILTER (WHERE notes LIKE 'gdpr_anonymized:%')::int AS email,
           count(*) FILTER (WHERE notes LIKE 'gdpr_anonymized_phone:%')::int AS phone
    FROM suppressions WHERE org_id = ${org}
  `;
  return r!;
}

async function runIdsOf(workflowId: string, contactId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM workflow_runs WHERE workflow_id = ${workflowId} AND contact_id = ${contactId}
  `;
  return rows.map((r) => r.id);
}

async function replay(data: unknown): Promise<string> {
  const r = await fetch(`${API}/api/v1/internal/workflow/send-sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...INTERNAL },
    body: JSON.stringify(data),
  });
  return `replay ${r.status} ${await r.text()}`;
}

/** The jobs of `q` matching `pick` once settled; 'no job' when none appeared within `appearMs`. */
async function settled(
  q: Queue,
  pick: (d: Record<string, unknown>) => boolean | Promise<boolean>,
  appearMs = 20_000,
): Promise<{ line: string; phones: string[] }> {
  const appear = Date.now() + appearMs;
  for (const deadline = Date.now() + 120_000; Date.now() < deadline; ) {
    const all = await q.getJobs(ALL, 0, 10_000);
    const jobs = [];
    for (const j of all) if (j?.data && (await pick(j.data))) jobs.push(j);
    if (!jobs.length && Date.now() > appear) return { line: 'no job', phones: [] };
    const states = await Promise.all(jobs.map((j) => j.getState()));
    if (jobs.length && states.every((s) => s === 'completed' || s === 'failed')) {
      const out: string[] = [];
      for (const stale of jobs) {
        const j = (await q.getJob(stale.id!)) ?? stale;
        out.push(
          `${await j.getState()} attempts=${j.attemptsMade} ${JSON.stringify(j.returnvalue)}`,
        );
        if (q === smsQ) out.push(await replay(j.data));
      }
      return { line: out.join(' | '), phones: jobs.map((j) => String(j.data.phone)) };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { line: 'did not settle', phones: [] };
}

function outcome(line: string): string {
  if (line === 'no job') return 'not enqueued';
  if (line.includes(SMS_REACHED)) return 'reached';
  const code = /"code":"([A-Z_]+)"/.exec(line)?.[1];
  if (code) return code;
  const wa = /"status":"(skipped_[a-z_]+)"/.exec(line)?.[1];
  return wa ?? line.slice(0, 80);
}

/** 1 = past every gate (SMS at the sink, WhatsApp skipped_unconfigured), 0 = not. */
const sent = (o: string) => (o === 'reached' || o === 'skipped_unconfigured' ? 1 : 0);

const flowJob = (workflowId: string, contactId: string) => async (d: Record<string, unknown>) =>
  d.contactId === contactId &&
  (await runIdsOf(workflowId, contactId)).includes(String(d.workflowRunId));

async function flowOf(eventName: string, node: { type: string; config: Record<string, unknown> }) {
  const nodes = [
    { id: 'trigger', type: 'trigger', config: {} },
    { id: 'send', ...node },
  ];
  const edges = [{ id: 'e0', source: 'trigger', target: 'send' }];
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${org}, ${`z180 ${eventName} ${tag}`}, 'active', 'api_event',
            ${JSON.stringify({ eventName })}::jsonb, ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify(edges)}::jsonb)
    RETURNING id
  `;
  return w!.id;
}

interface Sent {
  outcome: string;
  sent: number;
  job: string;
  jobPhones: string[];
}

async function throughFlow(
  q: Queue,
  workflowId: string,
  eventName: string,
  p: Person,
): Promise<Sent & { event: number }> {
  const fired = await call('POST', '/api/v1/events', ownerKey, {
    contactId: p.id,
    eventName,
    properties: { eventTitle: 'Hamlet', ticket_url: 'https://tix.example/z180' },
  });
  const job = await settled(q, flowJob(workflowId, p.id));
  const o = outcome(job.line);
  return {
    event: fired.status,
    outcome: o,
    sent: sent(o),
    job: scrub(job.line),
    jobPhones: job.phones,
  };
}

let campaigns = 0;
/** A campaign of the owner's key to a list of these people; the outcome per person. */
async function campaign(type: 'sms' | 'whatsapp', list: Person[]): Promise<Record<string, Sent>> {
  const n = ++campaigns;
  const [l] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name) VALUES (${org}, ${`z180 ${type} ${n} ${tag}`}) RETURNING id
  `;
  for (const p of list) {
    await sql`
      INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${p.id}, ${l!.id}, now())
    `;
  }
  const created = await ok('POST', '/api/v1/campaigns', ownerKey, {
    name: `z180 ${type} ${n} ${tag}`,
    type,
    listId: l!.id,
    subject: `z180 ${type}`,
    fromName: 'Obchod',
    fromEmail,
    content:
      type === 'sms' ? { body: 'Akce z180' } : { templateId: 'z180_campaign', language: 'cs' },
  });
  const campaignId = String(created.data.id);
  const send = await call('POST', `/api/v1/campaigns/${campaignId}/send`, ownerKey, {
    acknowledgeDeliverabilityRisk: true,
  });
  expect(send.status, send.text).toBe(200);
  const q = type === 'sms' ? smsQ : waQ;
  const out: Record<string, Sent> = {};
  await Promise.all(
    list.map(async (p) => {
      const job = await settled(q, (d) => d.contactId === p.id, 8_000);
      const o = outcome(job.line);
      out[p.key] = { outcome: o, sent: sent(o), job: scrub(job.line), jobPhones: job.phones };
    }),
  );
  return out;
}

/** SMS campaign and SMS flow, each to its own contact made again with `phone`. */
async function smsBoth(label: string, phone: string) {
  const c = await contact(`${label}-c`, phone);
  const f = await contact(`${label}-f`, phone);
  const camp = (await campaign('sms', [c]))[c.key]!;
  const flow = await throughFlow(smsQ, flows.sms!, SMS_EVENT, f);
  return { contacts: { campaign: c, flow: f }, campaign: camp, flow };
}

/** WhatsApp campaign and flow, each to its own contact made again with `phone`. */
async function waBoth(label: string, phone: string) {
  const c = await contact(`${label}-c`, phone);
  const f = await contact(`${label}-f`, phone);
  const camp = (await campaign('whatsapp', [c]))[c.key]!;
  const flow = await throughFlow(waQ, flows.wa!, WA_EVENT, f);
  return { campaign: camp, flow };
}

async function seedState() {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM sms_consents WHERE org_id = ${seedOrgId}) AS sms_consents,
           (SELECT count(*)::int FROM whatsapp_consents WHERE org_id = ${seedOrgId}) AS wa_consents,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId} AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM workflows WHERE org_id = ${seedOrgId}) AS workflows,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${seedOrgId}) AS campaigns,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrgId}) AS users,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}) AS api_keys
  `;
  if (hasPhoneHash) {
    const [p] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM suppressions WHERE org_id = ${seedOrgId} AND phone_hash IS NOT NULL
    `;
    return { ...r!, phone_hash_rows: p!.n };
  }
  return r!;
}

/** The DOI token Redis holds for this list (doi.ts: `doi:<token>` → {contactId, listId, orgId}). */
async function doiToken(listId: string): Promise<string | null> {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
    cursor = next;
    for (const key of keys) {
      if (key.startsWith('doi:limit:') || key.startsWith('doi:purpose:')) continue;
      const raw = await redis.get(key).catch(() => null);
      if (raw?.includes(listId)) return key.slice('doi:'.length);
    }
  } while (cursor !== '0');
  return null;
}

const cells: Record<string, unknown> = {};
const listIdsDoi: string[] = [];
const BLOCKED = 'SMS_COMPLIANCE_BLOCKED';

describe('Z180 — the number after a GDPR erasure', () => {
  beforeAll(async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const [col] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'suppressions' AND column_name = 'phone_hash'
    `;
    hasPhoneHash = col!.n === 1;
    report.phoneHashColumn = hasPhoneHash;
    const [s] = await sql<{ org_id: string }[]>`
      SELECT org_id FROM users WHERE email = ${SEED_LOGIN.email} LIMIT 1
    `;
    seedOrgId = s!.org_id;
    seedBefore = await seedState();
    seedKey = await seedApiKey(sql, `z180-${tag}`);
    credentials.push(seedKey);
    const [o] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
      VALUES (${`z180 ${tag}`}, ${`z180-${tag}`}, 'production', 'Obchod z180 s.r.o.',
              'Nádražní 1, 110 00 Praha')
      RETURNING id
    `;
    org = o!.id;
    await sql`
      INSERT INTO organization_members (org_id, user_id, email, role, status)
      SELECT ${org}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
    `;
    const sw = await ok('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: org });
    owner = String(sw.data.token);
    credentials.push(owner);
    const minted = await ok('POST', '/api/v1/api-keys', owner, { name: `z180 owner ${tag}` });
    ownerKey = String(minted.data.rawKey);
    credentials.push(ownerKey);
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${org}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    await sql`
      INSERT INTO sms_routes (org_id, country_code, provider, priority, active, config)
      VALUES (${org}, '*', ${sinkProvider}, 0, true, '{}'::jsonb)
    `;
    flows.sms = await flowOf(SMS_EVENT, {
      type: 'send_sms',
      config: { message: 'Akce {{first_name}}' },
    });
    flows.wa = await flowOf(WA_EVENT, {
      type: 'send_whatsapp',
      config: { templateId: 'z180_flow' },
    });
    flows.tx = await flowOf('ticketing.order_paid', {
      type: 'send_sms',
      config: { message: 'Vstupenka {{first_name}}', priority: 'transactional' },
    });
    workers.push(startWorkflowSmsWorker(), startWhatsappSenderWorker());
  }, 120_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    let jobsRemoved = 0;
    for (const q of [smsQ, waQ]) {
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        if (j?.data?.orgId === org) {
          await j.remove().catch(() => {});
          jobsRemoved++;
        }
      }
      await q.close();
    }
    let redisKeysRemoved = 0;
    for (const c of credentials) {
      const d = createHash('sha256').update(c).digest('hex').slice(0, 32);
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `*${d}*`, 'COUNT', 1000);
        cursor = next;
        for (const key of keys) {
          await redis.del(key);
          redisKeysRemoved++;
        }
      } while (cursor !== '0');
    }
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        const raw = key.startsWith('doi:limit:') ? key : await redis.get(key).catch(() => null);
        if (raw && (raw.includes(org) || listIdsDoi.some((id) => raw.includes(id)))) {
          await redis.del(key);
          redisKeysRemoved++;
        }
      }
    } while (cursor !== '0');
    if (org) {
      await sql`DELETE FROM campaigns WHERE org_id = ${org}`;
      await sql`DELETE FROM consent_events WHERE org_id = ${org}`;
      await sql`DELETE FROM audit_logs WHERE org_id = ${org}`;
      await sql`DELETE FROM sms_consents WHERE org_id = ${org}`;
      await sql`DELETE FROM whatsapp_consents WHERE org_id = ${org}`;
      await sql`DELETE FROM sms_send_log WHERE org_id = ${org}`;
      await sql`DELETE FROM sms_routes WHERE org_id = ${org}`;
      await sql`DELETE FROM frequency_suppressions WHERE org_id = ${org}`;
      await sql`DELETE FROM suppressions WHERE org_id = ${org}`;
      await sql`DELETE FROM email_events WHERE org_id = ${org}`;
      await sql`DELETE FROM api_keys WHERE org_id = ${org}`;
      await sql`DELETE FROM organization_members WHERE org_id = ${org}`;
      // Contacts, lists, flows and runs go with it (ON DELETE CASCADE).
      await sql`DELETE FROM organizations WHERE id = ${org}`;
    }
    await sql`DELETE FROM api_keys WHERE name = ${SEED_KEY_NAME}`;
    const [left] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}) AS orgs,
             (SELECT count(*)::int FROM contacts WHERE org_id = ${org}) AS contacts,
             (SELECT count(*)::int FROM sms_consents WHERE consent_context = ${CONSENT_CONTEXT}) AS sms_consents,
             (SELECT count(*)::int FROM whatsapp_consents WHERE org_id = ${org}) AS wa_consents,
             (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}) AS suppressions,
             (SELECT count(*)::int FROM sms_routes WHERE provider = ${sinkProvider}) AS sms_routes,
             (SELECT count(*)::int FROM workflows WHERE name LIKE ${NAMED_LIKE}) AS workflows,
             (SELECT count(*)::int FROM campaigns WHERE name LIKE ${NAMED_LIKE}) AS campaigns,
             (SELECT count(*)::int FROM api_keys WHERE name LIKE ${KEY_LIKE}) AS api_keys,
             (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}) AS members
    `;
    const seedAfter = await seedState();
    report.cells = cells;
    report.leftover = { ...left, jobsRemoved, redisKeysRemoved };
    report.seedOrg = { before: seedBefore, after: seedAfter };
    console.log(`Z180_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    expect(left).toEqual({
      orgs: 0,
      contacts: 0,
      sms_consents: 0,
      wa_consents: 0,
      suppressions: 0,
      sms_routes: 0,
      workflows: 0,
      campaigns: 0,
      api_keys: 0,
      members: 0,
    });
    // The seed org exactly as this file found it — a snapshot, not zeros.
    expect(seedAfter).toEqual(seedBefore);
    expect(seedAfter.hash_rows).toBe(0);
    if (hasPhoneHash) expect(seedAfter.phone_hash_rows).toBe(0);
  }, 300_000);

  for (const variant of ['withContactId', 'withoutContactId'] as const) {
    it(`GS / GW ${variant} — the erased number on contacts made again: no SMS, no WhatsApp`, async () => {
      const P = newPhone();
      const k1 = await contact(`gs-${variant}-k1`, P);
      const consents = {
        sms: await smsConsent(P, variant === 'withContactId' ? k1.id : undefined),
        wa: await waConsent(P, variant === 'withContactId' ? k1.id : undefined),
      };
      const rowsBefore = await erasureRows();
      const erased = await erase(k1.id);
      const rowsAfter = await erasureRows();
      const smsOld = await smsBoth(`gs-${variant}-k2`, P);
      const wa = await waBoth(`gw-${variant}`, P);
      let smsNew: { consentNew: number; campaign: Sent; flow: Sent } | null = null;
      if (variant === 'withContactId') {
        // The erasure took the consent with it; the owner writes a new one.
        const c2 = await contact(`gs-${variant}-k2new-c`, P);
        const consentNew = await smsConsent(P, c2.id);
        const f2 = await contact(`gs-${variant}-k2new-f`, P);
        const camp = (await campaign('sms', [c2]))[c2.key]!;
        const flow = await throughFlow(smsQ, flows.sms!, SMS_EVENT, f2);
        smsNew = { consentNew, campaign: camp, flow };
      }
      const cell = {
        k1: { stored: k1.stored, status: k1.status, consents },
        erase: erased,
        rowsBefore,
        rowsAfter,
        k2: { status: smsOld.contacts.campaign.status, stored: smsOld.contacts.campaign.stored },
        smsOldConsent: { campaign: smsOld.campaign, flow: smsOld.flow },
        smsNewConsent: smsNew,
      };
      cells[`GS ${variant}`] = cell;
      cells[`GW ${variant}`] = wa;
      console.log(`[z180] GS ${variant}: ${JSON.stringify(cell)}`);
      console.log(`[z180] GW ${variant}: ${JSON.stringify(wa)}`);
      expect([consents.sms, consents.wa, erased]).toEqual([201, 201, 200]);
      expect([cell.k2.status, cell.k2.stored]).toEqual(['active', P]);
      // One address row, as on master, and one number row (master: none).
      expect(rowsAfter).toEqual({ email: rowsBefore.email + 1, phone: rowsBefore.phone + 1 });
      // The marketing SMS does not go: the gate of the number's fingerprint.
      expect([smsOld.campaign.outcome, smsOld.flow.outcome]).toEqual([BLOCKED, BLOCKED]);
      expect(smsOld.campaign.sent + smsOld.flow.sent).toBe(0);
      if (smsNew) {
        expect(smsNew.consentNew).toBe(201);
        expect([smsNew.campaign.outcome, smsNew.flow.outcome]).toEqual([BLOCKED, BLOCKED]);
        expect(smsNew.campaign.sent + smsNew.flow.sent).toBe(0);
      }
      // WhatsApp: stopped by marketingSkip (master: skipped_unconfigured = past it).
      expect([wa.campaign.outcome, wa.flow.outcome]).toEqual([
        'skipped_refused',
        'skipped_refused',
      ]);
      expect(wa.campaign.sent + wa.flow.sent).toBe(0);
    }, 900_000);
  }

  it('GP — a contact with a number and no e-mail, erased: the row, and no SMS', async () => {
    const P2 = newPhone();
    const k1 = await contact('gp-k1', P2, false);
    const consent = await smsConsent(P2);
    const rowsBefore = await erasureRows();
    const erased = await erase(k1.id);
    const rowsAfter = await erasureRows();
    const s = await smsBoth('gp-k2', P2);
    const cell = {
      consent,
      erase: erased,
      rowsBefore,
      rowsAfter,
      campaign: s.campaign,
      flow: s.flow,
    };
    cells.GP = cell;
    console.log(`[z180] GP: ${JSON.stringify(cell)}`);
    expect([consent, erased]).toEqual([201, 200]);
    expect(rowsAfter).toEqual({ email: rowsBefore.email, phone: rowsBefore.phone + 1 });
    expect([s.campaign.outcome, s.flow.outcome]).toEqual([BLOCKED, BLOCKED]);
    expect(s.campaign.sent + s.flow.sent).toBe(0);
  }, 600_000);

  it("D — the DOI confirmation of the erased address lifts the address's row, not the number", async () => {
    const P = newPhone();
    const k1 = await contact('d-k1', P);
    await smsConsent(P);
    expect(await erase(k1.id)).toBe(200);
    const rowsErased = await erasureRows();
    const k2 = await contact('d-k2', P);
    const before = (await campaign('sms', [k2]))[k2.key]!;
    const l = await ok('POST', '/api/v1/lists', ownerKey, {
      name: `z180 doi ${tag}`,
      doubleOptIn: true,
    });
    const listId = String(l.data.id);
    listIdsDoi.push(listId);
    const sub = await call('POST', `/api/v1/lists/${listId}/subscribe`, null, { email: k1.email });
    let token: string | null = null;
    for (let i = 0; i < 40 && !token; i++) {
      token = await doiToken(listId);
      if (!token) await new Promise((r) => setTimeout(r, 250));
    }
    const confirm = token
      ? await call('POST', `/api/v1/confirm/${token}`, null)
      : { status: 0, text: 'no token' };
    const rowsConfirmed = await erasureRows();
    const k2b = await contact('d-k2b', P);
    const after = (await campaign('sms', [k2b]))[k2b.key]!;
    const cell = {
      rowsAfterErasure: rowsErased,
      smsBeforeConfirmation: before,
      subscribe: sub.status,
      token: token ? 'found' : 'none',
      confirm: confirm.status,
      rowsAfterConfirmation: rowsConfirmed,
      smsAfterConfirmation: after,
    };
    cells.D = cell;
    console.log(`[z180] D: ${JSON.stringify(cell)}`);
    expect([cell.subscribe, cell.token, cell.confirm]).toEqual([202, 'found', 200]);
    // The address's row goes, as on master; the number's row stays.
    expect(rowsConfirmed).toEqual({ email: rowsErased.email - 1, phone: rowsErased.phone });
    expect(rowsErased.phone).toBeGreaterThan(0);
    expect([before.outcome, after.outcome]).toEqual([BLOCKED, BLOCKED]);
    expect(before.sent + after.sent).toBe(0);
  }, 600_000);

  it('N — the erased number typed three ways on contacts made again: no SMS in any', async () => {
    const P = newPhone();
    const d = P.slice(1);
    const forms = {
      spaced: `+${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`,
      e164: P,
      zeros: `00${d}`,
    };
    const k1 = await contact('n-k1', forms.spaced);
    expect(await erase(k1.id)).toBe(200);
    // One consent on the number as contacts store it, so the consent gate is not what stops it.
    const consent = await smsConsent(P);
    const people: Person[] = [];
    for (const [name, spelled] of Object.entries(forms)) {
      people.push({ ...(await contact(`n-${name}`, spelled)), key: name });
    }
    const out = await campaign('sms', people);
    const cell = {
      k1Stored: k1.stored,
      consent,
      perForm: Object.fromEntries(
        people.map((p) => [p.key, { stored: p.stored, campaign: out[p.key] }]),
      ),
    };
    cells.N = cell;
    console.log(`[z180] N: ${JSON.stringify(cell)}`);
    expect([k1.stored, consent]).toEqual([P, 201]);
    for (const p of people) {
      expect(p.stored).toBe(P);
      expect(out[p.key]!.jobPhones).toEqual([P]);
      expect(out[p.key]!.outcome).toBe(BLOCKED);
    }
  }, 600_000);

  it("K — transactional SMS, numbers never erased, an ordinary 'manual' row: as on master", async () => {
    // T: a flow's transactional SMS to the erased number, with and without consent.
    const Pt = newPhone();
    const kt = await contact('t-k1', Pt);
    await smsConsent(Pt);
    expect(await erase(kt.id)).toBe(200);
    const t = await throughFlow(smsQ, flows.tx!, 'ticketing.order_paid', await contact('t-k2', Pt));
    const Ptn = newPhone();
    const ktn = await contact('t-k1n', Ptn);
    expect(await erase(ktn.id)).toBe(200);
    const tn = await throughFlow(
      smsQ,
      flows.tx!,
      'ticketing.order_paid',
      await contact('t-k2n', Ptn),
    );
    // A number never erased, with consent and without.
    const Pc = newPhone();
    const withConsent = await contact('k-consent', Pc);
    await smsConsent(Pc, withConsent.id);
    const noConsent = await contact('k-none', newPhone());
    const plain = await campaign('sms', [withConsent, noConsent]);
    // M: an ordinary 'manual' row of a number (Z179 MIMO 2 — not handled here).
    const Pm = newPhone();
    const sup = await call('POST', '/api/v1/suppressions', ownerKey, {
      phone: Pm,
      reason: 'manual',
    });
    const mc = await contact('m-c', Pm);
    await smsConsent(Pm, mc.id);
    const mCampaign = (await campaign('sms', [mc]))[mc.key]!;
    const mFlow = await throughFlow(smsQ, flows.sms!, SMS_EVENT, await contact('m-f', Pm));
    const mWa = await waBoth('m-wa', Pm);
    const cell = {
      T: { withConsent: t, withoutConsent: tn },
      neverErased: { withConsent: plain[withConsent.key], withoutConsent: plain[noConsent.key] },
      M: { suppress: sup.status, campaign: mCampaign, flow: mFlow, whatsapp: mWa },
    };
    cells.K = cell;
    console.log(`[z180] K: ${JSON.stringify(cell)}`);
    expect([t.outcome, tn.outcome]).toEqual(['reached', 'reached']);
    expect(cell.neverErased.withConsent!.outcome).toBe('reached');
    expect(cell.neverErased.withoutConsent!.outcome).toBe(BLOCKED);
    expect(sup.status).toBe(201);
    expect([mCampaign.outcome, mFlow.outcome]).toEqual(['reached', 'reached']);
    expect([mWa.campaign.outcome, mWa.flow.outcome]).toEqual([
      'skipped_unconfigured',
      'skipped_unconfigured',
    ]);
  }, 900_000);
});
