/**
 * The app-studio ingest with another organisation's contact reaches nobody
 * and queues nothing, all the way down (Z169).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * POST /api/v1/app-studio/ingest/:appSlug/:triggerKey handed the body's
 * contactId to onApiEvent for the app's organisation without checking that the
 * contact is that organisation's. A contact of another organisation never gave
 * it consent (Z161 MIMO 1). The ingest now answers 404 `Contact`, as POST
 * /api/v1/events does, and onApiEvent starts nothing for such an id. The API
 * file (apps/api/src/integration/app-studio-foreign-contact) measures the
 * route, the rows and the direct call; this file walks the channels.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Org A and org B are organisations of this file, the seed user their owner;
 * org A's session comes from POST /api/v1/me/orgs/switch, its app and its
 * triggers from the app-studio routes (the token is the one the route
 * answered). The ingest → onApiEvent → the executor → the queue → the real
 * worker in this process (workflow-email, workflow-sms, whatsapp, push) → the
 * real API route → the real batch-sender / routing / channel worker → the real
 * mta-sender.
 *
 *   X   org B's contact (active, consent on the number, a push subscription,
 *       the address on org A's verified domain) × org A's marketing flows on
 *       the app's event: template and inline e-mail, SMS, WhatsApp, web push;
 *   X2  the same contact × org A's transactional flows on ticketing.order_paid;
 *   N   a uuid no contact has;
 *   K   org A's own contact: active × marketing (reaches), unsubscribed ×
 *       marketing (does not), unsubscribed × ticketing.order_paid (reaches).
 *
 * Stubbed: the engine's gRPC client (it keeps what it was handed) and fetch to
 * graph.facebook.com (WhatsApp) and to the web push endpoint's host. SMS goes
 * to a catch-all route whose provider does not exist: "Unknown SMS provider"
 * means past every gate and no SMS leaves the machine (as Z155).
 *
 * Each cell is logged as `[z169] …` and the whole table once as
 * `Z169_CELLS_JSON {…}` at the end, for the report.
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers and the engine.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType, type Worker } from 'bullmq';
import { createECDH, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { startWorkflowEmailWorker } from '../jobs/workflow-email-sender.js';
import { startWorkflowSmsWorker } from '../jobs/workflow-sms-sender.js';
import { startWhatsappSenderWorker } from '../jobs/whatsapp-sender.js';
import { startPushSenderWorker } from '../jobs/push-sender.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import {
  batchSenderQueues,
  connection,
  mtaQueues,
  type BatchSenderJobData,
  type MtaSendJobData,
} from '../queues/index.js';

interface Handed {
  toEmail: string;
  subject: string;
}

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({ handed: [] as Handed[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: Handed) => {
    engine.handed.push({ toEmail: msg.toEmail, subject: msg.subject });
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
const DOMAIN = `z169-${tag}.test`;
const SINK = `z169-sink-${tag}`;
const WEB_HOST = `z169-wp-${tag}.invalid`;
const SMS_REACHED = `Unknown SMS provider: ${SINK}`;
const EV_X = `z169-x-${tag}`;
const TICKETING = 'ticketing.order_paid';
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

type Channel = 'email' | 'sms' | 'wa' | 'push';
const qs: Record<Channel, Queue> = {
  email: new Queue('email', { connection }),
  sms: new Queue('sms', { connection }),
  wa: new Queue('whatsapp-send', { connection }),
  push: new Queue('push-send', { connection }),
};

let seed: SeedOrg;
let seedKey = '';
let orgA = '';
let orgB = '';
let tokenA = '';
let appSlug = '';
let appToken = '';
let vapidId: string | null = null;
let p256dh = '';
let authSecret = '';
let seedBefore: Record<string, unknown> = {};
const workers: Worker[] = [];
const apiKeyNames: string[] = [];
const flows: Record<string, { id: string; channel: Channel; subject?: string }> = {};
const report: Record<string, unknown> = {
  tag,
  mock:
    'the engine gRPC client (lib/mta-grpc-client.js); fetch to graph.facebook.com and to the web ' +
    'push host; SMS ends at a route whose provider does not exist; everything else is real',
};

// ── transport stub (WhatsApp, web push) ─────────────────────────────────────
const hits = { wa: [] as string[], web: [] as string[] };
const realFetch = globalThis.fetch;
function stubTransport() {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const host = new URL(url).hostname;
    if (host === 'graph.facebook.com') {
      hits.wa.push((JSON.parse(String(init?.body)) as { to: string }).to.replace(/\D/g, ''));
      return Response.json({
        messaging_product: 'whatsapp',
        messages: [{ id: `wamid.${hits.wa.length}` }],
      });
    }
    if (host === WEB_HOST) {
      hits.web.push(url);
      return new Response(null, { status: 201 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

async function call(method: string, path: string, credential: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(credential),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  return { status: res.status, text: await res.text() };
}

interface Person {
  key: string;
  id: string;
  email: string;
  phone: string;
}

/** A contact of `orgId`: consent on the number, a web push subscription. */
async function person(
  orgId: string,
  key: string,
  status: 'active' | 'unsubscribed',
): Promise<Person> {
  const email = `${key}-${tag}@${DOMAIN}`;
  const phone = `+4207${String(10_000_000 + Math.floor(Math.random() * 89_999_999)).slice(0, 8)}`;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, phone, first_name, status)
    VALUES (${orgId}, ${email}, ${phone}, 'Bára', ${status}) RETURNING id
  `;
  await sql`
    INSERT INTO sms_consents (org_id, phone, consent_source, consent_context)
    VALUES (${orgId}, ${phone}, 'web_form', ${`z169-${tag}`})
  `;
  await sql`
    INSERT INTO push_subscriptions (org_id, contact_id, endpoint, p256dh, auth)
    VALUES (${orgId}, ${c!.id}, ${`https://${WEB_HOST}/${c!.id}`}, ${p256dh}, ${authSecret})
  `;
  return { key, id: c!.id, email, phone };
}

/** An organisation of this file, the seed user its owner, its session token. */
async function makeOrg(label: string): Promise<{ id: string; token: string }> {
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
    VALUES (${`z169 ${label} ${tag}`}, ${`z169-${label}-${tag}`}, 'production',
            ${`Obchod ${label} s.r.o.`}, 'Nádražní 1, 110 00 Praha')
    RETURNING id
  `;
  await sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    SELECT ${o!.id}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
  `;
  const r = await call('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: o!.id });
  expect(r.status, r.text).toBe(200);
  return { id: o!.id, token: (JSON.parse(r.text) as { data: { token: string } }).data.token };
}

/** A flow of org A on an api_event: trigger → one node. */
async function flowOf(
  label: string,
  eventName: string,
  channel: Channel,
  node: { type: string; config: Record<string, unknown> },
) {
  const nodes = [
    { id: 'trigger', type: 'trigger', config: { triggerType: 'api_event', eventName } },
    { id: 'send', ...node },
  ];
  const edges = [{ id: 'e0', source: 'trigger', target: 'send' }];
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${orgA}, ${`z169 ${label} ${tag}`}, 'active', 'api_event',
            ${JSON.stringify({ eventName })}::jsonb, ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify(edges)}::jsonb)
    RETURNING id
  `;
  flows[label] = {
    id: w!.id,
    channel,
    subject: typeof node.config.subject === 'string' ? node.config.subject : undefined,
  };
}

