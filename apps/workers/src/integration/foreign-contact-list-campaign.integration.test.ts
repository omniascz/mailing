/**
 * A campaign of org A to its list sends to no contact of org B, whatever the
 * list's rows say — walked to the engine (Z182).
 *
 * ─── Why this file exists ────────────────────────────────────────────────────
 *
 * POST /api/v1/lists/:id/contacts used to put a contact id of another
 * organisation on org A's list (Z173 MIMO 10); since Z182 it answers 404
 * `Contact`. Rows written that way before stay in the table (nothing deletes
 * them). This file measures whether such a row makes org A's campaign reach
 * org B's person: the list audience (listAudienceWhere, the pre-send count and
 * the splitter) reads `c.org_id = <campaign org>`, so it must not.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * API → queue → splitter → batch-sender → mta-sender, with the gRPC client of
 * the engine the only stub. Org A is an organisation of this file (owner session
 * from /me/orgs/switch); org B and its contact are rows of this file. The row of
 * org B's contact on org A's list is first asked of the route (master: 204, the
 * branch: 404) and then written straight to the table, so the campaign meets it
 * on both.
 *
 *   E   a list of {org A's own active contact, org B's contact}: the route's
 *       answer, pre-send count, contacts split, who the engine was handed;
 *   K   the same list without the foreign row: org A's own contact, as before;
 *   F   rows of contact_lists whose contact is of another org than the list,
 *       in this database before this file wrote any.
 *
 * Everything measured is printed once as `Z182_WORKERS_CELLS_JSON {…}`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { type Job, type JobType, type Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
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
const sendingDomain = `z182-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

let seed: SeedOrg;
let seedKey = '';
let seedBefore: Record<string, unknown> = {};
let orgA = '';
let orgB = '';
let owner = '';
const contactB = { id: '', email: `z182-b-${tag}@test.local` };
const allAddresses: string[] = [contactB.email];
const cells: Record<string, unknown> = {};
const report: Record<string, unknown> = {
  tag,
  mock: 'the gRPC client of the engine only; everything else is the real API, queue, splitter, batch-sender and mta-sender',
};

const address = (name: string) => {
  const a = `z182-${name}-${tag}@test.local`;
  allAddresses.push(a);
  return a;
};

const job = <T>(data: T): Job<T> =>
  ({
    id: `z182-${randomUUID()}`,
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
  const out: string[] = [];
  for (const j of await queuedFor(to)) {
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

async function call(
  method: string,
  path: string,
  credential: string | null,
  body?: unknown,
): Promise<{ status: number; text: string }> {
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
    throw new Error(`[z182] ${method} ${path} → ${r.status}: ${r.text.slice(0, 300)}`);
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
  const b = (await api('POST', '/api/v1/lists', { name: `z182 ${name} ${tag}` })) as {
    data: { id: string };
  };
  return b.data.id;
}

/** An active contact of org A (POST /contacts), on `listId`. */
async function contactOn(listId: string, name: string) {
  const email = address(name);
  const b = (await api('POST', '/api/v1/contacts', { email, firstName: 'Petra' })) as {
    data: { id: string };
  };
  await api('POST', `/api/v1/lists/${listId}/contacts`, { contactId: b.data.id });
  return { id: b.data.id, email };
}

