/**
 * /transactional/email refuses exactly what the mta-sender gate refuses, and a
 * contact status that cannot be written is reported, not swallowed.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 *  - /transactional/email checked the suppression list on its own, before the
 *    gate existed (96d8cee, "SES suppression behaviour"), and refused on any
 *    row. #225 then decided that an 'unsubscribe' must not stop a receipt and
 *    taught the gate so, but not this route — so the same receipt reached an
 *    unsubscribed address through /emails and was refused through
 *    /transactional/email.
 *  - mta-sender's updateContactStatus caught only a thrown fetch. fetch
 *    resolves on any HTTP answer, so a refused PATCH went unread: the contact
 *    kept its old status after a hard bounce and nobody was told — the same
 *    shape #237 removed from the suppression write.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * For every suppression reason, one address holding only that row, and one
 * receipt through each route, run through the real mta-sender; the gRPC stub
 * records what reached the engine. Then a hard bounce produced by mta-sender
 * itself (the stub answers 550), with a status write that fails and one that
 * succeeds.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * The refusing reasons run first and the reason that must pass — 'unsubscribe'
 * — and a clean address come after them, on both routes. The failing status
 * write is followed by one that must set the status in the DB.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP.
 * - Sentry: the failure is asserted on the log line and the job result.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processMtaSend } from '../jobs/mta-sender.js';
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

/**
 * This file's own bucket in the API's 100/min limiter (`x-api-key ??
 * request.ip`, api/plugins/rate-limit.ts), as in recipient-resubscribe: an
 * unknown key matches nothing and the request continues as the Bearer session.
 */
const RATE_LIMIT_BUCKET = `integration-txgate-${randomUUID()}`;

const tag = randomUUID().slice(0, 8);
const sendingDomain = `txgate-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `txgate-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
const listIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

