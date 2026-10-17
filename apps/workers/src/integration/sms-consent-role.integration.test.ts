/**
 * A viewer's SMS consent opens no SMS: walked from the consent to the sink (Z178).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * The standing decision: owner, admin and editor may send; a viewer may not;
 * an API key acts with its creator's role. POST /api/v1/sms/consents had
 * app.authenticate and nothing else, so a viewer could write an sms_consents
 * row on any number — and checkSmsCompliance, which reads that row, lets a
 * flow's marketing SMS (Z167) and an SMS campaign through. POST
 * /api/v1/sms/inbound ran the organisation's keywords from any `fromPhone`.
 * Both, and POST /api/v1/whatsapp/consents, now take requireRole('admin',
 * 'owner', 'editor'). The route-by-role matrix is the API suite's
 * sms-consent-role file; this one walks what the consent led to.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 *   CV  a viewer's session and a key acting as viewer write consent on the
 *       number of an active contact without one → a flow's marketing SMS
 *       (send_sms without priority, started by a real event) and an SMS
 *       campaign to a list with that contact;
 *   CI  a viewer's session texts the 'subscribe' keyword from an unknown
 *       number through POST /sms/inbound;
 *   K   the same before and after Z178: the owner's session, the owner's key
 *       and an editor's session write consent → SMS reached; a number with no
 *       consent → blocked; a viewer revokes consent (DELETE, 204) → blocked; a
 *       flow's transactional SMS (ticketing.order_paid, priority
 *       'transactional') to a number without consent → reached; POST
 *       /transactional/sms → CHANNEL_NOT_IN_LAUNCH (Z168); the owner texts the
 *       keyword → a contact, and no flow or message.
 *
 * Each sender of consent has two contacts, one for the flow and one for the
 * campaign, so one SMS cannot hold the other back by a frequency cap.
 *
 * An organisation of this file: the seed user is its owner (a member row, then
 * POST /me/orgs/switch, as the other workers files do). The editor and the
 * viewers are users of a second organisation of this file, invited through
 * POST /orgs/:id/members/invite and accepting through POST
 * /invitations/:token/accept (the token is read from the row — no invitation
 * e-mail is sent), each holding a key of its home organisation to do so, then
 * POST /me/orgs/switch for a session. A viewer cannot mint a key, so the key
 * acting as viewer is minted while an admin and the member then set to viewer
 * by the owner through PATCH /orgs/:id/members/:memberId.
 *
 * Real chains: POST /api/v1/events (the owner's key) → the executor → the 'sms'
 * queue → the real workflow-sms worker in this process → the real POST
 * /internal/workflow/send-sms → the real routedSmsSend; an SMS campaign goes
 * POST /campaigns → /send → the same queue and worker. Stubbed: nothing in this
 * process. SMS goes to a catch-all route whose provider does not exist:
 * "Unknown SMS provider" means past every gate, and no SMS leaves the machine
 * (as Z155–Z172). The worker drops the API's 502 body, so each settled job's
 * data is posted again to read why ("replay").
 *
 * Everything measured is printed once as `Z178_WORKERS_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue, type JobType, type Worker } from 'bullmq';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { redis } from '@forgemsg/shared/redis';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { startWorkflowSmsWorker } from '../jobs/workflow-sms-sender.js';
import { connection } from '../queues/index.js';

const API = process.env.API_URL!;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `z178-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const sinkProvider = `z178-sink-${tag}`;
const SMS_REACHED = `Unknown SMS provider: ${sinkProvider}`;
const CONSENT_CONTEXT = `z178-${tag}`;
const FLOW_EVENT = `z178-sms-${tag}`;
const JOIN = `JOIN${tag.slice(0, 4)}`.toUpperCase();
const PHONE_BASE = 420_700_000_000 + Math.floor(Math.random() * 90_000_000);
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
let home = '';
let seedOrgId = '';
let seedKey = '';
let seedBefore: Record<string, unknown> = {};
const cred = {} as Record<'owner' | 'ownerKey' | 'editor' | 'viewer' | 'viewerKey', string>;
/** Every key and session of this file: their rate-limit buckets go at the end. */
const credentials: string[] = [];
const workers: Worker[] = [];
const smsQ = new Queue('sms', { connection });
const flows: Record<string, string> = {};
const report: Record<string, unknown> = {
  tag,
  mock:
    'nothing in this process; SMS ends at a route whose provider does not exist ("Unknown SMS ' +
    'provider" = past every gate); the replay re-posts the settled job to read the code',
};
let phones = 0;
const newPhone = () => `+${PHONE_BASE + ++phones * 7}`;

