/**
 * An address that refused mail or complained gets no campaign, and that fact
 * survives the recipient unsubscribing.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * contacts.status is one field carrying two facts: consent (active,
 * unsubscribed, …) and deliverability (bounced, complained).
 *
 *  - batch-sender refused on 'unsubscribed' and left 'bounced' and
 *    'complained' to the suppression list, on the assumption that every path
 *    setting them also writes a row. POST/PUT /contacts set either status with
 *    no row, and those contacts were mailed.
 *  - A global unsubscribe overwrote 'bounced' and 'complained' with
 *    'unsubscribed'. Where no deliverability row carried the fact, it was gone,
 *    and the preference centre's resubscribe (#235) then reopened the address.
 *  - A complaint arriving for an address that already had a suppression row —
 *    an earlier unsubscribe — wrote nothing: status and row both kept saying
 *    "unsubscribed", so the same resubscribe reopened a complainer.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Real routes on the real API (contacts, preference centre, FBL), a real
 * campaign through the splitter, batch-sender and mta-sender. The only stub is
 * the gRPC client, which answers per address — 250, a hard 550 or a soft 451 —
 * so bounces are produced by mta-sender itself. Delivery assertions are on what
 * the engine was handed; the "kept after unsubscribe" ones on the rows.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * Every campaign also goes to a clean control contact that must reach the
 * engine, and the soft-bounce case — which must keep receiving — comes last.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP; inbound DSNs (services/inbound-email), which write
 *   their own row and status.
 * - Transactional mail beyond one /emails send per state.
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
 * The value config/env.ts falls back to outside production — the same API
 * process CI starts for this suite. A wrong value is a 401 below, not a pass.
 */
const FBL_SECRET = 'dev-fbl-webhook-secret-change-me-32ch';

/**
 * This file's own bucket in the API's 100/min limiter (`x-api-key ??
 * request.ip`, api/plugins/rate-limit.ts), as in recipient-resubscribe: an
 * unknown key matches nothing and the request continues as the Bearer session,
 * or as nobody on a public route.
 */
const RATE_LIMIT_BUCKET = `integration-bounced-${randomUUID()}`;

