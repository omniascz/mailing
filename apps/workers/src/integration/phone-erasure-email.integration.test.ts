/**
 * The e-mail side of an erasure is unchanged by the number's fingerprint
 * (Z180, controls K): the erasure of a contact with an address AND a number
 * now writes two rows, and the address's row must still behave exactly as on
 * master — the double opt-in confirmation goes to the erased address, an
 * ordinary 'manual' row still stops it, and a campaign does not reach the
 * erased address created again.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * API → queue → mta-sender, with the gRPC client of the engine the only stub
 * (as doi-erasure-only, Z170). An organisation of this file, its owner session
 * from /me/orgs/switch; contacts, the erasure, the suppression and the lists
 * through their routes; each confirmation asked for through POST
 * /lists/:id/subscribe, delivered by the real mta-sender and counted at the
 * engine; the campaign split and batched by the real splitter and batch-sender.
 *
 *   E_DOI       the erased address (contact had a number): confirmation sent;
 *   E_MANUAL    an ordinary 'manual' row by the address: confirmation stopped;
 *   E_CAMPAIGN  the erased address created again, on a list: no campaign mail;
 *               a control address on the same list gets it.
 *
 * Everything measured is printed once as `Z180_EMAIL_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { redis } from '@forgemsg/shared/redis';
import { SEED_LOGIN, authHeaders, seedApiKey } from './setup/login.js';
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
const engine = vi.hoisted(() => ({
  handed: [] as { to: string; subject: string }[],
}));
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
const sendingDomain = `z180e-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const SEED_KEY_NAME = `integration z180e-${tag}`;
const DOI_SUBJECT = /^Confirm your subscription to /;
const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];
// Valid CZ mobile numbers (Vodafone 777), so POST /contacts stores them E.164.
const PHONE_BASE = 420_777_800_000 + Math.floor(Math.random() * 190_000);

let seed: SeedOrg;
let seedKey = '';
let seedBefore: Record<string, unknown> = {};
let org = '';
let owner = '';
const allAddresses: string[] = [];
const listIds: string[] = [];
const cells: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag,
  mock: 'the gRPC client of the engine only; everything else is the real API, queue and mta-sender',
};
let phones = 0;
const newPhone = () => `+${PHONE_BASE + ++phones * 7}`;

const address = (name: string) => {
  const a = `z180e-${name}-${tag}@test.local`;
  allAddresses.push(a);
  return a;
};

const job = <T>(data: T): Job<T> =>
  ({
    id: `z180e-${randomUUID()}`,
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

async function queuedFor(to: string): Promise<Job<MtaSendJobData>[]> {
  return ((await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]).filter(
    (j) => j?.data?.toEmail?.toLowerCase() === to.toLowerCase(),
  );
}

/** Run every queued MTA job for `to` through the real processor, then drop it. */
async function deliver(to: string): Promise<string[]> {
  const statuses: string[] = [];
  for (const j of await queuedFor(to)) {
    const last = { data: j.data, opts: { attempts: 1 }, attemptsMade: 0, log: async () => {} };
    try {
      const r = (await processAtOrgRate(last as unknown as Job<MtaSendJobData>)) as {
        status: string;
      };
      statuses.push(r.status);
    } catch (err) {
      statuses.push(`threw: ${(err as Error).message}`);
    }
    await j.remove().catch(() => {});
  }
  return statuses;
}

