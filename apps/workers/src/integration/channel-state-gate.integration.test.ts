/**
 * SMS from a flow, WhatsApp and push (campaign and flow) reach no contact who
 * refuses marketing, no deleted contact and no contact that does not exist.
 *
 * ─── What was wrong (Z154, measured on master 9fec2ee) ───────────────────────
 *
 * The owner decided (13. 10.) that an unsubscribed, complained or pending
 * contact gets marketing on NO channel, and a flow is marketing. On master:
 * - a flow's SMS job carries workflowRunId and never workflowId, so
 *   routedSmsSend took it for transactional and never read the contact's
 *   status: 9/10 states reached the provider, pending included. The Z143 test
 *   posted a made-up workflowId, a path production never takes, and stayed
 *   green;
 * - the WhatsApp worker refused only 'pending'; the web push and mobile push
 *   workers checked nothing — a flow pushed to a deleted contact;
 * - a channel campaign's audience left out archived / non_subscribed / pending
 *   only, so unsubscribed, bounced and complained contacts were queued.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Real flows (POST /api/v1/events → executor → queue → the real worker, run in
 * this process), real campaigns (POST /campaigns/:id/send → channel dispatch),
 * and jobs for a contact that does not exist. Stubbed: ONLY the transport to
 * the provider — fetch to graph.facebook.com (WhatsApp), oauth2/fcm.googleapis
 * (FCM) and the web push endpoint host. SMS goes to a catch-all route whose
 * provider does not exist: "Unknown SMS provider" means past every gate, and
 * no SMS leaves the machine. workflow-sms-sender drops the API's 502 body, so
 * each settled SMS job's data is posted again to read why (as in Z143/Z154).
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real providers. Whether a flow SMS should also need sms_consents, quiet
 *   hours and the opt-out suffix (open question for the owner; unchanged).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Queue, type JobType, type Worker } from 'bullmq';
import { generateKeyPairSync, createECDH, randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { connection } from '../queues/index.js';
import { startWorkflowSmsWorker } from '../jobs/workflow-sms-sender.js';
import { startWhatsappSenderWorker } from '../jobs/whatsapp-sender.js';
import { startPushSenderWorker } from '../jobs/push-sender.js';
import { startMobilePushSenderWorker } from '../jobs/mobile-push-sender.js';

const API = process.env.API_URL!;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET! };
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });
const tag = randomUUID().slice(0, 8);
const sendingDomain = `csg-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const sinkProvider = `csg-sink-${tag}`;
const WEB_HOST = `wp-sink-${tag}.invalid`;
const ALL: JobType[] = [
  'waiting',
  'prioritized',
  'delayed',
  'paused',
  'active',
  'completed',
  'failed',
];

type State =
  | 'active'
  | 'non_subscribed'
  | 'pending'
  | 'unsub_consent' // unsubscribed, the number HAS an sms_consents row
  | 'bounced'
  | 'complained'
  | 'archived'
  | 'deleted';
const REFUSED: State[] = ['pending', 'unsub_consent', 'bounced', 'complained', 'archived'];

// ── transport stub ──────────────────────────────────────────────────────────
const hits = { wa: [] as string[], fcm: [] as string[], web: [] as string[] };
const realFetch = globalThis.fetch;
function stubTransport() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
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
    if (host === 'oauth2.googleapis.com')
      return Response.json({ access_token: 't', expires_in: 3600 });
    if (host === 'fcm.googleapis.com') {
      hits.fcm.push(
        (JSON.parse(String(init?.body)) as { message: { token: string } }).message.token,
      );
      return Response.json({ name: `projects/csg/messages/${hits.fcm.length}` });
    }
    if (host === WEB_HOST) {
      hits.web.push(url);
      return new Response(null, { status: 201 });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
}

// ── fixtures ────────────────────────────────────────────────────────────────
let seed: SeedOrg;
let token: string;
let countersBefore: { period_start: Date; sends: number }[] = [];
const workers: Worker[] = [];
const contactIds: string[] = [];
/** Every contact id a job on these queues may carry: real ones and the made-up one. */
const jobContactIds = new Set<string>();
const workflowIds: string[] = [];
const campaignIds: string[] = [];
const listIds: string[] = [];
const qs: Record<string, Queue> = {};
let vapidId: string | null = null;
let p256dh = '';
let authSecret = '';

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(token),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, text: await res.text() };
}

