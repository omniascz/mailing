/**
 * A transactional bounce is stored, and reaches the auto-pause; campaign
 * statistics are not touched by it.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * sendTransactionalEmail puts the orgId in a job's campaignId (and a random
 * contactId when the caller named none) — lib/queues.ts. /internal/events
 * inserted those ids into email_events, whose campaign_id and contact_id are
 * foreign keys, so every transactional deliver and bounce was refused with 400
 * INVALID_REFERENCE. The bounce never reached email_events, and the insert
 * failed before onBounceComplaintSignal was called, so the auto-pause (and the
 * IP reputation, which reads the same rows) never saw transactional bounces —
 * while the routes' own accept-time 'send' rows did count in the denominator.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * An organisation of its own, with an org-scoped 'high_bounce_rate' rule
 * (5 %, minimum 100 sends, action 'alert' — no sanction side effects). It gets
 * 95 accept-time 'send' rows, written the way /emails writes them, then five
 * transactional jobs shaped as sendTransactionalEmail shapes them, each with
 * its own 'send' row, run through the real mta-sender against a stub engine
 * that answers 550. 100 sends, 5 bounces: the rule must raise an abuse event.
 *
 * Then, in the seed org, a real campaign to two contacts, one of which
 * bounces, and the campaign's stats read from the API.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * The campaign case must keep working in the same run and print the same
 * numbers before and after the change; a successful receipt must store its
 * delivery.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP; the daily IP-reputation sweep (it reads the same
 *   rows, by metadata.sendingIp, and is not run here).
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
  answer: new Map<string, { code: number; message: string }>(),
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string }) => {
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
const RATE_LIMIT_BUCKET = `integration-txevents-${randomUUID()}`;

const tag = randomUUID().slice(0, 8);
const sendingDomain = `txevents-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `txevents-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
let pauseOrg: string;
let listId: string;
const contactIds: string[] = [];
const createdCampaigns: string[] = [];

/** What /internal/events answered, as mta-sender's own fetch saw it. */
const eventWrites: { status: number; body: string }[] = [];
const realFetch = globalThis.fetch;

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