async function call(method: string, path: string, credential: string | null, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(credential ? authHeaders(credential) : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, text: await res.text() };
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const r = await call(method, path, owner, body);
  if (r.status >= 300)
    throw new Error(`[z180e] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
  return r.text ? JSON.parse(r.text) : null;
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
  const b = (await api('POST', '/api/v1/lists', {
    name: `z180e ${name} ${tag}`,
    doubleOptIn: true,
  })) as { data: { id: string } };
  listIds.push(b.data.id);
  return b.data.id;
}

async function newContact(email: string, phone?: string): Promise<string> {
  const b = (await api('POST', '/api/v1/contacts', {
    email,
    ...(phone ? { phone } : {}),
    firstName: 'Petra',
  })) as { data: { id: string } };
  return b.data.id;
}

/** The person asks to be erased: a contact with an address and a number, anonymised. */
async function erase(email: string): Promise<number> {
  const id = await newContact(email, newPhone());
  return (await call('POST', `/api/v1/contacts/${id}/anonymize`, owner, {})).status;
}

/** The rows of this organisation an erasure writes, by kind (notes, so master reads it too). */
async function erasureRows(): Promise<{ email: number; phone: number }> {
  const [r] = await sql<{ email: number; phone: number }[]>`
    SELECT count(*) FILTER (WHERE notes LIKE 'gdpr_anonymized:%')::int AS email,
           count(*) FILTER (WHERE notes LIKE 'gdpr_anonymized_phone:%')::int AS phone
    FROM suppressions WHERE org_id = ${org}
  `;
  return r!;
}

/** One confirmation asked for through the subscribe route, delivered, counted at the engine. */
async function confirmation(listId: string, to: string) {
  const answer = (await call('POST', `/api/v1/lists/${listId}/subscribe`, null, { email: to }))
    .status;
  engine.handed.length = 0;
  const mta = await deliver(to);
  return {
    answer,
    mta,
    engine: engine.handed.filter(
      (m) => m.to.toLowerCase() === to.toLowerCase() && DOI_SUBJECT.test(m.subject),
    ).length,
  };
}

/** A campaign to `listId`, all the way to the engine: who it reached. */
async function campaignTo(listId: string, recipients: string[]) {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `z180e ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
  const beforeSplit = await idsOn(campaignSplitterQueue);
  await api('POST', `/api/v1/campaigns/${campaignId}/send`, {
    acknowledgeDeliverabilityRisk: true,
  });
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
  return engine.handed
    .filter((m) => m.subject === subject)
    .map((m) => m.to.toLowerCase())
    .sort();
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id) AS suppressions,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND email_hash IS NOT NULL) AS hash_rows,
           (SELECT count(*)::int FROM suppressions WHERE org_id = o.id AND notes LIKE 'gdpr_anonymized_phone:%') AS phone_rows,
           (SELECT count(*)::int FROM sms_consents WHERE org_id = o.id) AS sms_consents,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