async function call(method: string, path: string, credential: string, body?: unknown) {
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

async function ok(method: string, path: string, credential: string, body?: unknown) {
  const r = await call(method, path, credential, body);
  if (r.status >= 300)
    throw new Error(`[z178] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return r.text ? (JSON.parse(r.text) as { data: Record<string, unknown> }) : { data: {} };
}

/** A key written the way createApiKey writes one, for a user of the home organisation. */
async function homeKey(userId: string, label: string): Promise<string> {
  const raw = `fm_live_${randomBytes(24).toString('hex')}`;
  const name = `integration z178-${label}-${tag}`;
  await sql`
    INSERT INTO api_keys (org_id, user_id, name, key_hash, key_prefix)
    VALUES (${home}, ${userId}, ${name},
            ${createHash('sha256').update(raw).digest('hex')}, ${raw.slice(0, 12)})
  `;
  credentials.push(raw);
  return raw;
}

/** A user of the home organisation, invited here as `role`, accepted, switched in. */
async function member(role: 'viewer' | 'editor' | 'admin', label: string) {
  const [seedUser] = await sql<{ password_hash: string }[]>`
    SELECT password_hash FROM users WHERE email = ${SEED_LOGIN.email} LIMIT 1
  `;
  const email = `z178-${label}-${tag}@test.local`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (org_id, email, name, password_hash, role, email_verified)
    VALUES (${home}, ${email}, ${`z178 ${label}`}, ${seedUser!.password_hash}, 'owner', true)
    RETURNING id
  `;
  const key = await homeKey(u!.id, label);
  const inv = await ok('POST', `/api/v1/orgs/${org}/members/invite`, cred.owner, { email, role });
  const memberId = String(inv.data.memberId);
  const [m] = await sql<{ t: string }[]>`
    SELECT invitation_token AS t FROM organization_members WHERE id = ${memberId}
  `;
  await ok('POST', `/api/v1/invitations/${m!.t}/accept`, key);
  const sw = await ok('POST', '/api/v1/me/orgs/switch', key, { orgId: org });
  const token = String(sw.data.token);
  credentials.push(token);
  return { memberId, token };
}

interface Person {
  key: string;
  id: string;
  phone: string;
  made: string;
}

/** An active contact of this organisation with a number and no consent on it. */
async function person(label: string): Promise<Person> {
  const phone = newPhone();
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, phone, first_name, status)
    VALUES (${org}, ${`z178-${label}-${tag}@test.local`}, ${phone}, 'Petra', 'active')
    RETURNING id
  `;
  return { key: label, id: c!.id, phone, made: 'INSERT active' };
}

async function consentRows(phone: string) {
  const r = await sql<{ revoked: boolean }[]>`
    SELECT revoked_at IS NOT NULL AS revoked FROM sms_consents WHERE org_id = ${org} AND phone = ${phone}
  `;
  return { rows: r.length, active: r.filter((x) => !x.revoked).length };
}

/** Consent on `p`'s number by `credential` through the real route. */
async function consent(p: Person, credential: string) {
  const r = await call('POST', '/api/v1/sms/consents', credential, {
    phone: p.phone,
    contactId: p.id,
    consentSource: 'api',
    consentContext: CONSENT_CONTEXT,
  });
  p.made += `; POST /sms/consents ${r.status}`;
  return { status: r.status, code: /"code":"([A-Z_]+)"/.exec(r.text)?.[1] ?? null };
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

/** The SMS jobs matching `pick` once settled; 'no job' when none appeared within `appearMs`. */
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

function outcome(job: string): string {
  if (job.includes(SMS_REACHED)) return 'reached';
  const code = /"code":"([A-Z_]+)"/.exec(job)?.[1];
  return code ?? job.slice(0, 80);
}

const flowJob = (workflowId: string, contactId: string) => async (d: Record<string, unknown>) =>
  d.contactId === contactId &&
  (await runIdsOf(workflowId, contactId)).includes(String(d.workflowRunId));

/** A flow of this organisation: trigger → one send_sms. */
async function flowOf(eventName: string, config: Record<string, unknown>): Promise<string> {
  const nodes = [
    { id: 'trigger', type: 'trigger', config: {} },
    { id: 'send', type: 'send_sms', config },
  ];
  const edges = [{ id: 'e0', source: 'trigger', target: 'send' }];
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${org}, ${`z178 ${eventName} ${tag}`}, 'active', 'api_event',
            ${JSON.stringify({ eventName })}::jsonb, ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify(edges)}::jsonb)
    RETURNING id
  `;
  return w!.id;
}

/** Start `workflowId` for `p` with an event and follow its SMS to the end. */
async function throughFlow(workflowId: string, eventName: string, p: Person) {
  const fired = await call('POST', '/api/v1/events', cred.ownerKey, {
    contactId: p.id,
    eventName,
    properties: { eventTitle: 'Hamlet', ticket_url: 'https://tix.example/z178' },
  });
  const job = await settled(flowJob(workflowId, p.id));
  return { event: fired.status, job, outcome: outcome(job), reached: job.includes(SMS_REACHED) };
}

/** An SMS campaign of the owner's key to a list of these people. */
async function smsCampaign(list: Person[]) {
  const [l] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name) VALUES (${org}, ${`z178 campaign ${tag}`}) RETURNING id
  `;
  for (const p of list) {
    await sql`
      INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${p.id}, ${l!.id}, now())
    `;
  }
  const created = await ok('POST', '/api/v1/campaigns', cred.ownerKey, {
    name: `z178 campaign ${tag}`,
    type: 'sms',
    listId: l!.id,
    subject: 'SMS z178',
    fromName: 'Obchod',
    fromEmail,
    content: { body: 'Akce z178' },
  });
  const campaignId = String(created.data.id);
  const send = await call('POST', `/api/v1/campaigns/${campaignId}/send`, cred.ownerKey, {
    acknowledgeDeliverabilityRisk: true,
  });
  report.campaignSend = `${send.status} ${send.text.slice(0, 200)}`;
  expect(send.status, send.text).toBe(200);
  const out: Record<string, { job: string; outcome: string; reached: boolean }> = {};
  await Promise.all(
    list.map(async (p) => {
      const job = await settled((d) => d.campaignId === campaignId && d.contactId === p.id, 8_000);
      out[p.key] = {
        job,
        outcome: job === 'no job' ? 'not enqueued' : outcome(job),
        reached: job.includes(SMS_REACHED),
      };
    }),
  );
  return out;
}

async function seedState() {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM sms_consents WHERE org_id = ${seedOrgId}) AS sms_consents,
           (SELECT count(*)::int FROM whatsapp_consents WHERE org_id = ${seedOrgId}) AS wa_consents,
           (SELECT count(*)::int FROM contacts WHERE org_id = ${seedOrgId}) AS contacts,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId}) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = ${seedOrgId} AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM sms_keywords WHERE org_id = ${seedOrgId}) AS sms_keywords,
           (SELECT count(*)::int FROM workflows WHERE org_id = ${seedOrgId}) AS workflows,
           (SELECT count(*)::int FROM campaigns WHERE org_id = ${seedOrgId}) AS campaigns,
           (SELECT count(*)::int FROM users WHERE org_id = ${seedOrgId}) AS users,
           (SELECT count(*)::int FROM organization_members WHERE org_id = ${seedOrgId}) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = ${seedOrgId}) AS api_keys
  `;
  return r!;
}

