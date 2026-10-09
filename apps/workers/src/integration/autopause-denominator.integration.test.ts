/**
 * The auto-pause computes its bounce rate from one set of messages: the
 * outcome of every delivery attempt, not the billing 'send' rows.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * computeRecentRate divided bounces by 'send' rows. A 'send' row is written by
 * the routes that bill a message (/emails, /transactional/email, …) and by
 * mta-sender for campaign mail it delivered — not by the twelve other callers
 * of sendTransactionalEmail (password resets, DOI confirmations, alerts…), and
 * once per API call on /emails however many recipients it has. Bounces are
 * written for every message (#240). So the rate's numerator and denominator
 * came from different sets:
 *  - an org that only sends password resets had no denominator at all — the
 *    sample was 0 and the rule could never fire, at any bounce rate;
 *  - an org mixing billed receipts and resets had resets' bounces divided by
 *    the receipts alone — the rate read higher than it was.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Four organisations, each with its own 'high_bounce_rate' rule (10 %, at
 * least 100, action 'alert' — no sanction side effects). Deliveries are the
 * rows mta-sender writes for a delivered message; every bounce is produced by
 * the real mta-sender against a stub engine answering 550, so the rule is
 * evaluated by the real onBounceComplaintSignal. Then, in the seed org, one
 * /emails call to to+cc+bcc, with billing read from /billing/capacity before
 * and after.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A campaign with a real 10 % bounce rate must raise the rule in the same run,
 * and a password-reset org with a real 15 % must too.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP; the daily IP-reputation sweep.
 * - Complaints: the complaint rate's denominator changes the same way
 *   (delivered mail), and is not walked here.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job, JobType } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processMtaSend } from '../jobs/mta-sender.js';
import { mtaQueues, type MtaSendJobData } from '../queues/index.js';

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
const RATE_LIMIT_BUCKET = `integration-autopause-${randomUUID()}`;

const tag = randomUUID().slice(0, 8);
const sendingDomain = `autopause-${tag}.test`;
const fromEmail = `noreply@${sendingDomain}`;
const addr = (name: string) => `autopause-${name}-${tag}@test.local`;

let seed: SeedOrg;
let token: string;
const orgs: string[] = [];
const seedAddresses: string[] = [];

const ALL_STATES: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active'];

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
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
    throw new Error(`[autopause] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** An organisation with its own 10 % bounce rule. */
async function orgWithRule(name: string): Promise<string> {
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug) VALUES (${`autopause ${name} ${tag}`}, ${`autopause-${name}-${tag}`})
    RETURNING id
  `;
  orgs.push(o!.id);
  await sql`
    INSERT INTO abuse_rules (org_id, name, description, signal_type, threshold, window_minutes,
                             min_sample_size, severity, action, enabled)
    VALUES (${o!.id}, 'autopause 10%', 'test', 'high_bounce_rate', '10', 60, 100,
            'critical', 'alert', true)
  `;
  return o!.id;
}

/** Rows mta-sender writes for `n` delivered messages (send only for billed/campaign mail). */
async function delivered(
  orgId: string,
  n: number,
  opts: { campaignId?: string; billedSend?: boolean; stream: string },
): Promise<void> {
  for (let i = 0; i < n; i++) {
    const messageId = `<d-${randomUUID()}@forgemsg>`;
    if (opts.billedSend) {
      await sql`
        INSERT INTO email_events (org_id, campaign_id, event_type, message_id, stream)
        VALUES (${orgId}, ${opts.campaignId ?? null}, 'send', ${messageId}, ${opts.stream})
      `;
    }
    await sql`
      INSERT INTO email_events (org_id, campaign_id, event_type, message_id, stream)
      VALUES (${orgId}, ${opts.campaignId ?? null}, 'deliver', ${messageId}, ${opts.stream})
    `;
  }
}

/** `n` hard bounces through the real mta-sender, shaped as their path shapes them. */
async function bounces(orgId: string, n: number, campaignId?: string): Promise<void> {
  for (let i = 0; i < n; i++) {
    const to = addr(`b-${randomUUID().slice(0, 6)}`);
    engine.answer.set(to, { code: 550, message: '5.1.1 user unknown' });
    // A campaign message goes to a real contact (its event row references
    // it); a reset carries the random id sendTransactionalEmail gives it.
    let contactId: string = randomUUID();
    if (campaignId) {
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, status) VALUES (${orgId}, ${to}, 'active') RETURNING id
      `;
      contactId = c!.id;
    }
    const data = {
      campaignId: campaignId ?? orgId,
      orgId,
      contactId,
      messageId: `<b-${randomUUID()}@forgemsg>`,
      fromEmail,
      fromName: '',
      toEmail: to,
      toName: '',
      subject: campaignId ? 'Novinky' : 'Reset your password',
      htmlBody: '<p>x</p>',
      textBody: '',
      replyTo: '',
      customHeaders: {},
      stream: campaignId ? 'broadcast' : 'transactional',
      ...(campaignId ? {} : { campaignIsPlaceholder: true }),
    } as unknown as MtaSendJobData;
    await processMtaSend({
      id: `autopause-${randomUUID()}`,
      data,
      opts: { attempts: 1 },
      attemptsMade: 0,
      log: async () => {},
    } as unknown as Job<MtaSendJobData>);
    engine.answer.delete(to);
  }
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What the org's rows hold, and what the rule raised. */
async function outcome(orgId: string) {
  const [c] = await sql<{ sends: number; delivers: number; bounces: number }[]>`
    SELECT COUNT(*) FILTER (WHERE event_type = 'send')::int AS sends,
           COUNT(*) FILTER (WHERE event_type = 'deliver')::int AS delivers,
           COUNT(*) FILTER (WHERE event_type = 'bounce')::int AS bounces
    FROM email_events WHERE org_id = ${orgId}
  `;
  const raised = await sql<{ observed_value: string; sample_size: number }[]>`
    SELECT observed_value, sample_size FROM abuse_events
    WHERE org_id = ${orgId} AND signal_type = 'high_bounce_rate'
    ORDER BY created_at
  `;
  return {
    rows: c!,
    raised: raised.map((r) => `${Number(r.observed_value)}%/N=${r.sample_size}`),
  };
}