async function runIdsOf(workflowId: string, contactId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM workflow_runs WHERE workflow_id = ${workflowId} AND contact_id = ${contactId}
  `;
  return rows.map((r) => r.id);
}

/**
 * This flow's jobs on `q` for the contact once settled: "state returnvalue",
 * and for SMS the route's answer to the same job ("replay …"), because the
 * worker drops the 502 body (as Z143/Z155).
 */
async function settledOn(q: Queue, contactId: string, workflowId: string) {
  const appear = Date.now() + 15_000;
  for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
    const runs = await runIdsOf(workflowId, contactId);
    const jobs = (await q.getJobs(ALL, 0, 10_000)).filter(
      (j) => j?.data?.contactId === contactId && runs.includes(j.data.workflowRunId),
    );
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
        await j.remove().catch(() => {});
      }
      return out.join(' | ');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'did not settle';
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
    const d = j.data as unknown as Record<string, unknown>;
    const flag = d.flowTransactional ? 'ft' : d.flowMarketing ? 'fm' : '-';
    out.push(`sent=${r.sent} skipped=${r.skipped}/${flag}`);
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

interface Cell {
  ingest: string;
  events: number;
  runs: string;
  flows: Record<string, { job: string; reached: boolean }>;
  batch: string;
  mta: string;
  handed: string[];
}

/** One ingest for `p` on trigger `key`; every flow of `labels` followed to the end. */
async function walk(label: string, key: string, p: Person, labels: string[]): Promise<Cell> {
  const ids = Object.values(flows).map((f) => f.id);
  // A run left by an earlier cell must not stop this one from starting.
  await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${ids})`;
  const events0 = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM workflow_events WHERE contact_id = ${p.id}
  `;
  const handed0 = engine.handed.length;
  const wa0 = hits.wa.length;
  const web0 = hits.web.length;
  const r = await call('POST', `/api/v1/app-studio/ingest/${appSlug}/${key}`, appToken, {
    contactId: p.id,
    payload: { order: { number: tag } },
  });
  const out: Cell['flows'] = {};
  await Promise.all(
    labels.map(async (l) => {
      const f = flows[l]!;
      out[l] = { job: await settledOn(qs[f.channel], p.id, f.id), reached: false };
    }),
  );
  const batch = await runBatch(p.id);
  const mta = await deliver(p.email);
  const handed = engine.handed.slice(handed0).filter((m) => m.toEmail === p.email.toLowerCase());
  const digits = p.phone.replace(/\D/g, '');
  for (const l of labels) {
    const f = flows[l]!;
    const c = out[l]!;
    if (f.channel === 'email') c.reached = handed.some((m) => m.subject === f.subject);
    else if (f.channel === 'sms') c.reached = c.job.includes(SMS_REACHED);
    else if (f.channel === 'wa') c.reached = hits.wa.slice(wa0).includes(digits);
    else c.reached = hits.web.slice(web0).some((u) => u.endsWith(p.id));
  }
  const events1 = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM workflow_events WHERE contact_id = ${p.id}
  `;
  const runs = await sql<{ status: string; n: number }[]>`
    SELECT status, count(*)::int AS n FROM workflow_runs
    WHERE workflow_id = ANY(${ids}) AND contact_id = ${p.id} GROUP BY status ORDER BY status
  `;
  const cell: Cell = {
    ingest: `${r.status} ${r.text.slice(0, 160)}`,
    events: events1[0]!.n - events0[0]!.n,
    runs: runs.map((x) => `${x.status}=${x.n}`).join(',') || 'no run',
    flows: out,
    batch,
    mta,
    handed: handed.map((m) => m.subject),
  };
  report[label] = cell;
  console.log(`[z169] ${label}: ${JSON.stringify(cell)}`);
  return cell;
}

