/**
 * A contact who signed up and has not confirmed the double opt-in gets no
 * marketing — no campaign, no flow, no SMS, no WhatsApp — until they confirm.
 *
 * ─── What was wrong (Z143, measured on master by sending) ────────────────────
 *
 * A DOI signup form makes the contact 'pending' and puts them on the list with
 * confirmed_at NULL. The audience query excluded only archived and
 * non_subscribed, and batch-sender refused only unsubscribed, bounced and
 * complained. So the next campaign and a flow's e-mail reached a person who
 * had not confirmed anything; the pre-send count included them; an SMS
 * campaign queued them and the job passed the consent gate (an sms_consents
 * row is about the number, not the double opt-in); a WhatsApp campaign queued
 * them and the worker checks nothing. Pending is not consent (480/2004 Sb.).
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The real form submit, the real DOI e-mail (its confirm link is read out of
 * the MTA job), campaigns through the splitter → batch-sender → mta-sender, a
 * flow's send-email and send-sms as the workers post them, an SMS campaign to
 * a catch-all route whose provider does not exist — getting past consent ends
 * on "Unknown SMS provider", so no SMS leaves — and the WhatsApp worker. The
 * gRPC client is the only stub. A clean control on the same list must arrive
 * every time.
 *
 * WHAT THIS FILE CANNOT SEE
 * - Real SMS and WhatsApp providers; push.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, type Job, type JobType } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import { processWhatsappSend, type WhatsappSendJobData } from '../jobs/whatsapp-sender.js';
import {
  connection,
  batchSenderQueues,
  batchSenderQueue,
  campaignSplitterQueue,
  mtaQueues,
  type BatchSenderJobData,
  type CampaignSplitterJobData,
  type MtaSendJobData,
} from '../queues/index.js';

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({
  handed: [] as { to: string; subject: string }[],
  answer: new Map<string, { code: number; message: string }>(),
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string }) => {
    engine.handed.push({ to: msg.toEmail, subject: msg.subject });
    const a = engine.answer.get(msg.toEmail);
    return {
      success: !a,
      messageId: 'm',
      smtpCode: a?.code ?? 250,
      smtpMessage: a?.message ?? 'OK',
      error: '',
      durationMs: '1',
      sendingIp: '',
    };
  },
}));

const API = process.env.API_URL!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const tag = randomUUID().slice(0, 8);
const sendingDomain = `pnd-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `pnd-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
const listIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `pnd-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  }) as unknown as Job<T>;

async function idsOn(queue: Queue): Promise<Set<string>> {
  const jobs = await queue.getJobs([...ALL_STATES, 'completed'], 0, 5_000);
  return new Set(jobs.map((j) => String(j?.id)));
}

async function addedTo<T>(queue: Queue, before: Set<string>): Promise<T[]> {
  const jobs = await queue.getJobs([...ALL_STATES, 'completed'], 0, 5_000);
  return jobs.filter((j) => j && !before.has(String(j.id))).map((j) => j.data as T);
}

/**
 * Run every queued MTA job for `to` through the real processor as its LAST
 * attempt — so a 4xx is recorded as the soft bounce it finally is rather than
 * a deferral — then drop it.
 */