interface Person {
  id: string;
  phone: string;
  state: State;
}
let serial = 0;
async function person(state: State): Promise<Person> {
  const phone = `+4207${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`;
  const email = `csg-${state}-${++serial}-${tag}@test.local`;
  const status =
    state === 'unsub_consent' ? 'unsubscribed' : state === 'deleted' ? 'active' : state;
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, phone, first_name, status)
    VALUES (${seed.id}, ${email}, ${phone}, 'Petra', ${status}) RETURNING id
  `;
  const id = c!.id;
  contactIds.push(id);
  jobContactIds.add(id);
  if (state === 'deleted') await sql`UPDATE contacts SET deleted_at = now() WHERE id = ${id}`;
  // Every number has consent: only the contact's status can stop the send.
  await sql`
    INSERT INTO sms_consents (org_id, phone, consent_source, consent_context)
    VALUES (${seed.id}, ${phone}, 'web_form', ${`csg-${tag}`})
  `;
  await sql`
    INSERT INTO push_subscriptions (org_id, contact_id, endpoint, p256dh, auth)
    VALUES (${seed.id}, ${id}, ${`https://${WEB_HOST}/${id}`}, ${p256dh}, ${authSecret})
  `;
  await sql`
    INSERT INTO mobile_devices (org_id, contact_id, platform, token)
    VALUES (${seed.id}, ${id}, 'android', ${`tok-${id}`})
  `;
  return { id, phone, state };
}

async function flowWith(key: string, node: { type: string; config: Record<string, unknown> }) {
  const eventName = `csg-${key}-${tag}`;
  const nodes = [
    { id: 'trigger', type: 'trigger', config: {} },
    { id: 'send', type: node.type, config: node.config },
  ];
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO workflows (org_id, name, status, trigger_type, trigger_config, nodes, edges)
    VALUES (${seed.id}, ${eventName}, 'active', 'api_event', ${JSON.stringify({ eventName })}::jsonb,
            ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify([{ id: 'e1', source: 'trigger', target: 'send' }])}::jsonb)
    RETURNING id
  `;
  workflowIds.push(w!.id);
  return eventName;
}

/** The contact's jobs on the queue once settled, as "state returnvalue | replay". */
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

const SMS_REACHED = `Unknown SMS provider: ${sinkProvider}`;