describe('the e-mail side of an erasure with a number, as on master (Z180, K)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    seedBefore = await seedState();
    seedKey = await seedApiKey(sql, `z180e-${tag}`);
    const [o] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
      VALUES (${`z180e ${tag}`}, ${`z180e-${tag}`}, 'production', 'Obchod z180 s.r.o.',
              'Nádražní 1, 110 00 Praha')
      RETURNING id
    `;
    org = o!.id;
    await sql`
      INSERT INTO organization_members (org_id, user_id, email, role, status)
      SELECT ${org}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
    `;
    const r = await call('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: org });
    expect(r.status, r.text).toBe(200);
    owner = (JSON.parse(r.text) as { data: { token: string } }).data.token;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${org}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    // Confirmation tokens and limit keys of this file's lists.
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:*', 'COUNT', 1000);
      cursor = next;
      for (const key of keys) {
        if (listIds.some((id) => key.startsWith(`doi:limit:${id}:`))) {
          await redis.del(key);
          continue;
        }
        if (key.startsWith('doi:limit:')) continue;
        const raw = await redis.get(key).catch(() => null);
        if (raw?.includes(org)) await redis.del(key);
      }
    } while (cursor !== '0');
    await sql`DELETE FROM email_events WHERE org_id = ${org}`;
    await sql`DELETE FROM campaigns WHERE org_id = ${org}`;
    await sql`DELETE FROM consent_events WHERE org_id = ${org}`;
    await sql`DELETE FROM audit_logs WHERE org_id = ${org}`;
    await sql`DELETE FROM suppressions WHERE org_id = ${org}`;
    await sql`DELETE FROM api_keys WHERE org_id = ${org}`;
    // Everything else of the organisation goes with it (ON DELETE CASCADE).
    await sql`DELETE FROM organizations WHERE id = ${org}`;
    await sql`DELETE FROM api_keys WHERE name = ${SEED_KEY_NAME}`;
    const [left] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id = ${org}) AS orgs,
             (SELECT count(*)::int FROM contacts WHERE org_id = ${org}) AS contacts,
             (SELECT count(*)::int FROM suppressions WHERE org_id = ${org}) AS suppressions,
             (SELECT count(*)::int FROM email_events WHERE org_id = ${org}) AS email_events,
             (SELECT count(*)::int FROM lists WHERE org_id = ${org}) AS lists,
             (SELECT count(*)::int FROM campaigns WHERE org_id = ${org}) AS campaigns,
             (SELECT count(*)::int FROM organization_members WHERE org_id = ${org}) AS members
    `;
    let keysLeft = 0;
    cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'doi:limit:*', 'COUNT', 1000);
      cursor = next;
      keysLeft += keys.filter((k) => listIds.some((id) => k.startsWith(`doi:limit:${id}:`))).length;
    } while (cursor !== '0');
    const seedAfter = await seedState();
    report.cells = cells;
    report.leftover = { ...left, limitKeys: keysLeft };
    report.seedOrg = { before: seedBefore, after: seedAfter };
    console.log(`Z180_EMAIL_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    expect(left).toEqual({
      orgs: 0,
      contacts: 0,
      suppressions: 0,
      email_events: 0,
      lists: 0,
      campaigns: 0,
      members: 0,
    });
    expect(keysLeft).toBe(0);
    // The seed org exactly as this file found it — a snapshot, not zeros.
    expect(seedAfter).toEqual(seedBefore);
    expect([seedAfter.hash_rows, seedAfter.phone_rows]).toEqual([0, 0]);
  }, 180_000);

  it('E_DOI — the erased address (the contact had a number) gets the confirmation', async () => {
    const list = await newList('doi');
    const to = address('doi');
    const erased = await erase(to);
    const rows = await erasureRows();
    const cell = { erased, rows, confirmation: await confirmation(list, to) };
    cells.E_DOI = cell;
    console.log(`[z180e] E_DOI: ${JSON.stringify(cell)}`);
    expect(erased).toBe(200);
    expect(cell.confirmation.answer).toBeLessThan(300);
    expect(cell.confirmation.mta).toEqual(['sent']);
    expect(cell.confirmation.engine).toBe(1);
  }, 120_000);

  it("E_MANUAL — an ordinary 'manual' row by the address stops the confirmation", async () => {
    const list = await newList('manual');
    const to = address('manual');
    await api('POST', '/api/v1/suppressions', { email: to, reason: 'manual' });
    const cell = await confirmation(list, to);
    cells.E_MANUAL = cell;
    console.log(`[z180e] E_MANUAL: ${JSON.stringify(cell)}`);
    expect(cell.answer).toBeLessThan(300);
    expect(cell.mta).toEqual(['suppressed']);
    expect(cell.engine).toBe(0);
  }, 120_000);

  it('E_CAMPAIGN — the erased address created again gets no campaign; a control does', async () => {
    const list = await newList('campaign');
    const person = address('campaign');
    const erased = await erase(person);
    const again = await newContact(person);
    const control = address('campaign-control');
    const controlId = await newContact(control);
    for (const contactId of [again, controlId]) {
      await api('POST', `/api/v1/lists/${list}/contacts`, { contactId });
    }
    const reached = await campaignTo(list, [person, control]);
    const cell = { erased, reached: reached.map((a) => a.replace(tag, '<tag>')) };
    cells.E_CAMPAIGN = cell;
    console.log(`[z180e] E_CAMPAIGN: ${JSON.stringify(cell)}`);
    expect(erased).toBe(200);
    expect(reached).toEqual([control]);
  }, 300_000);
});