type Sender = 'viewer' | 'viewerKey' | 'owner' | 'ownerKey' | 'editor' | 'none' | 'revoked';
const SENDERS: Sender[] = ['viewer', 'viewerKey', 'owner', 'ownerKey', 'editor', 'none', 'revoked'];
interface ConsentCell {
  consent: { status: number; code: string | null } | null;
  revoke?: number;
  rows: { rows: number; active: number };
  flow: { event: number; outcome: string; reached: boolean; job: string };
  campaign: { outcome: string; reached: boolean; job: string };
}
const cv = {} as Record<Sender, ConsentCell>;
let transactional: Record<string, unknown> = {};
const inbound: Record<string, Record<string, unknown>> = {};

describe("a viewer's SMS consent and keyword, walked to the SMS sink (Z178)", () => {
  beforeAll(async () => {
    const [s] = await sql<{ org_id: string }[]>`
      SELECT org_id FROM users WHERE email = ${SEED_LOGIN.email} LIMIT 1
    `;
    seedOrgId = s!.org_id;
    seedBefore = await seedState();
    seedKey = await seedApiKey(sql, `z178-${tag}`);
    credentials.push(seedKey);
    for (const [label, set] of [
      ['org', (id: string) => (org = id)],
      ['home', (id: string) => (home = id)],
    ] as const) {
      const [o] = await sql<{ id: string }[]>`
        INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
        VALUES (${`z178 ${label} ${tag}`}, ${`z178-${label}-${tag}`}, 'production',
                'Obchod z178 s.r.o.', 'Nádražní 1, 110 00 Praha')
        RETURNING id
      `;
      set(o!.id);
    }
    await sql`
      INSERT INTO organization_members (org_id, user_id, email, role, status)
      SELECT ${org}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
    `;
    const sw = await ok('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: org });
    cred.owner = String(sw.data.token);
    credentials.push(cred.owner);
    const minted = await ok('POST', '/api/v1/api-keys', cred.owner, { name: `z178 owner ${tag}` });
    cred.ownerKey = String(minted.data.rawKey);
    credentials.push(cred.ownerKey);

    cred.editor = (await member('editor', 'editor')).token;
    cred.viewer = (await member('viewer', 'viewer')).token;
    const vk = await member('admin', 'viewerk');
    const vkMinted = await ok('POST', '/api/v1/api-keys', vk.token, { name: `z178 viewer ${tag}` });
    cred.viewerKey = String(vkMinted.data.rawKey);
    credentials.push(cred.viewerKey);
    await ok('PATCH', `/api/v1/orgs/${org}/members/${vk.memberId}`, cred.owner, {
      role: 'viewer',
    });
    const roles = await sql<{ email: string; role: string; status: string }[]>`
      SELECT email, role, status FROM organization_members WHERE org_id = ${org} ORDER BY email
    `;
    report.members = roles.map((r) => `${r.email.replace(tag, '<tag>')}: ${r.role} ${r.status}`);

    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${org}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    await sql`
      INSERT INTO sms_routes (org_id, country_code, provider, priority, active, config)
      VALUES (${org}, '*', ${sinkProvider}, 0, true, '{}'::jsonb)
    `;
    flows.marketing = await flowOf(FLOW_EVENT, { message: 'Akce {{first_name}}' });
    flows.transactional = await flowOf('ticketing.order_paid', {
      message: 'Vstupenka {{first_name}}',
      priority: 'transactional',
    });
    const [l] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${org}, ${`z178 keyword ${tag}`}) RETURNING id
    `;
    await ok('POST', '/api/v1/sms/keywords', cred.owner, {
      keyword: JOIN,
      action: 'subscribe',
      listId: l!.id,
      reply: 'Vítejte',
    });
    workers.push(startWorkflowSmsWorker());

    // ── CV and K: consent, then a flow's marketing SMS and an SMS campaign ──
    const byFlow = {} as Record<Sender, Person>;
    const byCampaign = {} as Record<Sender, Person>;
    for (const who of SENDERS) {
      byFlow[who] = await person(`${who.toLowerCase()}-flow`);
      byCampaign[who] = await person(`${who.toLowerCase()}-campaign`);
    }
    const consentBy: Partial<Record<Sender, string>> = {
      viewer: cred.viewer,
      viewerKey: cred.viewerKey,
      owner: cred.owner,
      ownerKey: cred.ownerKey,
      editor: cred.editor,
      revoked: cred.owner,
    };
    for (const who of SENDERS) {
      const by = consentBy[who];
      let c: ConsentCell['consent'] = null;
      let revoke: number | undefined;
      for (const p of [byFlow[who], byCampaign[who]]) {
        if (by) c = await consent(p, by);
        if (who === 'revoked') {
          const r = await call(
            'DELETE',
            `/api/v1/sms/consents/${encodeURIComponent(p.phone)}`,
            cred.viewer,
          );
          revoke = r.status;
          p.made += `; viewer DELETE /sms/consents ${r.status}`;
        }
      }
      cv[who] = {
        consent: c,
        ...(revoke === undefined ? {} : { revoke }),
        rows: await consentRows(byFlow[who].phone),
        flow: { event: 0, outcome: '', reached: false, job: '' },
        campaign: { outcome: '', reached: false, job: '' },
      };
    }
    await Promise.all(
      SENDERS.map(async (who) => {
        cv[who].flow = await throughFlow(flows.marketing!, FLOW_EVENT, byFlow[who]);
      }),
    );
    const campaign = await smsCampaign(SENDERS.map((w) => ({ ...byCampaign[w], key: w })));
    for (const who of SENDERS) cv[who].campaign = campaign[who]!;
    for (const who of SENDERS)
      console.log(
        `[z178] CV/K ${who}: consent=${JSON.stringify(cv[who].consent)} revoke=${cv[who].revoke ?? '-'} ` +
          `rows=${JSON.stringify(cv[who].rows)} flow=${cv[who].flow.outcome} campaign=${cv[who].campaign.outcome}`,
      );
    report.CV = cv;

    // ── K: a transactional SMS of a flow, and a direct one, to a number without consent ──
    const t = await person('transactional');
    const tFlow = await throughFlow(flows.transactional!, 'ticketing.order_paid', t);
    const direct = await call('POST', '/api/v1/transactional/sms', cred.ownerKey, {
      to: t.phone,
      text: 'Kód 1234',
    });
    transactional = {
      rows: await consentRows(t.phone),
      flow: tFlow,
      direct: `${direct.status} ${/"code":"([A-Z_]+)"/.exec(direct.text)?.[1] ?? direct.text.slice(0, 80)}`,
    };
    console.log(`[z178] K transactional ${JSON.stringify(transactional)}`);
    report.transactional = transactional;

    // ── CI: the 'subscribe' keyword from an unknown number ──
    for (const who of ['viewer', 'owner'] as const) {
      const phone = newPhone();
      const [hitsBefore] = await sql<{ n: number }[]>`
        SELECT hit_count AS n FROM sms_keywords WHERE org_id = ${org} AND keyword = ${JOIN}
      `;
      const r = await call('POST', '/api/v1/sms/inbound', cred[who], {
        fromPhone: phone,
        body: `${JOIN} ahoj`,
      });
      // Long enough for anything the keyword would start to queue.
      await new Promise((res) => setTimeout(res, 5_000));
      const made = await sql<{ id: string; status: string }[]>`
        SELECT id, status FROM contacts WHERE org_id = ${org} AND phone = ${phone}
      `;
      let runs = 0;
      let listRows = 0;
      for (const c of made) {
        const [n] = await sql<{ runs: number; lists: number }[]>`
          SELECT (SELECT count(*)::int FROM workflow_runs WHERE contact_id = ${c.id}) AS runs,
                 (SELECT count(*)::int FROM contact_lists WHERE contact_id = ${c.id}) AS lists
        `;
        runs += n!.runs;
        listRows += n!.lists;
      }
      const ids = made.map((c) => c.id);
      const jobs = (await smsQ.getJobs(ALL, 0, 10_000)).filter(
        (j) => j?.data && (ids.includes(String(j.data.contactId)) || j.data.to === phone),
      ).length;
      const [hitsAfter] = await sql<{ n: number }[]>`
        SELECT hit_count AS n FROM sms_keywords WHERE org_id = ${org} AND keyword = ${JOIN}
      `;
      inbound[who] = {
        status: r.status,
        body: r.text.replace(/[0-9a-f-]{36}/g, '<UUID>').slice(0, 300),
        contacts: made.map((c) => c.status),
        listRows,
        smsConsents: (await consentRows(phone)).rows,
        hits: `${hitsBefore!.n} → ${hitsAfter!.n}`,
        workflowRuns: runs,
        smsJobs: jobs,
      };
      console.log(`[z178] CI ${who}: ${JSON.stringify(inbound[who])}`);
    }
    report.CI = inbound;
  }, 600_000);

  afterAll(async () => {
    for (const w of workers) await w.close();
    let jobsRemoved = 0;
    for (const j of await smsQ.getJobs(ALL, 0, 10_000)) {
      if (j?.data?.orgId === org) {
        await j.remove().catch(() => {});
        jobsRemoved++;
      }
    }
    await smsQ.close();
    let limitKeysRemoved = 0;
    for (const c of credentials) {
      const d = createHash('sha256').update(c).digest('hex').slice(0, 32);
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
    for (const o of [org, home]) {
      if (!o) continue;
      await sql`DELETE FROM campaigns WHERE org_id = ${o}`;
      await sql`DELETE FROM consent_events WHERE org_id = ${o}`;
      await sql`DELETE FROM audit_logs WHERE org_id = ${o}`;
      await sql`DELETE FROM sms_consents WHERE org_id = ${o}`;
      await sql`DELETE FROM whatsapp_consents WHERE org_id = ${o}`;
      await sql`DELETE FROM sms_keywords WHERE org_id = ${o}`;
      await sql`DELETE FROM sms_send_log WHERE org_id = ${o}`;
      await sql`DELETE FROM sms_routes WHERE org_id = ${o}`;
      await sql`DELETE FROM frequency_suppressions WHERE org_id = ${o}`;
      await sql`DELETE FROM suppressions WHERE org_id = ${o}`;
      await sql`DELETE FROM api_keys WHERE org_id = ${o}`;
      await sql`DELETE FROM organization_members WHERE org_id = ${o}`;
    }
    await sql`DELETE FROM users WHERE email LIKE ${`z178-%-${tag}@test.local`}`;
    for (const o of [org, home]) {
      // Contacts, lists, flows and runs go with it (ON DELETE CASCADE).
      if (o) await sql`DELETE FROM organizations WHERE id = ${o}`;
    }
    await sql`DELETE FROM api_keys WHERE name = ${`integration z178-${tag}`}`;
    const [left] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE slug LIKE ${`z178-%-${tag}`}) AS orgs,
             (SELECT count(*)::int FROM users WHERE email LIKE ${`z178-%-${tag}@test.local`}) AS users,
             (SELECT count(*)::int FROM contacts WHERE email LIKE ${`z178-%-${tag}@test.local`}) AS contacts,
             (SELECT count(*)::int FROM sms_consents WHERE consent_context = ${CONSENT_CONTEXT}) AS sms_consents,
             (SELECT count(*)::int FROM sms_routes WHERE provider = ${sinkProvider}) AS sms_routes,
             (SELECT count(*)::int FROM workflows WHERE name LIKE ${`z178 % ${tag}`}) AS workflows,
             (SELECT count(*)::int FROM campaigns WHERE name LIKE ${`z178 % ${tag}`}) AS campaigns,
             (SELECT count(*)::int FROM api_keys WHERE name LIKE ${`%z178%${tag}`}) AS api_keys,
             (SELECT count(*)::int FROM organization_members WHERE email LIKE ${`z178-%-${tag}@test.local`}) AS members
    `;
    const seedAfter = await seedState();
    report.leftover = { ...left, jobsRemoved, limitKeysRemoved };
    report.seedOrg = { before: seedBefore, after: seedAfter };
    console.log(`Z178_WORKERS_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    expect(left).toEqual({
      orgs: 0,
      users: 0,
      contacts: 0,
      sms_consents: 0,
      sms_routes: 0,
      workflows: 0,
      campaigns: 0,
      api_keys: 0,
      members: 0,
    });
    // The seed organisation exactly as this file found it (a snapshot, not zeros).
    expect(seedAfter).toEqual(seedBefore);
  }, 300_000);

  it.each(['viewer', 'viewerKey'] as const)(
    'CV %s — consent refused (403), no row, so neither the flow nor the campaign SMS reaches the number',
    (who) => {
      const c = cv[who];
      expect(c.consent, JSON.stringify(c)).toEqual({ status: 403, code: 'FORBIDDEN' });
      expect(c.rows).toEqual({ rows: 0, active: 0 });
      expect(c.flow.outcome, c.flow.job).toBe('SMS_COMPLIANCE_BLOCKED');
      expect(c.campaign.outcome, c.campaign.job).toBe('SMS_COMPLIANCE_BLOCKED');
    },
  );

  it.each(['owner', 'ownerKey', 'editor'] as const)(
    'K %s — consent written (201), the flow and the campaign SMS reach the number',
    (who) => {
      const c = cv[who];
      expect(c.consent, JSON.stringify(c)).toEqual({ status: 201, code: null });
      expect(c.rows).toEqual({ rows: 1, active: 1 });
      expect(c.flow.outcome, c.flow.job).toBe('reached');
      expect(c.flow.event).toBeLessThan(300);
      expect(c.campaign.outcome, c.campaign.job).toBe('reached');
    },
  );

  it('K no consent — the flow and the campaign SMS are blocked', () => {
    const c = cv.none;
    expect(c.rows).toEqual({ rows: 0, active: 0 });
    expect(c.flow.outcome, c.flow.job).toBe('SMS_COMPLIANCE_BLOCKED');
    expect(c.campaign.outcome, c.campaign.job).toBe('SMS_COMPLIANCE_BLOCKED');
  });

  it('K a viewer revokes consent (204) — the next SMS is blocked', () => {
    const c = cv.revoked;
    expect(c.consent).toEqual({ status: 201, code: null });
    expect(c.revoke).toBe(204);
    expect(c.rows).toEqual({ rows: 1, active: 0 });
    expect(c.flow.outcome, c.flow.job).toBe('SMS_COMPLIANCE_BLOCKED');
    expect(c.campaign.outcome, c.campaign.job).toBe('SMS_COMPLIANCE_BLOCKED');
  });

  it("K a flow's transactional SMS reaches a number without consent; a direct one is off (Z168)", () => {
    expect(transactional, JSON.stringify(transactional)).toMatchObject({
      rows: { rows: 0, active: 0 },
      flow: { outcome: 'reached' },
      direct: '403 CHANNEL_NOT_IN_LAUNCH',
    });
  });

  it('CI viewer — the keyword from an unknown number is refused (403): no contact, no hit, nothing queued', () => {
    expect(inbound.viewer, JSON.stringify(inbound.viewer)).toMatchObject({
      status: 403,
      contacts: [],
      listRows: 0,
      smsConsents: 0,
      workflowRuns: 0,
      smsJobs: 0,
    });
    const [before, after] = String(inbound.viewer!.hits).split(' → ');
    expect(after).toBe(before);
  });

  it('CI owner — the keyword makes a non_subscribed contact, and starts no flow and no SMS', () => {
    expect(inbound.owner, JSON.stringify(inbound.owner)).toMatchObject({
      status: 200,
      contacts: ['non_subscribed'],
      listRows: 0,
      smsConsents: 0,
      workflowRuns: 0,
      smsJobs: 0,
    });
    const [before, after] = String(inbound.owner!.hits).split(' → ');
    expect(Number(after)).toBe(Number(before) + 1);
  });
});