async function deliver(to: string): Promise<string[]> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail === to);
  const out: string[] = [];
  for (const j of jobs) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      out.push(`${j.data.subject} → ${r.status}`);
    } catch (err) {
      out.push(`${j.data.subject} → threw: ${(err as Error).message}`);
    }
    await j.remove().catch(() => {});
  }
  return out;
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<Response> {
  const isText = typeof body === 'string';
  return fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? authHeaders(token) : {}),
      ...(body === undefined ? {} : { 'Content-Type': isText ? 'text/plain' : 'application/json' }),
      ...extra,
    },
    ...(body === undefined ? {} : { body: isText ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await call(method, path, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`[pnd] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

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

async function newList(name: string): Promise<string> {
  const [list] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`pnd ${name} ${tag}`}) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

/** An active contact on `listId`. Anything else about it is done through routes. */
async function contactOn(listId: string, name: string): Promise<{ id: string; email: string }> {
  const email = addr(name);
  allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
  `;
  contactIds.push(c!.id);
  await sql`INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${c!.id}, ${listId}, now())`;
  return { id: c!.id, email };
}

/**
 * A marketing campaign to `listId`, all the way to the engine. Returns the
 * addresses the engine was handed THIS campaign for.
 */
async function campaignTo(listId: string, label: string, recipients: string[]): Promise<string[]> {
  const subject = `Novinky ${label} ${tag}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `pnd ${label} ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
  createdCampaigns.push(campaignId);

  const beforeSplit = await idsOn(campaignSplitterQueue);
  await api('POST', `/api/v1/campaigns/${campaignId}/send`);
  const [split] = (
    await addedTo<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)
  ).filter((d) => d.campaignId === campaignId);
  expect(split, 'no splitter job').toBeTruthy();
  const beforeBatch = await idsOn(batchSenderQueue);
  await processCampaignSplitter(job(split!));
  const batches = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
    (d) => d.campaignId === campaignId,
  );
  for (const b of batches) await processBatchSender(job(b));

  engine.handed.length = 0;
  const log: string[] = [];
  for (const to of recipients)
    log.push(`${to.split('@')[0]}: ${JSON.stringify(await deliver(to))}`);
  const reached = engine.handed.filter((m) => m.subject === subject).map((m) => m.to);
  console.log(`[pnd] campaign "${label}" mta=${log.join(' | ')} engine=${JSON.stringify(reached)}`);
  return reached;
}

/** One transactional message through /emails, to the engine. */
async function transactional(to: string): Promise<string> {
  const subject = `Faktura ${randomUUID().slice(0, 6)}`;
  await api('POST', '/api/v1/emails', { from: fromEmail, to, subject, html: '<p>x</p>' });
  engine.handed.length = 0;
  const r = await deliver(to);
  const reached = engine.handed.some((m) => m.to === to && m.subject === subject);
  console.log(`[pnd] transactional ${to.split('@')[0]} mta=${JSON.stringify(r)} engine=${reached}`);
  return reached ? 'reached' : 'not reached';
}

const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };

/** A signup form with double opt-in onto `listId`. */
async function doiForm(listId: string): Promise<string> {
  const [f] = await sql<{ id: string }[]>`
    INSERT INTO signup_forms (org_id, list_id, name, fields, config)
    VALUES (${seed.id}, ${listId}, ${`pnd form ${tag}`},
            '[{"name":"email","label":"E-mail","type":"email","required":true}]'::jsonb,
            '{"doubleOptIn":true}'::jsonb)
    RETURNING id
  `;
  formIds.push(f!.id);
  return f!.id;
}
const formIds: string[] = [];