/** Rows of contact_lists whose contact belongs to another org than the list. */
async function crossOrgRows(): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM contact_lists cl
    JOIN lists l ON l.id = cl.list_id
    JOIN contacts c ON c.id = cl.contact_id
    WHERE c.org_id <> l.org_id
  `;
  return r!.n;
}

async function preSendCount(campaignId: string): Promise<string> {
  const r = await call('GET', `/api/v1/campaigns/${campaignId}/pre-send-checks`, owner);
  if (/No recipients in selected audience/.test(r.text)) return '0';
  const m = /"title":"([\d,]+) recipients"/.exec(r.text);
  return m ? m[1]!.replace(/,/g, '') : `? ${r.status} ${r.text.slice(0, 120)}`;
}

interface Sent {
  campaignId: string;
  count: string;
  split: number;
  splitIds: string[];
  reached: string[];
}

/** A campaign to `listId`, all the way to the engine. */
async function campaignTo(listId: string, recipients: string[]): Promise<Sent> {
  const subject = `Novinky ${randomUUID().slice(0, 6)}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `z182 ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  const campaignId = created.data.id;
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
  const reached = engine.handed
    .filter((m) => m.subject === subject)
    .map((m) => m.to.toLowerCase())
    .sort();
  const splitIds = batches.flatMap((b) => b.contactIds ?? []);
  return { campaignId, count, split: splitIds.length, splitIds, reached };
}

/** The seed org as a whole: this file must leave it exactly as it found it. */
async function seedState(): Promise<Record<string, unknown>> {
  const [r] = await sql<Record<string, unknown>[]>`
    SELECT (SELECT count(*)::int FROM email_events WHERE org_id = o.id) AS email_events,
           (SELECT count(*)::int FROM contacts WHERE org_id = o.id) AS contacts,
           (SELECT count(*)::int FROM lists WHERE org_id = o.id) AS lists,
           (SELECT count(*)::int FROM contact_lists cl JOIN lists l ON l.id = cl.list_id WHERE l.org_id = o.id) AS memberships,
           (SELECT count(*)::int FROM campaigns WHERE org_id = o.id) AS campaigns,
           (SELECT count(*)::int FROM organization_members WHERE org_id = o.id) AS members,
           (SELECT count(*)::int FROM api_keys WHERE org_id = o.id) AS api_keys,
           (SELECT count(*)::int FROM users WHERE org_id = o.id) AS users
    FROM organizations o WHERE o.id = ${seed.id}
  `;
  return r!;
}

describe('a list campaign of org A reaches no contact of org B (Z182)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    seedBefore = await seedState();
    report.crossOrgRowsBefore = await crossOrgRows();
    seedKey = await seedApiKey(sql, `z182-${tag}`);
    const [a] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
      VALUES (${`z182 a ${tag}`}, ${`z182-a-${tag}`}, 'production', 'Obchod A s.r.o.',
              'Nádražní 1, 110 00 Praha')
      RETURNING id
    `;
    orgA = a!.id;
    const [b] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug, sending_mode, company_name, postal_address)
      VALUES (${`z182 b ${tag}`}, ${`z182-b-${tag}`}, 'production', 'Obchod B s.r.o.',
              'Nádražní 2, 110 00 Praha')
      RETURNING id
    `;
    orgB = b!.id;
    const [cb] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, first_name, status)
      VALUES (${orgB}, ${contactB.email}, 'Bára', 'active')
      RETURNING id
    `;
    contactB.id = cb!.id;
    await sql`
      INSERT INTO organization_members (org_id, user_id, email, role, status)
      SELECT ${orgA}, id, email, 'owner', 'active' FROM users WHERE email = ${SEED_LOGIN.email}
    `;
    const r = await call('POST', '/api/v1/me/orgs/switch', seedKey, { orgId: orgA });
    expect(r.status, r.text).toBe(200);
    owner = (JSON.parse(r.text) as { data: { token: string } }).data.token;
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
      VALUES (${orgA}, ${sendingDomain}, 'fm1', true, true, true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    for (const a of allAddresses) await deliver(a).catch(() => {});
    for (const org of [orgA, orgB].filter(Boolean)) {
      await sql`DELETE FROM email_events WHERE org_id = ${org}`;
      await sql`DELETE FROM campaigns WHERE org_id = ${org}`;
      await sql`DELETE FROM consent_events WHERE org_id = ${org}`;
      await sql`DELETE FROM audit_logs WHERE org_id = ${org}`;
      await sql`DELETE FROM api_keys WHERE org_id = ${org}`;
      // Everything else of the organisation goes with it (ON DELETE CASCADE).
      await sql`DELETE FROM organizations WHERE id = ${org}`;
    }
    await sql`DELETE FROM api_keys WHERE name = ${`integration z182-${tag}`}`;
    const [left] = await sql<Record<string, number>[]>`
      SELECT (SELECT count(*)::int FROM organizations WHERE id IN (${orgA}, ${orgB})) AS orgs,
             (SELECT count(*)::int FROM contacts WHERE org_id IN (${orgA}, ${orgB})) AS contacts,
             (SELECT count(*)::int FROM email_events WHERE org_id IN (${orgA}, ${orgB})) AS email_events,
             (SELECT count(*)::int FROM lists WHERE org_id IN (${orgA}, ${orgB})) AS lists,
             (SELECT count(*)::int FROM campaigns WHERE org_id IN (${orgA}, ${orgB})) AS campaigns,
             (SELECT count(*)::int FROM organization_members WHERE org_id IN (${orgA}, ${orgB})) AS members
    `;
    let mtaLeft = 0;
    for (const a of allAddresses) mtaLeft += (await queuedFor(a)).length;
    const seedAfter = await seedState();
    report.crossOrgRowsAfter = await crossOrgRows();
    report.cells = cells;
    report.leftover = { ...left, mtaJobs: mtaLeft };
    report.seedOrg = { before: seedBefore, after: seedAfter };
    console.log(`Z182_WORKERS_CELLS_JSON ${JSON.stringify(report)}`);
    await sql.end();
    expect(left).toEqual({
      orgs: 0,
      contacts: 0,
      email_events: 0,
      lists: 0,
      campaigns: 0,
      members: 0,
    });
    expect(mtaLeft).toBe(0);
    expect(report.crossOrgRowsAfter).toBe(report.crossOrgRowsBefore);
    // The seed org exactly as this file found it — a snapshot, not zeros.
    expect(seedAfter).toEqual(seedBefore);
  }, 180_000);

  it('E — a row of org B’s contact on org A’s list: the campaign counts, splits and sends only org A’s own', async () => {
    const listId = await newList('E');
    const own = await contactOn(listId, 'e-own');
    const route = await call('POST', `/api/v1/lists/${listId}/contacts`, owner, {
      contactId: contactB.id,
    });
    const inserted = await sql`
      INSERT INTO contact_lists (contact_id, list_id, confirmed_at)
      VALUES (${contactB.id}, ${listId}, now())
      ON CONFLICT DO NOTHING
      RETURNING contact_id
    `;
    const sent = await campaignTo(listId, [own.email, contactB.email]);
    const cell = {
      route: { status: route.status, body: route.text.slice(0, 160) },
      rowBy: inserted.length === 1 ? 'sql' : 'route',
      count: sent.count,
      split: sent.split,
      splitB: sent.splitIds.includes(contactB.id),
      reached: sent.reached.map((t) => (t === own.email ? 'own' : t === contactB.email ? 'B' : t)),
    };
    cells.E = cell;
    console.log(`[z182] E: ${JSON.stringify(cell)}`);
    expect(cell.reached).toEqual(['own']);
    expect(cell.splitB).toBe(false);
    expect(cell.count).toBe('1');
  }, 600_000);

  it('K — the same list without a foreign row: org A’s own contact, as before', async () => {
    const listId = await newList('K');
    const own = await contactOn(listId, 'k-own');
    const sent = await campaignTo(listId, [own.email]);
    const cell = {
      count: sent.count,
      split: sent.split,
      reached: sent.reached.map((t) => (t === own.email ? 'own' : t)),
    };
    cells.K = cell;
    console.log(`[z182] K: ${JSON.stringify(cell)}`);
    expect(cell).toEqual({ count: '1', split: 1, reached: ['own'] });
  }, 600_000);
});