const tag = randomUUID().slice(0, 8);
const sendingDomain = `bnc-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `bnc-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
const listIds: string[] = [];
const createdCampaigns: string[] = [];
const contactIds: string[] = [];
const allAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `bnc-${randomUUID()}`,
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
      const r = (await processMtaSend(last as unknown as Job<MtaSendJobData>)) as {
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
      'x-api-key': RATE_LIMIT_BUCKET,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  if (!res.ok) throw new Error(`[bnc] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
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
    INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`bnc ${name} ${tag}`}) RETURNING id
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

/** The contacts API, as an admin or an integration sets a status. */
async function setStatus(contactId: string, status: string): Promise<void> {
  await api('PUT', `/api/v1/contacts/${contactId}`, { status });
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

/** An ISP's ARF complaint for `email`, through the forwarder's route. */
async function complaint(email: string): Promise<number> {
  const arf = [
    'From: abuse@isp.invalid',
    'To: fbl@example.invalid',
    'Subject: FBL report',
    '',
    '--b',
    'Content-Type: message/feedback-report',
    '',
    'Feedback-Type: abuse',
    `Original-Rcpt-To: ${email}`,
    'Reporting-MTA: dns; mx.isp.invalid',
    '',
    '--b--',
  ].join('\n');
  const res = await call('POST', '/api/v1/isp/feedback', arf, {
    'x-fbl-secret': FBL_SECRET,
    'x-org-id': seed.id,
  });
  return res.status;
}

/** status · suppression reasons — what the raw output shows. */
async function state(contactId: string): Promise<string> {
  const [c] = await sql<{ status: string; email: string }[]>`
    SELECT status, email FROM contacts WHERE id = ${contactId}
  `;
  const supp = await sql<{ reason: string }[]>`
    SELECT reason FROM suppressions WHERE org_id = ${seed.id} AND email = ${c!.email} ORDER BY reason
  `;
  return `status=${c!.status} suppressions=${JSON.stringify(supp.map((s) => s.reason))}`;
}

/**
 * A marketing campaign to `listId`, all the way to the engine. Returns the
 * addresses the engine was handed THIS campaign for.
 */
async function campaignTo(listId: string, label: string, recipients: string[]): Promise<string[]> {
  const subject = `Novinky ${label} ${tag}`;
  const created = (await api('POST', '/api/v1/campaigns', {
    name: `bnc ${label} ${tag}`,
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
  console.log(
    `[z116] campaign "${label}" mta=${log.join(' | ')} engine=${JSON.stringify(reached)}`,
  );
  return reached;
}

/** One transactional message through /emails, to the engine. */
async function transactional(to: string): Promise<string> {
  const subject = `Faktura ${randomUUID().slice(0, 6)}`;
  await api('POST', '/api/v1/emails', { from: fromEmail, to, subject, html: '<p>x</p>' });
  engine.handed.length = 0;
  const r = await deliver(to);
  const reached = engine.handed.some((m) => m.to === to && m.subject === subject);
  console.log(
    `[z116] transactional ${to.split('@')[0]} mta=${JSON.stringify(r)} engine=${reached}`,
  );
  return reached ? 'reached' : 'not reached';
}

describe('bounced and complained hold on the send path and through an unsubscribe', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'bnc');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;
  }, 120_000);

  afterAll(async () => {
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

  it('a bounced and a complained contact with no suppression row get no campaign; a clean one does', async () => {
    const listId = await newList('status-only');
    const bounced = await contactOn(listId, 'status-bounced');
    const complained = await contactOn(listId, 'status-complained');
    const clean = await contactOn(listId, 'status-clean');
    await setStatus(bounced.id, 'bounced');
    await setStatus(complained.id, 'complained');
    console.log(`[z116] PUT status bounced → ${await state(bounced.id)}`);
    console.log(`[z116] PUT status complained → ${await state(complained.id)}`);

    const reached = await campaignTo(listId, 'status-only', [
      bounced.email,
      complained.email,
      clean.email,
    ]);
    expect(reached, 'a bounced address reached the engine').not.toContain(bounced.email);
    expect(reached, 'a complained address reached the engine').not.toContain(complained.email);
    expect(reached, 'the clean control must reach the engine').toContain(clean.email);
  }, 120_000);

  it('a hard bounce from the engine, then an unsubscribe: the bounce is still recorded, a resubscribe does not reopen it', async () => {
    const listId = await newList('hard');
    const subject = await contactOn(listId, 'hard');
    const control = await contactOn(listId, 'hard-ctl');
    engine.answer.set(subject.email, { code: 550, message: '5.1.1 user unknown' });
    await campaignTo(listId, 'hard-first', [subject.email, control.email]);
    engine.answer.delete(subject.email);
    const afterBounce = await state(subject.id);

    const unsub = await pref(subject.id, { globalUnsubscribe: true });
    const afterUnsub = await state(subject.id);
    const resub = await pref(subject.id, { globalResubscribe: true, resubscribeToLists: [listId] });
    const afterResub = await state(subject.id);
    console.log(
      `[z116] hard: bounce → ${afterBounce} | unsubscribe ${unsub} → ${afterUnsub} | resubscribe ${resub} → ${afterResub}`,
    );

    expect(afterBounce).toBe('status=bounced suppressions=["hard_bounce"]');
    expect(afterUnsub, 'the unsubscribe erased the bounce').toBe(
      'status=bounced suppressions=["hard_bounce"]',
    );
    const reached = await campaignTo(listId, 'hard-after', [subject.email, control.email]);
    expect(reached).toContain(control.email);
    expect(reached, 'the hard-bounced address reached the engine').not.toContain(subject.email);
    expect(afterResub).toBe('status=bounced suppressions=["hard_bounce"]');
  }, 180_000);

  it('a bounced status with no row, then an unsubscribe: the bounce survives, a resubscribe does not reopen it', async () => {
    const listId = await newList('status-unsub');
    const subject = await contactOn(listId, 'status-unsub');
    const control = await contactOn(listId, 'status-unsub-ctl');
    await setStatus(subject.id, 'bounced');
    const unsub = await pref(subject.id, { globalUnsubscribe: true });
    const afterUnsub = await state(subject.id);
    const resub = await pref(subject.id, { globalResubscribe: true, resubscribeToLists: [listId] });
    const afterResub = await state(subject.id);
    console.log(
      `[z116] status-only bounced: unsubscribe ${unsub} → ${afterUnsub} | resubscribe ${resub} → ${afterResub}`,
    );

    expect(afterUnsub, 'the unsubscribe erased the bounce').toBe(
      'status=bounced suppressions=["unsubscribe"]',
    );
    const reached = await campaignTo(listId, 'status-unsub', [subject.email, control.email]);
    expect(reached).toContain(control.email);
    expect(reached, 'the bounced address reached the engine').not.toContain(subject.email);
    expect(afterResub).toBe('status=bounced suppressions=["unsubscribe"]');
  }, 180_000);

  it('a complaint after an unsubscribe is recorded, and a resubscribe does not reopen a complainer', async () => {
    const listId = await newList('fbl');
    const subject = await contactOn(listId, 'fbl');
    const control = await contactOn(listId, 'fbl-ctl');
    const unsub = await pref(subject.id, { globalUnsubscribe: true });
    const fbl = await complaint(subject.email);
    const afterFbl = await state(subject.id);
    const resub = await pref(subject.id, { globalResubscribe: true, resubscribeToLists: [listId] });
    const afterResub = await state(subject.id);
    console.log(
      `[z116] fbl: unsubscribe ${unsub} → complaint ${fbl} → ${afterFbl} | resubscribe ${resub} → ${afterResub}`,
    );

    expect(fbl, 'the FBL route refused the report').toBe(200);
    expect(afterFbl, 'the complaint was not recorded').toBe(
      'status=complained suppressions=["unsubscribe"]',
    );
    const reached = await campaignTo(listId, 'fbl-after', [subject.email, control.email]);
    expect(reached).toContain(control.email);
    expect(reached, 'a complainer reached the engine').not.toContain(subject.email);
    expect(afterResub).toBe('status=complained suppressions=["unsubscribe"]');
  }, 180_000);

  it('transactional mail is unchanged: a status-only bounce still gets it, a hard_bounce row still stops it', async () => {
    const listId = await newList('txn');
    const statusOnly = await contactOn(listId, 'txn-status');
    const withRow = await contactOn(listId, 'txn-row');
    await setStatus(statusOnly.id, 'bounced');
    await sql`INSERT INTO suppressions (org_id, email, reason) VALUES (${seed.id}, ${withRow.email}, 'hard_bounce')`;
    expect(await transactional(withRow.email)).toBe('not reached');
    expect(await transactional(statusOnly.email)).toBe('reached');
  }, 120_000);

  it('a soft bounce suppresses nothing: the next campaign reaches the address', async () => {
    const listId = await newList('soft');
    const subject = await contactOn(listId, 'soft');
    const control = await contactOn(listId, 'soft-ctl');
    engine.answer.set(subject.email, { code: 452, message: '4.2.2 mailbox full' });
    await campaignTo(listId, 'soft-first', [subject.email, control.email]);
    engine.answer.delete(subject.email);
    const afterSoft = await state(subject.id);
    const [ev] = await sql<{ bounce_type: string | null }[]>`
      SELECT bounce_type FROM email_events WHERE contact_id = ${subject.id} AND event_type = 'bounce'
    `;
    console.log(`[z116] soft: after 452 → ${afterSoft} bounce_type=${ev?.bounce_type}`);
    expect(ev?.bounce_type, 'the 4xx was not recorded as a soft bounce').toBe('soft');
    expect(afterSoft).toBe('status=active suppressions=[]');

    const reached = await campaignTo(listId, 'soft-after', [subject.email, control.email]);
    expect(reached).toContain(control.email);
    expect(reached, 'a soft bounce stopped the next campaign').toContain(subject.email);
  }, 180_000);
});
