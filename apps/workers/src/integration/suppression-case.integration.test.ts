/**
 * A suppression stops mail to its address whatever case either side was
 * written in.
 *
 * ─── What was wrong (Z144, measured on master by sending) ────────────────────
 *
 * POST /suppressions stored the address as typed, and every reader compared
 * `suppressions.email` exactly against a lower-cased recipient. So a manual
 * suppression of ZZ@Test.Local stopped nothing sent to zz@test.local: the
 * campaign, the flow e-mail, /transactional/email, /emails and the SMTP RCPT
 * all went through. The other way round (row lower, contact in capitals) was
 * stopped, but the pre-send panel still counted the address: 2 counted, 1 sent.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * A campaign through the splitter → batch-sender → mta-sender, a flow's
 * send-email as workflow-email-sender posts it, both transactional routes and
 * the engine's RCPT check. The gRPC client is the only stub. Three shapes of
 * the same refusal: written in capitals through the API, written lower-case
 * against a contact in capitals, and a raw row in capitals — what a row
 * written before migration 0034 looks like. A clean control on the same list
 * must arrive every time.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import {
  batchSenderQueues,
  batchSenderQueue,
  campaignSplitterQueue,
  mtaQueues,
  type BatchSenderJobData,
  type CampaignSplitterJobData,
  type MtaSendJobData,
} from '../queues/index.js';

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({ handed: [] as { to: string; subject: string }[] }));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string; subject: string }) => {
    engine.handed.push({ to: msg.toEmail, subject: msg.subject });
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
const sendingDomain = `scase-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const INTERNAL = { 'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '' };

let seed: SeedOrg;
let token: string;
const listIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `scase-${randomUUID()}`,
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

/** Run every queued MTA job for `to` through the real processor, then drop it. */
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
      out.push(r.status);
    } catch (err) {
      out.push(`threw: ${(err as Error).message}`);
    }
    await j.remove().catch(() => {});
  }
  return out;
}

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

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await call(method, path, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`[scase] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
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
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`scase ${name} ${tag}`}) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

/** An active contact on `listId`, its address stored exactly as given. */
async function contactOn(listId: string, email: string): Promise<string> {
  allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
  `;
  contactIds.push(c!.id);
  await sql`INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${c!.id}, ${listId}, now())`;
  return c!.id;
}

/** A suppression as an operator types it into POST /suppressions. */
async function suppressViaApi(email: string, reason: string): Promise<void> {
  await api('POST', '/api/v1/suppressions', { email, reason });
}

/** A row as one written before migration 0034 lower-cased the table. */
async function suppressRaw(email: string, reason: string): Promise<void> {
  await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, ${reason}::suppression_reason)`;
}

async function preSendCount(campaignId: string): Promise<string> {
  const res = await call('GET', `/api/v1/campaigns/${campaignId}/pre-send-checks`);
  const text = await res.text();
  if (/No recipients in selected audience/.test(text)) return '0';
  const m = /"title":"([\d,]+) recipients"/.exec(text);
  return m ? m[1]!.replace(/,/g, '') : `? ${res.status} ${text.slice(0, 120)}`;
}

/** A campaign to `listId`, all the way to the engine: the pre-send count and who it reached. */
async function campaignTo(listId: string, recipients: string[]) {
  const subject = `Novinky ${tag}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `scase ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
  createdCampaigns.push(campaignId);
  const count = await preSendCount(campaignId);

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
  for (const to of recipients) await deliver(to);
  const reached = engine.handed.filter((m) => m.subject === subject).map((m) => m.to);
  console.log(`[scase] campaign count=${count} reached=${JSON.stringify(reached)}`);
  return { count, reached };
}

/** A flow's send-email step, as workflow-email-sender posts it, through the triggered batch queue. */
async function flowEmail(contactId: string, email: string): Promise<boolean> {
  const subject = `Flow ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `scase flow ${tag}`,
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
  await deliver(email);
  const reached = engine.handed.some((m) => m.to === email && m.subject === subject);
  console.log(`[scase] flow ${email} reached=${reached}`);
  return reached;
}