const reached = (c: Cell) =>
  Object.fromEntries(Object.entries(c.flows).map(([k, v]) => [k, v.reached]));

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM plan_send_counters WHERE org_id = o.id) AS counter_rows,
           (SELECT COALESCE(sum(sends), 0)::int FROM plan_send_counters WHERE org_id = o.id) AS counter_sends,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM workflows WHERE org_id = o.id) AS workflows,
           (SELECT count(*)::int FROM workflow_runs WHERE org_id = o.id) AS workflow_runs,
           (SELECT count(*)::int FROM workflow_events WHERE org_id = o.id) AS workflow_events,
           (SELECT count(*)::int FROM app_studio_apps WHERE org_id = o.id) AS apps,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

const MARKETING = ['tpl', 'inline', 'sms', 'wa', 'push'];
const TRANSACTIONAL = ['tTpl', 'tInline', 'tSms'];
const people = {} as Record<'b' | 'own' | 'unsub', Person>;

describe('app-studio ingest with another org’s contact reaches nobody (Z169)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    seedBefore = await seedState();
    seedKey = await seedApiKey(sql, `z169-${tag}`);
    apiKeyNames.push(`integration z169-${tag}`);
    const a = await makeOrg('a');
    orgA = a.id;
    tokenA = a.token;
    orgB = (await makeOrg('b')).id;

    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${orgA}, ${DOMAIN}, 'fm1', true, true, true, true)
    `;
    await sql`
      INSERT INTO sms_routes (org_id, country_code, provider, priority, active, config)
      VALUES (${orgA}, '*', ${SINK}, 0, true, '{}'::jsonb)
    `;
    const vk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pub = vk.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const rawPub = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(pub.x, 'base64url'),
      Buffer.from(pub.y, 'base64url'),
    ]);
    const [v] = await sql<{ id: string }[]>`
      INSERT INTO vapid_keys (org_id, public_key, private_key, active)
      VALUES (${orgA}, ${rawPub.toString('base64url')},
              ${(vk.privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer).toString('base64url')}, true)
      RETURNING id
    `;
    vapidId = v!.id;
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    p256dh = ecdh.getPublicKey().toString('base64url');
    authSecret = randomBytes(16).toString('base64url');
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'z169phone';
    process.env.WHATSAPP_ACCESS_TOKEN = 'z169token';
    stubTransport();

    // The app, its token and its triggers: the app-studio routes, as org A's owner.
    appSlug = `z169-app-${tag}`;
    const installed = await call('POST', '/api/v1/app-studio/apps', tokenA, {
      slug: appSlug,
      name: `z169 app ${tag}`,
    });
    expect(installed.status, installed.text).toBe(201);
    const inst = JSON.parse(installed.text) as { data: { id: string; accessToken: string } };
    appToken = inst.data.accessToken;
    for (const [key, eventName] of [
      ['x', EV_X],
      ['tk', TICKETING],
    ] as const) {
      const t = await call('POST', `/api/v1/app-studio/apps/${inst.data.id}/triggers`, tokenA, {
        key,
        name: `z169 ${key}`,
        eventName,
      });
      expect(t.status, t.text).toBe(201);
    }

    const blocks = [
      {
        id: 'b1',
        type: 'text',
        content: '<p>Dobrý den, {{first_name}}.</p>',
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
    const [t] = await sql<{ id: string }[]>`
      INSERT INTO templates (org_id, name, subject, preheader, blocks, global_styles, locale)
      VALUES (${orgA}, ${`z169 ${tag}`}, 'Z169', '', ${JSON.stringify(blocks)}::jsonb,
              ${JSON.stringify(globalStyles)}::jsonb, 'cs')
      RETURNING id
    `;
    const templateId = t!.id;
    const html = '<p>Ahoj {{first_name}}, Z169.</p>';
    await flowOf('tpl', EV_X, 'email', {
      type: 'send_email',
      config: { templateId, subject: 'Z169 F šablona' },
    });
    await flowOf('inline', EV_X, 'email', {
      type: 'send_email',
      config: { subject: 'Z169 F inline', html },
    });
    await flowOf('sms', EV_X, 'sms', {
      type: 'send_sms',
      config: { message: 'Z169 {{first_name}}' },
    });
    await flowOf('wa', EV_X, 'wa', { type: 'send_whatsapp', config: { templateId: 'z169_flow' } });
    await flowOf('push', EV_X, 'push', {
      type: 'send_push',
      config: { title: 'Ahoj {{first_name}}', body: 'Z169' },
    });
    await flowOf('tTpl', TICKETING, 'email', {
      type: 'send_email',
      config: { templateId, subject: 'Z169 T šablona', priority: 'transactional' },
    });
    await flowOf('tInline', TICKETING, 'email', {
      type: 'send_email',
      config: { subject: 'Z169 T inline', html, priority: 'transactional' },
    });
    await flowOf('tSms', TICKETING, 'sms', {
      type: 'send_sms',
      config: { message: 'Z169 vstupenka', priority: 'transactional' },
    });

    // Org B's contact: the worst case master can show — active, consent on the
    // number, a push subscription, the address on a domain org A has verified.
    people.b = await person(orgB, 'b', 'active');
    people.own = await person(orgA, 'own', 'active');
    people.unsub = await person(orgA, 'unsub', 'unsubscribed');
    const sup = await call('POST', '/api/v1/suppressions', tokenA, {
      email: people.unsub.email,
      reason: 'unsubscribe',
    });
    expect(sup.status, sup.text).toBe(201);

    workers.push(
      startWorkflowEmailWorker(),
      startWorkflowSmsWorker(),
      startWhatsappSenderWorker(),
      startPushSenderWorker(),
    );
    console.log(`[z169] seed org before: ${JSON.stringify(seedBefore)}`);
  }, 180_000);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    for (const w of workers) await w.close();
    const ids = Object.values(people).map((p) => p.id);
    for (const q of Object.values(qs)) {
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        if (j && ids.includes(j.data?.contactId)) await j.remove().catch(() => {});
      }
      await q.close();
    }
    for (const j of await batchSenderQueues.triggered.getJobs(ALL, 0, 10_000)) {
      const d = j?.data as BatchSenderJobData | undefined;
      if (d?.contactIds?.some((id) => ids.includes(id))) await j.remove().catch(() => {});
    }
    for (const j of await mtaQueues.other.getJobs(ALL, 0, 10_000)) {
      if (j?.data?.toEmail?.toLowerCase().endsWith(`@${DOMAIN}`)) await j.remove().catch(() => {});
    }
    if (ids.length) {
      await sql`DELETE FROM workflow_runs WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM sms_send_log WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM push_send_log WHERE contact_id = ANY(${ids})`;
    }
    await sql`DELETE FROM sms_consents WHERE consent_context = ${`z169-${tag}`}`;
    if (vapidId) await sql`DELETE FROM vapid_keys WHERE id = ${vapidId}`;
    await sql`DELETE FROM app_studio_apps WHERE org_id IN (${orgA}, ${orgB})`;
    await sql`DELETE FROM audit_logs WHERE org_id IN (${orgA}, ${orgB})`;
    await sql`DELETE FROM api_keys WHERE org_id IN (${orgA}, ${orgB}) OR name = ANY(${apiKeyNames})`;
    // Everything else of org A and org B goes with the organisation (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id IN (${orgA}, ${orgB})`;
    const [left] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id IN (${orgA}, ${orgB})) AS orgs,
             (SELECT count(*)::int FROM contacts WHERE org_id IN (${orgA}, ${orgB})) AS contacts,
             (SELECT count(*)::int FROM workflow_runs WHERE org_id IN (${orgA}, ${orgB})) AS runs,
             (SELECT count(*)::int FROM workflow_events WHERE org_id IN (${orgA}, ${orgB})) AS events,
             (SELECT count(*)::int FROM app_studio_triggers WHERE org_id IN (${orgA}, ${orgB})) AS triggers,
             (SELECT count(*)::int FROM email_events WHERE org_id IN (${orgA}, ${orgB})) AS email_events
    `;
    const seedAfter = await seedState();
    report.leftover = left;
    report.seedOrg = { before: seedBefore, after: seedAfter };
    console.log(`Z169_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    expect(left, 'what this file made was not all removed').toEqual({
      orgs: 0,
      contacts: 0,
      runs: 0,
      events: 0,
      triggers: 0,
      email_events: 0,
    });
    // The seed org exactly as this file found it — a snapshot, not zeros.
    expect(seedAfter).toEqual(seedBefore);
  }, 300_000);

  it('X — org B’s contact × org A’s marketing flows: 404, no run, no job, nobody reached', async () => {
    const c = await walk('X', 'x', people.b, MARKETING);
    expect(c.ingest).toMatch(/^404 /);
    expect(c.events).toBe(0);
    expect(c.runs).toBe('no run');
    for (const [k, f] of Object.entries(c.flows)) expect(f.job, k).toBe('no job');
    expect(c.batch).toBe('no batch job');
    expect(c.mta).toBe('no mta job');
    expect(reached(c)).toEqual({ tpl: false, inline: false, sms: false, wa: false, push: false });
  }, 300_000);

  it('X2 — org B’s contact × ticketing.order_paid transactional flows: the same', async () => {
    const c = await walk('X2', 'tk', people.b, TRANSACTIONAL);
    expect(c.ingest).toMatch(/^404 /);
    expect(c.events).toBe(0);
    expect(c.runs).toBe('no run');
    for (const [k, f] of Object.entries(c.flows)) expect(f.job, k).toBe('no job');
    expect(c.batch).toBe('no batch job');
    expect(c.mta).toBe('no mta job');
    expect(reached(c)).toEqual({ tTpl: false, tInline: false, tSms: false });
  }, 300_000);

  it('N — a uuid no contact has: 404 and nothing', async () => {
    const ghost: Person = {
      key: 'n',
      id: randomUUID(),
      email: `n-${tag}@${DOMAIN}`,
      phone: '+420700000000',
    };
    const c = await walk('N', 'x', ghost, MARKETING);
    expect(c.ingest).toMatch(/^404 /);
    expect(c.ingest.slice(4)).toBe(
      (report.X as Cell | undefined)?.ingest.slice(4) ?? c.ingest.slice(4),
    );
    expect(c.runs).toBe('no run');
    for (const [k, f] of Object.entries(c.flows)) expect(f.job, k).toBe('no job');
  }, 300_000);

  it('K1 — own active contact × marketing flows: every channel reaches (unchanged)', async () => {
    const c = await walk('K1', 'x', people.own, MARKETING);
    expect(c.ingest).toMatch(/^202 /);
    expect(c.events).toBe(1);
    expect(reached(c)).toEqual({ tpl: true, inline: true, sms: true, wa: true, push: true });
  }, 300_000);

  it('K2 — own unsubscribed contact × marketing flows: nothing reaches (unchanged)', async () => {
    const c = await walk('K2', 'x', people.unsub, MARKETING);
    expect(c.ingest).toMatch(/^202 /);
    expect(reached(c)).toEqual({ tpl: false, inline: false, sms: false, wa: false, push: false });
  }, 300_000);

  it('K3 — own unsubscribed contact × ticketing.order_paid transactional: reaches (unchanged)', async () => {
    const c = await walk('K3', 'tk', people.unsub, TRANSACTIONAL);
    expect(c.ingest).toMatch(/^202 /);
    expect(reached(c)).toEqual({ tTpl: true, tInline: true, tSms: true });
  }, 300_000);
});