/** Someone fills in the form: a pending contact on the list, a DOI e-mail queued. */
async function signUp(formId: string, name: string, phone?: string) {
  const email = addr(name);
  allAddresses.push(email);
  const res = await call('POST', `/public/forms/${formId}/submit`, {
    email,
    ...(phone ? { phone } : {}),
  });
  const body = await res.text();
  expect(res.status, body).toBe(200);
  const [c] = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM contacts WHERE org_id = ${seed.id} AND email = ${email}
  `;
  contactIds.push(c!.id);
  return { id: c!.id, email, status: c!.status };
}

/** The confirm link out of the DOI e-mail the MTA was handed. */
async function doiLink(email: string): Promise<string | null> {
  const jobs = (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[];
  for (const j of jobs) {
    if (j?.data?.toEmail !== email) continue;
    const m = /\/api\/v1\/confirm\/([0-9a-f-]{36})/.exec(
      String(j.data.htmlBody ?? (j.data as unknown as { html?: string }).html ?? ''),
    );
    if (m) return `/api/v1/confirm/${m[1]}`;
  }
  return null;
}

async function preSendCount(campaignId: string): Promise<string> {
  const res = await call('GET', `/api/v1/campaigns/${campaignId}/pre-send-checks`);
  const text = await res.text();
  if (/No recipients in selected audience/.test(text)) return '0';
  const m = /"title":"([\d,]+) recipients"/.exec(text);
  return m ? m[1]!.replace(/,/g, '') : `? ${res.status} ${text.slice(0, 120)}`;
}

/** Email campaign to a list, reporting the pre-send count and what reached the engine. */
async function emailCampaign(listId: string, label: string, recipients: string[]) {
  const subject = `Novinky ${label} ${tag}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `pnd ${label} ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  createdCampaigns.push(created.data.id);
  const count = await preSendCount(created.data.id);
  createdCampaigns.pop();
  await sql`DELETE FROM campaigns WHERE id = ${created.data.id}`;
  const reached = await campaignTo(listId, label, recipients);
  return { count, reached };
}

/** A flow's send-email step, as workflow-email-sender posts it, through the triggered batch queue. */
async function flowEmail(contactId: string, email: string, label: string): Promise<boolean> {
  const subject = `Flow ${label} ${tag}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `pnd flow ${label} ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  createdCampaigns.push(created.data.id);
  const before = await idsOn(batchSenderQueues.triggered);
  const res = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...INTERNAL },
    body: JSON.stringify({ orgId: seed.id, contactId, campaignId: created.data.id, subject }),
  });
  expect(res.status, await res.text()).toBe(200);
  const jobs = await addedTo<BatchSenderJobData>(batchSenderQueues.triggered, before);
  for (const b of jobs.filter((d) => d.contactIds?.includes(contactId)))
    await processBatchSender(job(b));
  for (const j of await batchSenderQueues.triggered.getJobs(ALL_STATES, 0, 5_000))
    if (j && !before.has(String(j.id))) await j.remove().catch(() => {});
  engine.handed.length = 0;
  const d = await deliver(email);
  const reached = engine.handed.some((m) => m.to === email && m.subject === subject);
  console.log(
    `[pnd] flow ${label}: batches=${jobs.length} mta=${JSON.stringify(d)} reached=${reached}`,
  );
  return reached;
}

/** An SMS campaign to the list; each queued job posted as workflow-sms-sender posts it. */
async function smsCampaign(listId: string, label: string, phones: Record<string, string>) {
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `pnd sms ${label} ${tag}`,
    type: 'sms',
    listId,
    // validateCampaignReadiness asks an SMS campaign for these too (MIMO).
    subject: `SMS ${label}`,
    fromName: 'Obchod',
    fromEmail,
    content: { body: `Akce ${label}` },
  })) as { data: { id: string } };
  createdCampaigns.push(created.data.id);
  const smsQ = new Queue('sms', { connection });
  const before = await idsOn(smsQ);
  // An SMS body has no unsubscribe link, so the e-mail-minded gate says no-go;
  // the owner acknowledges it, as the UI lets them.
  const send = await call('POST', `/api/v1/campaigns/${created.data.id}/send`, {
    acknowledgeDeliverabilityRisk: true,
  });
  const sendText = await send.text();
  const jobs = (await smsQ.getJobs([...ALL_STATES, 'completed', 'failed'], 0, 5_000)).filter(
    (j) =>
      j &&
      !before.has(String(j.id)) &&
      (j.data as { campaignId?: string }).campaignId === created.data.id,
  );
  const result: Record<string, string> = {};
  for (const [name, phone] of Object.entries(phones)) {
    const j = jobs.find((x) => (x.data as { phone: string }).phone === phone);
    if (!j) {
      result[name] = 'not enqueued';
      continue;
    }
    const r = await fetch(`${API}/api/v1/internal/workflow/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...INTERNAL },
      body: JSON.stringify(j.data),
    });
    // Past the consent gate the sink route's unknown provider is reached:
    // that is "would have been sent", and nothing leaves the machine.
    result[name] = `${r.status} ${(await r.text()).slice(0, 110)}`;
  }
  for (const j of jobs) await j.remove().catch(() => {});
  await smsQ.close();
  console.log(
    `[pnd] sms ${label}: send=${send.status} ${sendText.slice(0, 80)} jobs=${jobs.length}`,
  );
  return result;
}

