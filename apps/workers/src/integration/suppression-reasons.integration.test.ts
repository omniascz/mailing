/**
 * One address can carry more than one reason not to be mailed, and losing the
 * write of one is never silent.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * suppressions had a unique index on (org_id, email), so an address held one
 * reason. A recipient who unsubscribed and then hard-bounced kept only the
 * 'unsubscribe' row: POST /internal/suppressions inserted the 'hard_bounce' row
 * without onConflict, the insert hit the index, and the route answered 500.
 * mta-sender's addToSuppressionList never read the status — fetch resolves on a
 * 500 — so nothing logged it. And the #225 gate lets 'unsubscribe' through for
 * transactional mail, so the address that refuses mail kept getting receipts.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * The recipient's own unsubscribe on the preference centre, then a real
 * transactional send (/emails) through mta-sender, whose gRPC stub answers 550
 * for that address — so the bounce and its suppression write are mta-sender's
 * own. Then the next transactional send and a marketing campaign, asserted on
 * what the engine was handed, and the rows asserted in the DB.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * Each refusing case is followed by a clean address on the same paths that
 * must reach the engine, transactional and marketing both.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP; inbound DSNs and FBL, which write their rows with
 *   onConflictDoNothing and are covered by bounced-status.
 * - Sentry: the failed-write case asserts the log line and the job result.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createTrackingToken } from '@forgemsg/shared';
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
 * unknown key matches nothing and the request continues as the Bearer session,
 * or as nobody on a public route.
 */
const RATE_LIMIT_BUCKET = `integration-supp-${randomUUID()}`;

const tag = randomUUID().slice(0, 8);
const sendingDomain = `supp-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `supp-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
const listIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

/** What POST /internal/suppressions answered, as mta-sender's own fetch saw it. */
const suppressionWrites: { status: number; body: string }[] = [];
const realFetch = globalThis.fetch;