describe('SMS from a flow, WhatsApp and push reach no contact who refuses marketing', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await seedApiKey(sql, `csg-${tag}`);
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
    const vk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pub = vk.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const rawPub = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(pub.x, 'base64url'),
      Buffer.from(pub.y, 'base64url'),
    ]);
    const [v] = await sql<{ id: string }[]>`
      INSERT INTO vapid_keys (org_id, public_key, private_key, active)
      VALUES (${seed.id}, ${rawPub.toString('base64url')},
              ${(vk.privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer).toString('base64url')}, true)
      RETURNING id
    `;
    vapidId = v!.id;
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    p256dh = ecdh.getPublicKey().toString('base64url');
    authSecret = randomBytes(16).toString('base64url');
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'csgphone';
    process.env.WHATSAPP_ACCESS_TOKEN = 'csgtoken';
    process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({
      project_id: 'csg',
      client_email: 'csg@csg.iam.gserviceaccount.com',
      private_key: rsa.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    });
    stubTransport();
    qs.sms = new Queue('sms', { connection });
    qs.wa = new Queue('whatsapp-send', { connection });
    qs.push = new Queue('push-send', { connection });
    qs.mpush = new Queue('mobile-push-send', { connection });
    workers.push(
      startWorkflowSmsWorker(),
      startWhatsappSenderWorker(),
      startPushSenderWorker(),
      startMobilePushSenderWorker(),
    );
  }, 120_000);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    for (const w of workers) await w.close();
    for (const q of Object.values(qs)) {
      for (const j of await q.getJobs(ALL, 0, 10_000)) {
        if (j && jobContactIds.has(j.data?.contactId)) await j.remove().catch(() => {});
      }
      await q.close();
    }
    if (workflowIds.length) {
      await sql`DELETE FROM workflow_runs WHERE workflow_id = ANY(${workflowIds})`;
      await sql`DELETE FROM workflows WHERE id = ANY(${workflowIds})`;
    }
    if (campaignIds.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${campaignIds})`;
      await sql`DELETE FROM sms_send_log WHERE campaign_id = ANY(${campaignIds})`;
      await sql`DELETE FROM push_send_log WHERE campaign_id = ANY(${campaignIds})`;
      await sql`DELETE FROM audit_logs WHERE resource_id = ANY(${campaignIds.map(String)})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${campaignIds})`;
    }
    if (contactIds.length) {
      await sql`DELETE FROM review_requests WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM workflow_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM sms_send_log WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM push_send_log WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM push_subscriptions WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM mobile_devices WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contact_tags WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    await sql`DELETE FROM sms_consents WHERE org_id = ${seed.id} AND consent_context = ${`csg-${tag}`}`;
    await sql`DELETE FROM sms_routes WHERE org_id = ${seed.id} AND provider = ${sinkProvider}`;
    if (vapidId) await sql`DELETE FROM vapid_keys WHERE id = ${vapidId}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql`DELETE FROM api_keys WHERE name = ${`integration csg-${tag}`}`;
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

  it('SMS from a real flow — marketing node, priority transactional node, review request', async () => {
    const flows = {
      marketing: await flowWith('sms', {
        type: 'send_sms',
        config: { message: 'Akce {{first_name}}' },
      }),
      transactional: await flowWith('smstx', {
        type: 'send_sms',
        config: { message: 'Vstupenka {{first_name}}', priority: 'transactional' },
      }),
      review: await flowWith('smsrev', {
        type: 'send_review_request',
        config: { channel: 'sms', message: 'Ohodnoťte nákup {{first_name}}' },
      }),
    };
    const got: Record<string, string> = {};
    for (const [kind, ev] of Object.entries(flows)) {
      await Promise.all(
        (['active', 'non_subscribed', ...REFUSED] as State[]).map(async (st) => {
          const p = await person(st);
          const r = await call('POST', '/api/v1/events', { contactId: p.id, eventName: ev });
          expect(r.status, r.text).toBeLessThan(300);
          got[`${kind}/${st}`] = await settled(qs.sms!, p.id);
        }),
      );
    }
    for (const kind of Object.keys(flows)) {
      // The job is exactly what the flow queues — no workflowId was added by hand.
      expect(got[`${kind}/active`]).toContain(SMS_REACHED);
      expect(got[`${kind}/non_subscribed`]).toContain(SMS_REACHED);
      expect(got[`${kind}/pending`], `${kind}/pending`).toContain('"code":"CONSENT_PENDING"');
      for (const st of ['unsub_consent', 'bounced', 'complained', 'archived'] as State[]) {
        expect(got[`${kind}/${st}`], `${kind}/${st}`).toContain('"code":"MARKETING_REFUSED"');
        expect(got[`${kind}/${st}`], `${kind}/${st}`).not.toContain(SMS_REACHED);
      }
    }
  }, 600_000);

  it('a flow SMS for a contact that is gone is refused (CONTACT_UNAVAILABLE)', async () => {
    const p = await person('deleted');
    const r = await fetch(`${API}/api/v1/internal/workflow/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...INTERNAL },
      body: JSON.stringify({
        orgId: seed.id,
        contactId: p.id,
        workflowRunId: randomUUID(),
        phone: p.phone,
        message: 'Akce',
      }),
    });
    const body = await r.text();
    expect(body).toContain('"code":"CONTACT_UNAVAILABLE"');
    expect(body).not.toContain(SMS_REACHED);
  });

  it('WhatsApp and web push from a real flow', async () => {
    const wa = await flowWith('wa', { type: 'send_whatsapp', config: { templateId: 'csg_flow' } });
    const push = await flowWith('push', {
      type: 'send_push',
      config: { title: 'Ahoj {{first_name}}', body: 'Flow push' },
    });
    const states: State[] = ['active', 'non_subscribed', ...REFUSED, 'deleted'];
    const got: Record<string, { job: string; reached: boolean }> = {};
    for (const [ch, ev] of [
      ['wa', wa],
      ['push', push],
    ] as const) {
      await Promise.all(
        states.map(async (st) => {
          const p = await person(st);
          await call('POST', '/api/v1/events', { contactId: p.id, eventName: ev });
          const job = await settled(ch === 'wa' ? qs.wa! : qs.push!, p.id);
          const reached =
            ch === 'wa'
              ? hits.wa.includes(p.phone.replace(/\D/g, ''))
              : hits.web.some((u) => u.endsWith(p.id));
          got[`${ch}/${st}`] = { job, reached };
        }),
      );
    }
    for (const ch of ['wa', 'push']) {
      expect(got[`${ch}/active`]!.reached, `${ch}/active`).toBe(true);
      expect(got[`${ch}/non_subscribed`]!.reached, `${ch}/non_subscribed`).toBe(true);
      expect(got[`${ch}/pending`]!.job).toContain('skipped_pending');
      for (const st of ['unsub_consent', 'bounced', 'complained', 'archived'] as State[]) {
        expect(got[`${ch}/${st}`]!.reached, `${ch}/${st}`).toBe(false);
        expect(got[`${ch}/${st}`]!.job, `${ch}/${st}`).toContain('skipped_refused');
      }
      expect(got[`${ch}/deleted`]!.reached, `${ch}/deleted`).toBe(false);
    }
    // A flow loads no deleted contact, so its WhatsApp job has no phone; its
    // push job has nothing to stop it but the status read.
    expect(got['wa/deleted']!.job).toContain('skipped_no_phone');
    expect(got['push/deleted']!.job).toContain('skipped_no_contact');
  }, 600_000);

  it('WhatsApp and push campaigns queue none of them, and the workers refuse a job that slips through', async () => {
    const states: State[] = ['active', 'non_subscribed', ...REFUSED, 'deleted'];
    for (const type of ['whatsapp', 'push'] as const) {
      const [list] = await sql<{ id: string }[]>`
        INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`csg ${type} ${tag}`}) RETURNING id
      `;
      listIds.push(list!.id);
      const people: Person[] = [];
      for (const st of states) {
        const p = await person(st);
        await sql`INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${p.id}, ${list!.id}, now())`;
        people.push(p);
      }
      const created = await call('POST', '/api/v1/campaigns', {
        name: `csg ${type} ${tag}`,
        type,
        listId: list!.id,
        subject: `csg ${type}`,
        fromName: 'Obchod',
        fromEmail,
        content:
          type === 'whatsapp'
            ? { templateId: 'csg_campaign', language: 'cs' }
            : { title: 'Kampaň', body: 'Push' },
      });
      const id = (JSON.parse(created.text) as { data: { id: string } }).data.id;
      campaignIds.push(id);
      const send = await call('POST', `/api/v1/campaigns/${id}/send`, {
        acknowledgeDeliverabilityRisk: true,
      });
      expect(send.status, send.text).toBe(200);
      const [row] = await sql<
        { total_sent: number }[]
      >`SELECT total_sent FROM campaigns WHERE id = ${id}`;
      // active + non_subscribed? non_subscribed is left out of a channel
      // campaign as it always was; only active is queued.
      expect(row!.total_sent).toBe(1);
      await Promise.all(
        people.map(async (p) => {
          const q = type === 'whatsapp' ? qs.wa! : qs.push!;
          const job = await settled(q, p.id);
          const reached =
            type === 'whatsapp'
              ? hits.wa.includes(p.phone.replace(/\D/g, ''))
              : hits.web.some((u) => u.endsWith(p.id));
          expect(reached, `${type}/${p.state}`).toBe(p.state === 'active');
          if (p.state !== 'active') expect(job, `${type}/${p.state}`).toBe('no job');
          if (type === 'push') {
            const mjob = await settled(qs.mpush!, p.id);
            expect(hits.fcm.includes(`tok-${p.id}`), `mobile/${p.state}`).toBe(
              p.state === 'active',
            );
            if (p.state !== 'active') expect(mjob).toBe('no job');
          }
        }),
      );
    }

    // A job queued before the status changed — or for a contact that was
    // deleted or never existed — is stopped by the worker itself.
    const direct: Person[] = [];
    for (const st of ['unsub_consent', 'bounced', 'complained', 'archived', 'deleted'] as State[])
      direct.push(await person(st));
    const ghost: Person = { id: randomUUID(), phone: '+420700000000', state: 'deleted' };
    jobContactIds.add(ghost.id);
    const expectFor = (p: Person) =>
      p === ghost || p.state === 'deleted' ? 'skipped_no_contact' : 'skipped_refused';
    for (const p of [...direct, ghost]) {
      const campaignId = campaignIds[0];
      await qs.wa!.add('csg', {
        orgId: seed.id,
        contactId: p.id,
        phone: p.phone,
        templateId: 'csg_direct',
      });
      await qs.push!.add('csg', { orgId: seed.id, contactId: p.id, title: 'Kampaň', body: 'Push' });
      await qs.mpush!.add('csg', {
        orgId: seed.id,
        contactId: p.id,
        title: 'Kampaň',
        body: 'Push',
        campaignId,
      });
    }
    for (const p of [...direct, ghost]) {
      const label = p === ghost ? 'not found' : p.state;
      expect(await settled(qs.wa!, p.id), `wa/${label}`).toContain(expectFor(p));
      expect(await settled(qs.push!, p.id), `push/${label}`).toContain(expectFor(p));
      expect(await settled(qs.mpush!, p.id), `mobile/${label}`).toContain(expectFor(p));
      expect(hits.wa.includes(p.phone.replace(/\D/g, '')), `wa/${label}`).toBe(false);
      expect(
        hits.web.some((u) => u.endsWith(p.id)),
        `push/${label}`,
      ).toBe(false);
      expect(hits.fcm.includes(`tok-${p.id}`), `mobile/${label}`).toBe(false);
    }
  }, 600_000);

  it('a transactional SMS to an unsubscribed contact number still goes (unchanged)', async () => {
    const p = await person('unsub_consent');
    const r = await call('POST', '/api/v1/messaging/send', {
      channel: 'sms',
      payload: { to: p.phone, text: 'Kód 1234' },
    });
    expect(r.text).toContain(SMS_REACHED);
  });
});