const job = <T>(data: T): Job<T> =>
  ({
    id: `txevents-${randomUUID()}`,
    timestamp: Date.now(),
    data,
    opts: { attempts: 1 },
    attemptsMade: 0,
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
  if (!res.ok)
    throw new Error(`[txevents] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/**
 * A transactional message as sendTransactionalEmail queues it when the caller
 * names no contact (lib/queues.ts): campaignId = orgId, a random contactId,
 * stream 'transactional' — plus the accept-time 'send' row /emails writes.
 */
async function receipt(orgId: string, to: string): Promise<Record<string, unknown>> {
  const messageId = `<${randomUUID()}@forgemsg>`;
  await sql`
    INSERT INTO email_events (org_id, event_type, message_id, metadata)
    VALUES (${orgId}, 'send', ${messageId}, ${sql.json({ to, transactional: true })})
  `;
  const data = {
    campaignId: orgId,
    orgId,
    contactId: randomUUID(),
    messageId,
    fromEmail,
    fromName: '',
    toEmail: to,
    toName: '',
    subject: 'Faktura',
    htmlBody: '<p>x</p>',
    textBody: '',
    replyTo: '',
    customHeaders: {},
    stream: 'transactional',
    campaignIsPlaceholder: true,
  } as unknown as MtaSendJobData;
  const out = (await processMtaSend(job(data))) as Record<string, unknown>;
  return { ...out, messageId };
}

async function eventsOf(messageId: string) {
  return sql<
    { event_type: string; campaign_id: string | null; stream: string; bounce_type: string | null }[]
  >`
    SELECT event_type, campaign_id, stream, bounce_type FROM email_events
    WHERE message_id = ${messageId} ORDER BY created_at, event_type
  `;
}

/** The figure onBounceComplaintSignal computes (auto-pause.ts computeRecentRate). */
async function measured(orgId: string): Promise<{ sends: number; bounces: number }> {
  const [r] = await sql<{ sends: number; bounces: number }[]>`
    SELECT COUNT(*) FILTER (WHERE event_type = 'send')::int AS sends,
           COUNT(*) FILTER (WHERE event_type = 'bounce')::int AS bounces
    FROM email_events WHERE org_id = ${orgId} AND created_at >= now() - interval '24 hours'
  `;
  return r!;
}

/** Resolve after `ms` without blocking the event loop (the signal is fire-and-forget). */
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('transactional events are stored and feed the auto-pause (real DB + Redis + API)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'txevents');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;
    const [org] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug) VALUES (${`txevents ${tag}`}, ${`txevents-${tag}`})
      RETURNING id
    `;
    pauseOrg = org!.id;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const res = await realFetch(input, init);
      const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
      if (url.endsWith('/api/v1/internal/events')) {
        eventWrites.push({ status: res.status, body: (await res.clone().text()).slice(0, 120) });
      }
      return res;
    });
    await sql`
      INSERT INTO abuse_rules (org_id, name, description, signal_type, threshold, window_minutes,
                               min_sample_size, severity, action, enabled)
      VALUES (${pauseOrg}, 'txevents bounce', 'test', 'high_bounce_rate', '5', 60, 100,
              'high', 'alert', true)
    `;
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (pauseOrg) await sql`DELETE FROM organizations WHERE id = ${pauseOrg}`;
    if (createdCampaigns.length) {
      await sql`DELETE FROM email_events WHERE campaign_id = ANY(${createdCampaigns})`;
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    if (contactIds.length) {
      await sql`DELETE FROM suppressions WHERE org_id = ${seed.id} AND email LIKE ${`txevents-%-${tag}@test.local`}`;
      await sql`DELETE FROM email_events WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contact_lists WHERE contact_id = ANY(${contactIds})`;
      await sql`DELETE FROM contacts WHERE id = ANY(${contactIds})`;
    }
    if (listId) await sql`DELETE FROM lists WHERE id = ${listId}`;
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  it('a transactional hard bounce is stored, and five of them in a hundred sends raise the bounce rule', async () => {
    // 95 receipts that went out: the accept-time 'send' /emails writes, and the
    // 'deliver' mta-sender stores for it. The auto-pause divides by delivered
    // + bounced (Z121), so the deliveries are the denominator here — sends
    // alone used to be.
    await sql`
      INSERT INTO email_events (org_id, event_type, message_id, metadata, stream)
      SELECT ${pauseOrg}, t.type::email_event_type, '<seed-' || g || '-' || ${tag} || '@forgemsg>',
             '{"transactional":true}'::jsonb,
             (CASE WHEN t.type = 'deliver' THEN 'transactional' ELSE 'broadcast' END)::message_stream
      FROM generate_series(1, 95) g, (VALUES ('send'), ('deliver')) AS t(type)
    `;
    const before = await measured(pauseOrg);
    const results: Record<string, unknown>[] = [];
    eventWrites.length = 0;
    for (let i = 0; i < 5; i++) {
      const to = addr(`bounce${i}`);
      engine.answer.set(to, { code: 550, message: '5.1.1 user unknown' });
      results.push(await receipt(pauseOrg, to));
      engine.answer.delete(to);
    }
    await settle(1_500);
    const after = await measured(pauseOrg);
    const first = await eventsOf(results[0]!.messageId as string);
    const raised = await sql<
      { signal_type: string; observed_value: string; sample_size: number }[]
    >`
      SELECT signal_type, observed_value, sample_size FROM abuse_events WHERE org_id = ${pauseOrg}
    `;
    console.log(
      `[z120] transactional: job=${JSON.stringify(results[0])} rows=${JSON.stringify(first)} measured before=${JSON.stringify(before)} after=${JSON.stringify(after)} abuse_events=${JSON.stringify(raised)} first-job /internal/events=${JSON.stringify(eventWrites.slice(0, 1))}`,
    );

    expect(first.map((e) => e.event_type)).toEqual(['send', 'bounce']);
    const bounce = first.find((e) => e.event_type === 'bounce')!;
    expect(bounce).toMatchObject({
      campaign_id: null,
      stream: 'transactional',
      bounce_type: 'hard',
    });
    expect(after).toEqual({ sends: 100, bounces: 5 });
    expect(
      raised.map((r) => [r.signal_type, Number(r.observed_value), r.sample_size]),
    ).toContainEqual(['high_bounce_rate', 5, 100]);
  }, 120_000);

  it('a receipt that goes out stores its delivery; the send stays the one the route wrote', async () => {
    const r = await receipt(pauseOrg, addr('delivered'));
    const rows = await eventsOf(r.messageId as string);
    console.log(`[z120] delivered: job=${JSON.stringify(r)} rows=${JSON.stringify(rows)}`);
    expect(r.status).toBe('sent');
    expect(rows.map((e) => e.event_type).sort()).toEqual(['deliver', 'send']);
  }, 60_000);

  it('a campaign bounce still works, and the campaign stats rate it over delivery outcomes', async () => {
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${seed.id}, ${`txevents ${tag}`}) RETURNING id
    `;
    listId = list!.id;
    const people: { id: string; email: string }[] = [];
    for (const name of ['camp-ok', 'camp-bounce']) {
      const email = addr(name);
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, first_name, status)
        VALUES (${seed.id}, ${email}, 'Petra', 'active') RETURNING id
      `;
      contactIds.push(c!.id);
      people.push({ id: c!.id, email });
      await sql`INSERT INTO contact_lists (contact_id, list_id, confirmed_at) VALUES (${c!.id}, ${listId}, now())`;
    }
    const created = (await api('POST', '/api/v1/campaigns', {
      name: `txevents ${tag}`,
      subject: `Novinky ${tag}`,
      fromName: 'Obchod',
      fromEmail,
      listId,
      content: { html: '<p>x</p><a href="{{unsubscribe_url}}">Odhlásit</a>' },
    })) as { data: { id: string } };
    const campaignId = created.data.id;
    createdCampaigns.push(campaignId);
    const beforeSplit = await idsOn(campaignSplitterQueue);
    await api('POST', `/api/v1/campaigns/${campaignId}/send`);
    const [split] = (
      await addedTo<CampaignSplitterJobData>(campaignSplitterQueue, beforeSplit)
    ).filter((d) => d.campaignId === campaignId);
    const beforeBatch = await idsOn(batchSenderQueue);
    await processCampaignSplitter(job(split!));
    for (const b of (await addedTo<BatchSenderJobData>(batchSenderQueue, beforeBatch)).filter(
      (d) => d.campaignId === campaignId,
    ))
      await processBatchSender(job(b));
    engine.answer.set(people[1]!.email, { code: 550, message: '5.1.1 user unknown' });
    for (const p of people) {
      const jobs = (
        (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
      ).filter((j) => j?.data?.toEmail === p.email);
      for (const j of jobs) {
        await processMtaSend(j);
        await j.remove().catch(() => {});
      }
    }
    engine.answer.delete(people[1]!.email);

    const stats = (await api('GET', `/api/v1/campaigns/${campaignId}/stats`)) as {
      data: Record<string, unknown>;
    };
    const rows = await sql<{ event_type: string; n: number }[]>`
      SELECT event_type, count(*)::int AS n FROM email_events WHERE campaign_id = ${campaignId}
      GROUP BY event_type ORDER BY event_type
    `;
    const pick = (o: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(o).filter(([, v]) => typeof v === 'number' || typeof v === 'string'),
      );
    console.log(
      `[z120] campaign stats=${JSON.stringify(pick(stats.data))} rows=${JSON.stringify(rows)}`,
    );
    // One delivered, one hard bounce — a hard bounce records no 'send' of its
    // own, so the rows are what they were before #240.
    expect(Object.fromEntries(rows.map((r) => [r.event_type, r.n]))).toEqual({
      send: 1,
      deliver: 1,
      bounce: 1,
    });
    expect(pick(stats.data)).toMatchObject({
      sent: 1,
      delivered: 1,
      bounces: 1,
      hardBounces: 1,
      softBounces: 0,
      // Z124: 1 bounce in 2 messages is 50 %, and so is the delivery rate. This
      // asserted 100 % and 100 % — the value the stats had before #240, which
      // divided both by the one 'send' row the delivered message has. A
      // campaign cannot have bounced and delivered everything at once.
      bounceRate: 50,
      deliveryRate: 50,
    });
  }, 180_000);
});