const job = <T>(data: T): Job<T> =>
  ({
    id: `supp-${randomUUID()}`,
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

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  return realFetch(`${API}${path}`, {
    method,
    headers: {
      'x-api-key': RATE_LIMIT_BUCKET,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await call(method, path, body);
  const text = await res.text();
  if (!res.ok) throw new Error(`[supp] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const blocks = [
  {
    id: 's1',
    type: 'text',
    content: '<p>Dobrý den.</p>',
    fontSize: '15px',
    fontFamily: 'Arial',
    color: '#111827',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  {
    id: 's2',
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
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`supp ${name} ${tag}`}) RETURNING id
  `;
  listIds.push(list!.id);
  return list!.id;
}

async function contactOn(
  listId: string,
  name: string,
  status = 'active',
): Promise<{ id: string; email: string }> {
  const email = addr(name);
  allAddresses.push(email);
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO contacts (org_id, email, first_name, status)
    VALUES (${seed.id}, ${email}, 'Petra', ${status}) RETURNING id
  `;
  contactIds.push(c!.id);
  await sql`INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${c!.id}, ${listId}, now())`;
  return { id: c!.id, email };
}

const prefToken = (contactId: string) =>
  createTrackingToken({
    type: 'pref',
    orgId: seed.id,
    contactId,
    ts: Math.floor(Date.now() / 1000),
  });

async function pref(contactId: string, body: Record<string, unknown>): Promise<number> {
  return (await call('POST', `/p/center/${prefToken(contactId)}`, body)).status;
}

/** status · suppression reasons, sorted. */
async function state(contactId: string): Promise<string> {
  const [c] = await sql<{ status: string; email: string }[]>`
    SELECT status, email FROM contacts WHERE id = ${contactId}
  `;
  const supp = await sql<{ reason: string }[]>`
    SELECT reason FROM suppressions WHERE org_id = ${seed.id} AND email = ${c!.email} ORDER BY reason
  `;
  return `status=${c!.status} suppressions=${JSON.stringify(supp.map((s) => s.reason))}`;
}

/** The suppression reasons stored for `email`, sorted. */
async function reasons(email: string): Promise<string> {
  const supp = await sql<{ reason: string }[]>`
    SELECT reason FROM suppressions WHERE org_id = ${seed.id} AND email = ${email} ORDER BY reason
  `;
  return JSON.stringify(supp.map((s) => s.reason));
}

/** One transactional message through /emails, to the engine. */
async function transactional(
  to: string,
): Promise<{ reached: boolean; mta: Record<string, unknown>[] }> {
  const subject = `Faktura ${randomUUID().slice(0, 6)}`;
  await api('POST', '/api/v1/emails', { from: fromEmail, to, subject, html: '<p>x</p>' });
  engine.handed.length = 0;
  const mta = await deliver(to);
  const reached = engine.handed.some((m) => m.to === to && m.subject === subject);
  console.log(
    `[z117] transactional ${to.split('@')[0]} mta=${JSON.stringify(mta)} engine=${reached}`,
  );
  return { reached, mta };
}

/** A marketing campaign to `listId`, to the engine. */
async function campaignTo(listId: string, label: string, recipients: string[]): Promise<string[]> {
  const subject = `Novinky ${label} ${tag}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `supp ${label} ${tag}`,
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
  const reached = engine.handed.filter((m) => m.subject === subject).map((m) => m.to);
  console.log(`[z117] campaign "${label}" engine=${JSON.stringify(reached)}`);
  return reached;
}

describe('an address carries every reason it is suppressed for (real DB + Redis + API)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'supp');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;
    // Pass-through: records what the internal suppression write answered.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const res = await realFetch(input, init);
      const url = typeof input === 'string' ? input : ((input as Request).url ?? String(input));
      if (url.endsWith('/api/v1/internal/suppressions') && init?.method === 'POST') {
        suppressionWrites.push({
          status: res.status,
          body: (await res.clone().text()).slice(0, 200),
        });
      }
      return res;
    });
    errorSpy = vi.spyOn(console, 'error');
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

  it('unsubscribed, then hard-bounced: both reasons are kept and the next receipt is not sent; a clean address gets both kinds of mail', async () => {
    const listId = await newList('both');
    const subject = await contactOn(listId, 'both');
    const clean = await contactOn(listId, 'clean');

    // /emails carries no contact id of its own, so mta-sender's status call
    // does not reach this contact; the rows are what this case is about.
    expect(await pref(subject.id, { globalUnsubscribe: true })).toBe(200);
    const afterUnsub = await reasons(subject.email);

    engine.answer.set(subject.email, { code: 550, message: '5.1.1 user unknown' });
    suppressionWrites.length = 0;
    const bounce = await transactional(subject.email);
    engine.answer.delete(subject.email);
    const writes = [...suppressionWrites];
    const afterBounce = await reasons(subject.email);
    const next = await transactional(subject.email);
    console.log(
      `[z117] unsubscribe → ${afterUnsub} | 550 → mta=${JSON.stringify(bounce.mta)} internal POST=${JSON.stringify(writes)} → ${afterBounce} | next receipt engine=${next.reached}`,
    );

    expect(afterUnsub).toBe('["unsubscribe"]');
    expect(
      writes.map((w) => w.status),
      'the hard_bounce write failed',
    ).toEqual([200]);
    expect(afterBounce).toBe('["hard_bounce","unsubscribe"]');
    expect(next.reached, 'a hard-bounced address got a transactional email').toBe(false);

    // Must pass, same paths: a clean address gets the receipt and the campaign.
    expect((await transactional(clean.email)).reached, 'clean: transactional').toBe(true);
    const reached = await campaignTo(listId, 'both', [subject.email, clean.email]);
    expect(reached, 'clean: marketing').toContain(clean.email);
    expect(reached).not.toContain(subject.email);
  }, 180_000);

  it('the preference centre lifts only the unsubscribe and leaves the bounce', async () => {
    // A contact still flagged 'unsubscribed' over both rows — the state the
    // status gate lets into resubscribeContact, so the row reasons decide.
    const listId = await newList('resub');
    const subject = await contactOn(listId, 'resub', 'unsubscribed');
    const control = await contactOn(listId, 'resub-ctl');
    await sql`
      INSERT INTO suppressions (org_id, email, reason)
      VALUES (${seed.id}, ${subject.email}, 'unsubscribe'), (${seed.id}, ${subject.email}, 'hard_bounce')
    `;
    const code = await pref(subject.id, { globalResubscribe: true, resubscribeToLists: [listId] });
    const after = await state(subject.id);
    console.log(`[z117] resubscribe over both rows → ${code} → ${after}`);

    expect(after).toBe('status=unsubscribed suppressions=["hard_bounce"]');
    const reached = await campaignTo(listId, 'resub', [subject.email, control.email]);
    expect(reached).toContain(control.email);
    expect(reached, 'a hard-bounced address reached the engine').not.toContain(subject.email);
  }, 180_000);

  it('a suppression write that fails is reported, not swallowed; one that succeeds is recorded', async () => {
    // An org that does not exist: the insert fails on the foreign key, which
    // is a failure no onConflict can absorb.
    const to = addr('write-fails');
    allAddresses.push(to);
    engine.answer.set(to, { code: 550, message: '5.1.1 user unknown' });
    suppressionWrites.length = 0;
    errorSpy.mockClear();
    const data = {
      messageId: randomUUID(),
      orgId: randomUUID(),
      campaignId: randomUUID(),
      contactId: randomUUID(),
      fromEmail,
      fromName: 'Obchod',
      toEmail: to,
      subject: 'Faktura',
      htmlBody: '<p>x</p>',
      stream: 'transactional',
    } as unknown as MtaSendJobData;
    const failed = (await processMtaSend({
      ...job(data),
      opts: { attempts: 1 },
      attemptsMade: 0,
    } as unknown as Job<MtaSendJobData>)) as Record<string, unknown>;
    engine.answer.delete(to);
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes(to));
    console.log(
      `[z117] write fails: result=${JSON.stringify(failed)} internal POST=${JSON.stringify(suppressionWrites)} logged=${JSON.stringify(logged)}`,
    );

    expect(suppressionWrites, 'mta-sender did not try to write').toHaveLength(1);
    const code = suppressionWrites[0]!.status;
    expect(code, 'the write was expected to fail').toBeGreaterThanOrEqual(400);
    expect(failed.status).toBe('hard_bounce');
    expect(failed.suppression, 'the job result does not say the write failed').toBe('failed');
    expect(
      logged.some((l) => l.includes(`HTTP ${code}`)),
      'the failure was not logged',
    ).toBe(true);

    // Must pass: the same bounce for the real org is written and says so.
    const listId = await newList('write-ok');
    const ok = await contactOn(listId, 'write-ok');
    engine.answer.set(ok.email, { code: 550, message: '5.1.1 user unknown' });
    const sent = await transactional(ok.email);
    engine.answer.delete(ok.email);
    expect(sent.mta[0]?.suppression).toBe('written');
    expect(await reasons(ok.email)).toBe('["hard_bounce"]');
  }, 120_000);
});