describe('the auto-pause rate is one set of messages (real DB + Redis + API)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'autopause');
    await sql`
      INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified)
      VALUES (${seed.id}, ${sendingDomain}, 'fm1', true, true)
    `;
  }, 120_000);

  afterAll(async () => {
    if (orgs.length) await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
    for (const a of seedAddresses) {
      const jobs = (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)).filter(
        (j) => (j?.data as MtaSendJobData | undefined)?.toEmail === a,
      );
      for (const j of jobs) await j.remove().catch(() => {});
    }
    await sql`DELETE FROM sending_domains WHERE domain = ${sendingDomain}`;
    await sql.end();
  }, 120_000);

  it('100 password resets, 5 of them bouncing (5 %): the rule does not fire', async () => {
    const org = await orgWithRule('resets-5');
    await delivered(org, 95, { stream: 'transactional' });
    await bounces(org, 5);
    await settle(1_000);
    const o = await outcome(org);
    console.log(`[z121] resets 5/100: ${JSON.stringify(o)}`);
    expect(o.rows).toEqual({ sends: 0, delivers: 95, bounces: 5 });
    expect(o.raised).toEqual([]);
  }, 120_000);

  it('100 password resets, 15 bouncing (15 %): the rule fires on a 100-message sample', async () => {
    const org = await orgWithRule('resets-15');
    await delivered(org, 85, { stream: 'transactional' });
    await bounces(org, 15);
    await settle(1_000);
    const o = await outcome(org);
    console.log(`[z121] resets 15/100: ${JSON.stringify(o)}`);
    expect(o.raised, 'a 15 % bounce rate on resets went unseen').toContain('15%/N=100');
  }, 120_000);

  it('100 billed receipts and 100 resets, 10 resets bouncing (5 %): the rule does not fire', async () => {
    const org = await orgWithRule('mixed');
    await delivered(org, 100, { stream: 'transactional', billedSend: true });
    await delivered(org, 90, { stream: 'transactional' });
    await bounces(org, 10);
    await settle(1_000);
    const o = await outcome(org);
    console.log(`[z121] mixed 10/200: ${JSON.stringify(o)}`);
    expect(o.rows).toEqual({ sends: 100, delivers: 190, bounces: 10 });
    expect(o.raised, 'the rate was read off the billed sends alone').toEqual([]);
  }, 120_000);

  it('a campaign with a real 10 % bounce rate fires the rule', async () => {
    const org = await orgWithRule('campaign');
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO campaigns (org_id, name) VALUES (${org}, ${`autopause ${tag}`}) RETURNING id
    `;
    await delivered(org, 90, { campaignId: c!.id, billedSend: true, stream: 'broadcast' });
    await bounces(org, 10, c!.id);
    await settle(1_000);
    const o = await outcome(org);
    console.log(`[z121] campaign 10/100: ${JSON.stringify(o)}`);
    expect(o.raised.length, 'a real 10 % campaign bounce rate did not fire').toBeGreaterThan(0);
  }, 120_000);

  it('/emails to+cc+bcc: one billed send, three deliveries; billing counts what it counted', async () => {
    const capacity = async () =>
      ((await api('GET', '/api/v1/billing/capacity')) as { data: Record<string, unknown> }).data;
    const before = await capacity();
    const [to, cc, bcc] = ['to', 'cc', 'bcc'].map((k) => addr(`multi-${k}`));
    seedAddresses.push(to!, cc!, bcc!);
    const sent = (await api('POST', '/api/v1/emails', {
      from: fromEmail,
      to,
      cc,
      bcc,
      subject: 'Faktura',
      html: '<p>x</p>',
    })) as { id: string };
    for (const a of [to!, cc!, bcc!]) {
      const jobs = (
        (await mtaQueues.other.getJobs(ALL_STATES, 0, 5_000)) as Job<MtaSendJobData>[]
      ).filter((j) => j?.data?.toEmail === a);
      for (const j of jobs) {
        await processMtaSend(j);
        await j.remove().catch(() => {});
      }
    }
    const after = await capacity();
    const rows = await sql<{ event_type: string; n: number }[]>`
      SELECT event_type, count(*)::int AS n FROM email_events
      WHERE org_id = ${seed.id} AND message_id LIKE ${`%${sent.id}%`}
      GROUP BY event_type ORDER BY event_type
    `;
    const pick = (o: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => /send/i.test(k)));
    console.log(
      `[z121] /emails to+cc+bcc: rows=${JSON.stringify(rows)} billing before=${JSON.stringify(pick(before))} after=${JSON.stringify(pick(after))}`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.event_type, r.n]))).toEqual({
      send: 1,
      deliver: 3,
    });
  }, 120_000);
});