/** One receipt through `route` to `to`: did it reach the engine. */
async function receipt(route: '/transactional/email' | '/emails', to: string): Promise<boolean> {
  const subject = `Faktura ${randomUUID().slice(0, 6)}`;
  const res = await call('POST', `/api/v1${route}`, {
    from: fromEmail,
    to,
    subject,
    html: '<p>x</p>',
  });
  const answer = `${res.status} ${(await res.text()).slice(0, 100)}`;
  engine.handed.length = 0;
  const mta = await deliver(to);
  const reached = engine.handed.some((m) => m.to === to && m.subject === subject);
  console.log(`[scase] ${route} ${to}: ${answer} mta=${JSON.stringify(mta)} engine=${reached}`);
  return reached;
}

/** What the engine asks on every RCPT TO of an SMTP submission. */
async function smtpAccepts(rcpt: string): Promise<boolean> {
  const r = await fetch(`${API}/api/v1/internal/smtp/rcpt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...INTERNAL },
    body: JSON.stringify({ orgId: seed.id, rcpt }),
  });
  const body = (await r.json()) as { data?: { accept?: boolean } };
  return body.data?.accept === true;
}

describe('a suppression stops mail to its address whatever the case', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await seedApiKey(sql, 'scase');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND lower(email) LIKE ${`%-${tag}@test.local`}`;
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

  it('a campaign and a flow skip the address in either case, and the pre-send count is what is sent', async () => {
    const listId = await newList('marketing');
    // Suppressed in capitals through the API; the contact is lower-case.
    const apiUpper = `scase-api-${tag}@test.local`;
    const apiUpperId = await contactOn(listId, apiUpper);
    await suppressViaApi(apiUpper.toUpperCase(), 'manual');
    // Suppressed lower-case; the contact was imported in capitals.
    const contactUpper = `SCASE-CRM-${tag.toUpperCase()}@Test.Local`;
    const contactUpperId = await contactOn(listId, contactUpper);
    await suppressViaApi(contactUpper.toLowerCase(), 'manual');
    // A row in capitals written before migration 0034.
    const legacy = `scase-legacy-${tag}@test.local`;
    const legacyId = await contactOn(listId, legacy);
    await suppressRaw(legacy.toUpperCase(), 'unsubscribe');
    const control = `scase-control-${tag}@test.local`;
    const controlId = await contactOn(listId, control);

    const sent = await campaignTo(listId, [apiUpper, contactUpper, legacy, control]);
    expect(sent.reached).toEqual([control]);
    expect(sent.count, 'the pre-send count is what is sent').toBe(String(sent.reached.length));

    expect(await flowEmail(apiUpperId, apiUpper)).toBe(false);
    expect(await flowEmail(contactUpperId, contactUpper)).toBe(false);
    expect(await flowEmail(legacyId, legacy)).toBe(false);
    expect(await flowEmail(controlId, control)).toBe(true);

    // Stored the way it is looked up.
    const [row] = await sql<{ email: string }[]>`
      SELECT email FROM suppressions WHERE org_id = ${seed.id} AND lower(email) = ${apiUpper}
    `;
    expect(row!.email).toBe(apiUpper);
  }, 600_000);

  it('a receipt and an SMTP RCPT stop on a manual row in capitals; an unsubscribe still lets a receipt through', async () => {
    const manual = `scase-txmanual-${tag}@test.local`;
    allAddresses.push(manual);
    await suppressRaw(manual.toUpperCase(), 'manual');
    expect(await receipt('/transactional/email', manual)).toBe(false);
    expect(await receipt('/emails', manual)).toBe(false);
    expect(await smtpAccepts(manual)).toBe(false);

    // Unchanged rule (#225): an unsubscribe is from marketing, not from receipts.
    const unsub = `scase-txunsub-${tag}@test.local`;
    allAddresses.push(unsub);
    await suppressRaw(unsub.toUpperCase(), 'unsubscribe');
    expect(await receipt('/transactional/email', unsub)).toBe(true);
    expect(await receipt('/emails', unsub)).toBe(true);
    expect(await smtpAccepts(unsub)).toBe(true);

    const clean = `scase-txclean-${tag}@test.local`;
    allAddresses.push(clean);
    expect(await receipt('/transactional/email', clean)).toBe(true);
  }, 300_000);
});
