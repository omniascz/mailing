/**
 * Only the recipient raises a contact to 'active'. An SMS keyword and an edit
 * do not turn a contact that never said yes into a marketing recipient.
 *
 * ─── What was wrong (Z147, measured on master by sending) ────────────────────
 *
 * The SMS keyword with action 'subscribe' found the contact by phone and wrote
 * 'active' over every status except unsubscribed and complained: pending (the
 * double opt-in never confirmed), non_subscribed, bounced, and an archive of
 * any of them. Nothing else was written — no sms_consents row, no list row, no
 * consent_events row — and the next e-mail campaign reached the contact. A
 * text from a number is consent to SMS, not proof that the person behind the
 * e-mail address wants marketing.
 *
 * PUT /contacts/:id refused pending/non_subscribed → active, but in the route,
 * not in updateContact, and with a generic CONFLICT.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Contacts with a phone in each of those states, on one list with an active
 * control, text the subscribe keyword: each keeps its status, and a campaign
 * through the splitter → batch-sender → mta-sender (the gRPC client is the only
 * stub) reaches only the control. An edit to 'active' answers 409
 * CONSENT_REQUIRED. A keyword from an unknown number still creates a contact,
 * and STOP still unsubscribes.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authHeaders, seedApiKey } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processAtOrgRate } from './setup/process-at-org-rate.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import {
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
const sendingDomain = `nrwr-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const keyword = `nrin${tag.slice(0, 4)}`;
const stopKeyword = `nrstop${tag.slice(0, 4)}`;

let seed: SeedOrg;
let owner: string;
const listIds: string[] = [];
const keywordIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const phones: string[] = [];
let phoneSeq = 0;

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `nrwr-${randomUUID()}`,
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
async function deliver(to: string): Promise<void> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail === to);
  for (const j of jobs) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    await processAtOrgRate(last as unknown as Job<MtaSendJobData>).catch(() => {});
    await j.remove().catch(() => {});
  }
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...authHeaders(owner),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, body: await res.text() };
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await call(method, path, body);
  if (res.status >= 300) throw new Error(`[nrwr] ${method} ${path} → ${res.status}: ${res.body}`);
  return res.body ? JSON.parse(res.body) : null;
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
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`nrwr ${name} ${tag}`}) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

async function onList(listId: string, contactId: string): Promise<void> {
  await sql`
    INSERT INTO contact_lists (contact_id, list_id, confirmed_at)
    VALUES (${contactId}, ${listId}, now()) ON CONFLICT DO NOTHING
  `;
}

const newPhone = () => {
  const phone = `+420778${tag.replace(/\D/g, '').padEnd(3, '0').slice(0, 3)}${String(++phoneSeq).padStart(3, '0')}`;
  phones.push(phone);
  return phone;
};

/** A contact written straight to the table, in the given state. */
async function contactRow(name: string, status: string, archivedFrom: string | null = null) {
  const email = `nrwr-${name}-${tag}@test.local`;
  const phone = newPhone();
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, phone, first_name, status, archived_from)
    VALUES (${seed.id}, ${email}, ${phone}, 'Petra', ${status}, ${archivedFrom}) RETURNING id
  `;
  contactIds.push(c!.id);
  return { id: c!.id, email, phone };
}

async function statusOf(id: string): Promise<string> {
  const [row] = await sql<{ status: string }[]>`
    SELECT status::text AS status FROM contacts WHERE id = ${id}
  `;
  return row!.status;
}

/** A campaign to `listId`, all the way to the engine: who it reached. */
async function campaignTo(listId: string, recipients: string[]): Promise<string[]> {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `nrwr ${tag}`,
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
  for (const to of recipients) await deliver(to);
  const reached = engine.handed
    .filter((m) => m.subject === subject)
    .map((m) => m.to)
    .sort();
  console.log(`[nrwr] campaign reached=${JSON.stringify(reached)}`);
  return reached;
}

/** A key acting as the owner, its own rate-limit bucket. */
async function ownerKey(): Promise<string> {
  const key = await seedApiKey(sql, `nrwr-owner-${tag}`);
  await sql`
    UPDATE api_keys SET role = 'owner'
    WHERE key_hash = ${createHash('sha256').update(key).digest('hex')}
  `;
  return key;
}

describe('only the recipient raises a contact to active', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    owner = await ownerKey();
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
    const listId = await newList('keyword');
    for (const [k, action] of [
      [keyword, 'subscribe'],
      [stopKeyword, 'unsubscribe'],
    ] as const) {
      const created = (await api('POST', '/api/v1/sms/keywords', {
        keyword: k,
        action,
        listId,
      })) as { data: { id: string } };
      keywordIds.push(created.data.id);
    }
  }, 120_000);

  afterAll(async () => {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM contacts WHERE org_id = ${seed.id} AND phone = ANY(${phones})
    `;
    const ids = [...new Set([...contactIds, ...rows.map((r) => r.id)])];
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    if (ids.length) {
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${ids})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${ids})`;
    }
    await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email LIKE ${`%-${tag}@test.local`}`;
    if (keywordIds.length) await sql`DELETE FROM sms_keywords WHERE id = ANY(${keywordIds})`;
    if (listIds.length) await sql`DELETE FROM lists WHERE id = ANY(${listIds})`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 180_000);

  it('the subscribe keyword leaves pending, non_subscribed, bounced and their archives as they are, and the campaign reaches only the control', async () => {
    const listId = await newList('marketing');
    const subjects = [
      { ...(await contactRow('pending', 'pending')), expected: 'pending' },
      { ...(await contactRow('nonsub', 'non_subscribed')), expected: 'non_subscribed' },
      { ...(await contactRow('bounced', 'bounced')), expected: 'bounced' },
      { ...(await contactRow('arch-pending', 'archived', 'pending')), expected: 'archived' },
    ];
    const control = await contactRow('control', 'active');
    for (const c of [...subjects, control]) await onList(listId, c.id);

    for (const c of subjects) {
      const res = await call('POST', '/api/v1/sms/inbound', { fromPhone: c.phone, body: keyword });
      expect(res.status, res.body).toBe(200);
      expect(JSON.parse(res.body).data.matched).toBe(true);
      expect(await statusOf(c.id), c.email).toBe(c.expected);
    }

    const reached = await campaignTo(listId, [...subjects.map((c) => c.email), control.email]);
    expect(reached).toEqual([control.email]);
  }, 600_000);

  it('an edit to active from pending, non_subscribed or an archive of them: 409 CONSENT_REQUIRED, status kept', async () => {
    for (const [status, archivedFrom] of [
      ['pending', null],
      ['non_subscribed', null],
      ['archived', 'pending'],
    ] as const) {
      const c = await contactRow(`put-${status}-${archivedFrom ?? 'x'}`, status, archivedFrom);
      const res = await call('PUT', `/api/v1/contacts/${c.id}`, { status: 'active' });
      expect(res.status, res.body).toBe(409);
      expect(JSON.parse(res.body).code, res.body).toBe('CONSENT_REQUIRED');
      expect(await statusOf(c.id)).toBe(status);
    }
  }, 120_000);

  it('a keyword from an unknown number still creates a contact, and STOP still unsubscribes', async () => {
    const unknown = newPhone();
    const res = await call('POST', '/api/v1/sms/inbound', { fromPhone: unknown, body: keyword });
    expect(res.status, res.body).toBe(200);
    const created = await sql<{ status: string; email: string | null }[]>`
      SELECT status::text AS status, email FROM contacts WHERE org_id = ${seed.id} AND phone = ${unknown}
    `;
    // Z172: klíčové slovo je souhlas k SMS, ne k e-mailu (položka 5) — was 'active'.
    expect(created).toEqual([{ status: 'non_subscribed', email: null }]);

    const leaving = await contactRow('stop', 'active');
    const stop = await call('POST', '/api/v1/sms/inbound', {
      fromPhone: leaving.phone,
      body: stopKeyword,
    });
    expect(stop.status, stop.body).toBe(200);
    expect(await statusOf(leaving.id)).toBe('unsubscribed');
  }, 120_000);
});