/**
 * What a flow's send_sms step posts — exactly the job executeSendSms queues
 * (actions.ts): workflowRunId, no workflowId. This used to post a made-up
 * workflowId, which no real flow sends, so it walked a path production never
 * takes and stayed green while a real flow SMS reached a pending contact
 * (measured, Z154). The contact-state gate keys on workflowRunId (Z155).
 */
async function flowSms(contactId: string, phone: string): Promise<string> {
  const r = await fetch(`${API}/api/v1/internal/workflow/send-sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...INTERNAL },
    body: JSON.stringify({
      orgId: seed.id,
      contactId,
      workflowRunId: randomUUID(),
      phone,
      message: 'Akce z flow',
    }),
  });
  return `${r.status} ${await r.text()}`;
}

describe('a contact who has not confirmed the double opt-in gets no marketing', () => {
  const sinkProvider = `pnd-sink-${tag}`;

  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await seedApiKey(sql, 'pnd');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    // A catch-all route to a provider nobody implements: a message that gets
    // past every consent gate fails on it with "Unknown SMS provider", and no
    // SMS leaves the machine.
    await sql`
      INSERT INTO sms_routes (org_id, country_code, provider, priority, active, config)
      VALUES (${seed.id}, '*', ${sinkProvider}, 1, true, ${sql.json({})})
    `;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    await sql`DELETE FROM sms_routes WHERE org_id = ${seed.id} AND provider = ${sinkProvider}`;
    await sql`DELETE FROM sms_consents WHERE org_id = ${seed.id} AND consent_context = ${`pnd-${tag}`}`;
    if (allAddresses.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email = ANY(${allAddresses})`;
    if (contactIds.length)
      await sql`DELETE FROM consent_events WHERE contact_id = ANY(${contactIds})`;
    if (formIds.length) {
      await sql`DELETE FROM signup_form_submissions WHERE form_id = ANY(${formIds})`;
      await sql`DELETE FROM signup_forms WHERE id = ANY(${formIds})`;
    }
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    if (contactIds.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 180_000);

  it('no campaign, no flow e-mail, no SMS; transactional still goes; DOI confirm opens marketing with proof', async () => {
    const listId = await newList('pending');
    const form = await doiForm(listId);
    const n = Math.floor(10_000_000 + Math.random() * 89_999_999);
    const pPhone = `+4207${n}`;
    const cPhone = `+4206${n}`;
    const p = await signUp(form, 'pending', pPhone);
    expect(p.status, 'a DOI sign-up is pending').toBe('pending');
    const control = await contactOn(listId, 'control');
    await sql`UPDATE contacts SET phone = ${cPhone} WHERE id = ${control.id}`;
    // Both numbers carry an SMS consent row: what stops the pending one must be
    // the unconfirmed double opt-in, not a missing SMS consent.
    for (const ph of [pPhone, cPhone])
      await sql`
        INSERT INTO sms_consents (org_id, phone, consent_source, consent_context)
        VALUES (${seed.id}, ${ph}, 'web_form', ${`pnd-${tag}`})
      `;
    const link = await doiLink(p.email);
    expect(link, 'the DOI e-mail with its confirm link').toBeTruthy();

    // Master: pre-send count 2, and the campaign reached both.
    const before = await emailCampaign(listId, 'pending', [p.email, control.email]);
    expect(before.reached).toContain(control.email);
    expect(before.reached).not.toContain(p.email);
    expect(before.count, 'the pre-send count is what is sent').toBe(String(before.reached.length));

    // Master: the flow e-mail reached them.
    expect(await flowEmail(control.id, control.email, 'control')).toBe(true);
    expect(await flowEmail(p.id, p.email, 'pending')).toBe(false);

    // Master: the SMS campaign queued them and the job got past consent.
    const sms = await smsCampaign(listId, 'pending', { pending: pPhone, control: cPhone });
    expect(sms.control).toContain(`Unknown SMS provider: ${sinkProvider}`);
    expect(sms.pending).toBe('not enqueued');
    // The send path refuses on its own, for a job the audience did not stop.
    expect(await flowSms(p.id, pPhone)).toContain('Contact has not confirmed the double opt-in');
    expect(await flowSms(control.id, cPhone)).toContain(`Unknown SMS provider: ${sinkProvider}`);

    // Unchanged: a receipt goes to a pending contact.
    expect(await transactional(p.email)).toBe('reached');

    // The confirmation is the way in, and it leaves its proof.
    const conf = await call('GET', link!);
    expect(conf.status).toBeLessThan(400);
    const [after] = await sql<{ status: string }[]>`SELECT status FROM contacts WHERE id = ${p.id}`;
    expect(after!.status).toBe('active');
    const proof = await sql<{ event_type: string; source: string; ip_hash: string | null }[]>`
      SELECT event_type, source, ip_hash FROM consent_events WHERE contact_id = ${p.id}
    `;
    expect(proof).toHaveLength(1);
    expect(proof[0]).toMatchObject({ event_type: 'double_opt_in', source: 'double_opt_in' });
    expect(proof[0]!.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    const confirmed = await emailCampaign(listId, 'confirmed', [p.email, control.email]);
    expect(confirmed.reached).toEqual(expect.arrayContaining([p.email, control.email]));
    expect(confirmed.count).toBe(String(confirmed.reached.length));
  }, 600_000);

  it('a WhatsApp campaign does not queue a pending contact, and the worker refuses one', async () => {
    const listId = await newList('wa');
    const form = await doiForm(listId);
    const n = Math.floor(10_000_000 + Math.random() * 89_999_999);
    const pPhone = `+4207${n}`;
    const cPhone = `+4206${n}`;
    const p = await signUp(form, 'wa-pending', pPhone);
    const control = await contactOn(listId, 'wa-control');
    await sql`UPDATE contacts SET phone = ${cPhone} WHERE id = ${control.id}`;
    const created = (await api('POST', '/api/v1/campaigns', {
      name: `pnd wa ${tag}`,
      type: 'whatsapp',
      listId,
      subject: 'WA',
      fromName: 'Obchod',
      fromEmail,
      content: { body: 'Akce WA' },
    })) as { data: { id: string } };
    createdCampaigns.push(created.data.id);
    const waQ = new Queue('whatsapp-send', { connection });
    try {
      const before = await idsOn(waQ);
      const send = await call('POST', `/api/v1/campaigns/${created.data.id}/send`, {
        acknowledgeDeliverabilityRisk: true,
      });
      expect(send.status, await send.text()).toBe(200);
      const jobs = (await waQ.getJobs([...ALL_STATES, 'completed', 'failed'], 0, 5_000)).filter(
        (j) =>
          j &&
          !before.has(String(j.id)) &&
          (j.data as { campaignId?: string }).campaignId === created.data.id,
      );
      const phones = jobs.map((j) => (j.data as { phone: string }).phone);
      for (const j of jobs) await j.remove().catch(() => {});
      // Master: both queued.
      expect(phones).toContain(cPhone);
      expect(phones).not.toContain(pPhone);
    } finally {
      await waQ.close();
    }

    // A job already queued (or put there by a workflow) stops at the worker,
    // before the adapter. WhatsApp is not configured here, so the control's
    // answer is the adapter's "unconfigured" — it got past the check.
    const job = (contactId: string, phone: string) =>
      ({
        data: { orgId: seed.id, contactId, phone, body: 'Akce WA' },
        log: async () => {},
      }) as unknown as Job<WhatsappSendJobData>;
    expect((await processWhatsappSend(job(p.id, pPhone))).status).toBe('skipped_pending');
    expect((await processWhatsappSend(job(control.id, cPhone))).status).toBe(
      'skipped_unconfigured',
    );
  }, 300_000);
});