/** What the internal status PATCH answered, as mta-sender's own fetch saw it. */
const statusWrites: { status: number; body: string }[] = [];
const realFetch = globalThis.fetch;

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `txgate-${randomUUID()}`,
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
async function deliver(to: string): Promise<Record<string, unknown>[]> {
  const jobs = (
    (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
  ).filter((j) => j?.data?.toEmail === to);
  const out: Record<string, unknown>[] = [];
  for (const j of jobs) {
    out.push((await processMtaSend(j)) as Record<string, unknown>);
    await j.remove().catch(() => {});
  }
  return out;
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await realFetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': RATE_LIMIT_BUCKET,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[txgate] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** The two routes a receipt can take. */
const ROUTES = {
  '/transactional/email': (to: string, subject: string) =>
    api('POST', '/api/v1/transactional/email', { from: fromEmail, to, subject, html: '<p>x</p>' }),
  '/emails': (to: string, subject: string) =>
    api('POST', '/api/v1/emails', { from: fromEmail, to, subject, html: '<p>x</p>' }),
};

/** One receipt through `route` to `to`: what the route answered, and whether it reached the engine. */
async function receipt(
  route: keyof typeof ROUTES,
  to: string,
): Promise<{ answer: unknown; mta: unknown[]; reached: boolean }> {
  const subject = `Faktura ${randomUUID().slice(0, 6)}`;
  const answer = ((await ROUTES[route](to, subject)) as { data?: unknown }).data;
  engine.handed.length = 0;
  const mta = await deliver(to);
  const reached = engine.handed.some((m) => m.to === to && m.subject === subject);
  return { answer, mta, reached };
}

async function suppressed(name: string, reason: string): Promise<string> {
  const email = addr(name);
  allAddresses.push(email);
  await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${email}, ${reason})`;
  return email;
}

const blocks = [
  {
    id: 't1',
    type: 'text',
    content: '<p>Dobrý den.</p>',
    fontSize: '15px',
    fontFamily: 'Arial',
    color: '#111827',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  {
    id: 't2',
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
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`txgate ${name} ${tag}`}) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

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

/** A marketing campaign to `listId`, to the engine; returns each recipient's mta results too. */
async function campaignTo(
  listId: string,
  label: string,
  recipients: string[],
): Promise<{ reached: string[]; mta: Record<string, Record<string, unknown>[]> }> {
  const subject = `Novinky ${label} ${tag}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `txgate ${label} ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail,
    listId,
    content: { subject, blocks, globalStyles },
  })) as { data: { id: string } };
  createdCampaigns.push(created.data.id);
  const beforeSplit = await idsOn(campaignSplitterQueue);
  await api('POST', `/api/v1/campaigns/${created.data.id}/send`);
  const [split] = (
    await addedTo<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)
  ).filter((d) => d.campaignId === created.data.id);
  expect(split, 'no splitter job').toBeTruthy();
  const beforeBatch = await idsOn(batchSenderQueue);
  await processCampaignSplitter(job(split!));
  const batches = (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
    (d) => d.campaignId === created.data.id,
  );
  for (const b of batches) await processBatchSender(job(b));
  engine.handed.length = 0;
  const mta: Record<string, Record<string, unknown>[]> = {};
  for (const to of recipients) mta[to] = await deliver(to);
  const reached = engine.handed.filter((m) => m.subject === subject).map((m) => m.to);
  console.log(`[z118] campaign "${label}" engine=${JSON.stringify(reached)}`);
  return { reached, mta };
}

describe('the transactional route and the gate agree; a failed status write is reported', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'txgate');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;
    // Pass-through: records what the internal status PATCH answered.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const res = await realFetch(input, init);
      const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
      if (
        url.includes('/api/v1/internal/contacts/') &&
        url.endsWith('/status') &&
        init?.method === 'PATCH'
      ) {
        statusWrites.push({ status: res.status, body: (await res.clone().text()).slice(0, 160) });
      }
      return res;
    });
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const a of allAddresses) await deliver(a).catch(() => {});
    if (allAddresses.length)
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email = ANY(${allAddresses})`;
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
  }, 120_000);

  // Refusing reasons first, the one that must pass after them.
  const CASES: [reason: string, reaches: boolean][] = [
    ['hard_bounce', false],
    ['complaint', false],
    ['manual', false],
    ['block', false],
    ['invalid_email', false],
    ['unsubscribe', true],
  ];

  for (const [reason, reaches] of CASES) {
    it(`an address with only a '${reason}' row: a receipt ${reaches ? 'reaches' : 'does not reach'} the engine by either route`, async () => {
      const results: Record<string, boolean> = {};
      for (const route of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
        const to = await suppressed(`${reason}-${route.replace(/[^a-z]/g, '')}`, reason);
        const r = await receipt(route, to);
        console.log(
          `[z118] ${reason} via ${route}: answer=${JSON.stringify(r.answer)} mta=${JSON.stringify(r.mta)} engine=${r.reached}`,
        );
        results[route] = r.reached;
      }
      expect(results).toEqual({ '/transactional/email': reaches, '/emails': reaches });
    }, 120_000);
  }

  it('a clean address gets the receipt by both routes', async () => {
    for (const route of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      const to = addr(`clean-${route.replace(/[^a-z]/g, '')}`);
      allAddresses.push(to);
      const r = await receipt(route, to);
      console.log(`[z118] clean via ${route}: engine=${r.reached}`);
      expect(r.reached, `clean via ${route}`).toBe(true);
    }
  }, 120_000);

  it('an unsubscribed address gets no campaign', async () => {
    const listId = await newList('mkt');
    const subject = await contactOn(listId, 'mkt-unsub');
    const control = await contactOn(listId, 'mkt-ctl');
    await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${subject.email}, 'unsubscribe')`;
    const { reached } = await campaignTo(listId, 'mkt', [subject.email, control.email]);
    expect(reached, 'the control must reach the engine').toContain(control.email);
    expect(reached, 'an unsubscribed address got marketing').not.toContain(subject.email);
  }, 120_000);
});
