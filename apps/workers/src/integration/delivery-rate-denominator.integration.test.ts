/**
 * The IP reputation, the health score and the deliverability insights compute
 * their rates from delivery outcomes, not from the billing 'send' rows.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * All three divided by 'send' rows (or by deliveries, falling back to them).
 * A 'send' row is a billing record: mta-sender writes one for campaign mail it
 * delivered — not for a campaign message that bounced — and none at all for a
 * transactional message (#240: the route that bills it writes it, and the
 * twelve other callers of sendTransactionalEmail bill nothing). Bounces and
 * deliveries are written for every message. So:
 *  - an IP or org that only sends password resets had no denominator: the IP
 *    was never scored and the health score read 100 (A) at any bounce rate;
 *  - an IP or org mixing campaign mail and resets had every bounce divided by
 *    the delivered campaign messages alone, and the delivery rate came out
 *    above 100 %;
 *  - the insights divided hard bounces by deliveries only, so a true 5 % read
 *    as 5.26 % and crossed the 'critical' line.
 * The auto-pause had the same fault and was fixed in #241.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Three organisations, each sending from its own dedicated IP. Every message —
 * delivered or bounced, campaign or password reset — goes through the real
 * mta-sender against a stub engine that answers 250 or 550 and reports the
 * address it left from, and is stored by the real API. Then the three readers
 * are asked the way production asks them: the daily-run route the cron calls
 * (IP reputation), and the health-score and insights routes as the org's own
 * owner.
 *
 *   mixed       campaign 100 (5 bounce) + resets 100 (5 bounce)  true 5 %
 *   resets-bad  resets 100 (15 bounce)                           true 15 %
 *   clean       campaign 100 (0 bounce) + resets 100 (1 bounce)  true 0.5 %
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * The bad org must still read bad everywhere: IP scored and low, health score
 * failing, insights critical. The clean org must still read clean.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP; complaints, opens and clicks per IP (no writer
 *   stamps sendingIp on them — the opens here are SQL rows, only so the clean
 *   org's engagement is not zero).
 * - The UI: no web page reads these routes; the MCP tool and the API do.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg, type SeedOrg } from './setup/seed-org.js';
import { processMtaSend } from '../jobs/mta-sender.js';
import type { MtaSendJobData } from '../queues/index.js';
import { internalHeaders } from '../lib/internal-api.js';

// Hoisted with the mock: the factory runs while the imports above load.
const engine = vi.hoisted(() => ({
  bounce: new Set<string>(),
  ip: new Map<string, string>(),
}));
vi.mock('../lib/mta-grpc-client.js', () => ({
  close: () => {},
  send: async (msg: { toEmail: string }) => {
    const bounced = engine.bounce.has(msg.toEmail);
    return {
      success: !bounced,
      messageId: 'm',
      smtpCode: bounced ? 550 : 250,
      smtpMessage: bounced ? '5.1.1 user unknown' : 'OK',
      error: '',
      durationMs: '1',
      sendingIp: engine.ip.get(msg.toEmail) ?? '',
    };
  },
}));

const API = process.env.API_URL!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

/** This file's own bucket in the API's 100/min limiter, as in recipient-resubscribe. */
const RATE_LIMIT_BUCKET = `integration-delivery-rate-${randomUUID()}`;

const tag = randomUUID().slice(0, 8);
const fromEmail = `noreply@delivery-rate-${tag}.test`;
const octet = () => 1 + Math.floor(Math.random() * 250);
const IPS = { mixed: `203.0.113.${octet()}`, bad: '', clean: '' };
do IPS.bad = `203.0.113.${octet()}`;
while (IPS.bad === IPS.mixed);
do IPS.clean = `203.0.113.${octet()}`;
while (IPS.clean === IPS.mixed || IPS.clean === IPS.bad);

let seed: SeedOrg;
let token: string;
let userId: string;
const orgs: string[] = [];

async function api(method: string, path: string, bearer: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      'x-api-key': RATE_LIMIT_BUCKET,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`[delivery-rate] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as { data: unknown };
}

/** An organisation the seed user owns, sending from its own dedicated IP. */
async function org(name: string, ip: string): Promise<{ id: string; token: string }> {
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug) VALUES (${`delivery-rate ${name} ${tag}`}, ${`delivery-rate-${name}-${tag}`})
    RETURNING id
  `;
  orgs.push(o!.id);
  await sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    SELECT ${o!.id}, id, email, 'owner', 'active' FROM users WHERE id = ${userId}
  `;
  await sql`DELETE FROM dedicated_ips WHERE ip_address = ${ip}`;
  await sql`INSERT INTO dedicated_ips (ip_address, org_id, status) VALUES (${ip}, ${o!.id}, 'active')`;
  const switched = (await api('POST', '/api/v1/me/orgs/switch', token, { orgId: o!.id })) as {
    data: { token: string };
  };
  return { id: o!.id, token: switched.data.token };
}

/** `n` messages through the real mta-sender from `ip`, the first `bouncing` of them answered 550. */
async function send(
  orgId: string,
  ip: string,
  n: number,
  bouncing: number,
  kind: 'campaign' | 'reset',
): Promise<void> {
  let campaignId: string | undefined;
  if (kind === 'campaign') {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO campaigns (org_id, name) VALUES (${orgId}, ${`delivery-rate ${tag}`}) RETURNING id
    `;
    campaignId = c!.id;
  }
  for (let i = 0; i < n; i++) {
    const to = `delivery-rate-${kind}-${i}-${randomUUID().slice(0, 6)}@test.local`;
    engine.ip.set(to, ip);
    if (i < bouncing) engine.bounce.add(to);
    // A campaign message goes to a real contact (its event row references it);
    // a reset carries the random id sendTransactionalEmail gives it.
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
      messageId: `<dr-${randomUUID()}@forgemsg>`,
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
      id: `delivery-rate-${randomUUID()}`,
      data,
      opts: { attempts: 1 },
      attemptsMade: 0,
      log: async () => {},
    } as unknown as Job<MtaSendJobData>);
    engine.ip.delete(to);
    engine.bounce.delete(to);
  }
}

/** Opens as the tracking pixel stores them — no sendingIp — so engagement is not zero. */
async function opens(orgId: string, n: number): Promise<void> {
  await sql`
    INSERT INTO email_events (org_id, event_type)
    SELECT ${orgId}, 'open'::email_event_type FROM generate_series(1, ${n})
  `;
}

interface Measured {
  rows: Record<string, { all: number; withIp: number }>;
  ip: { bounceRate: number; score: number; scored: boolean };
  health: { score: number; grade: string; bounceRate: number; deliveryRate: number };
  insights: Array<{ ruleId: string; severity: string; rate: number }>;
}

const measured: Record<string, Measured> = {};
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

async function measure(name: string, ip: string): Promise<Measured> {
  const rows = await sql<{ event_type: string; all: number; with_ip: number }[]>`
    SELECT event_type::text AS event_type, count(*)::int AS all,
           count(*) FILTER (WHERE metadata ? 'sendingIp')::int AS with_ip
    FROM email_events WHERE org_id = ${ids[name]!}
    GROUP BY event_type
  `;
  const [d] = await sql<
    { bounce_rate: string; reputation_score: string; reputation_updated_at: Date | null }[]
  >`SELECT bounce_rate, reputation_score, reputation_updated_at FROM dedicated_ips WHERE ip_address = ${ip}`;
  const health = (await api('GET', '/api/v1/deliverability/health-score?days=30', tokens[name]!))
    .data as {
    score: number;
    grade: string;
    components: { bounceRate: number; deliveryRate: number };
  };
  const insights = (await api('GET', '/api/v1/deliverability/insights?window=7', tokens[name]!))
    .data as Array<{ ruleId: string; severity: string; metrics: Record<string, number> }>;
  return {
    rows: Object.fromEntries(
      [...rows]
        .sort((a, b) => a.event_type.localeCompare(b.event_type))
        .map((r) => [r.event_type, { all: r.all, withIp: r.with_ip }]),
    ),
    ip: {
      bounceRate: Number(d!.bounce_rate),
      score: Number(d!.reputation_score),
      scored: d!.reputation_updated_at !== null,
    },
    health: {
      score: health.score,
      grade: health.grade,
      bounceRate: health.components.bounceRate,
      deliveryRate: health.components.deliveryRate,
    },
    insights: insights.map((i) => ({
      ruleId: i.ruleId,
      severity: i.severity,
      rate: Math.round((i.metrics.hardRate ?? i.metrics.complaintRate ?? 0) * 10_000) / 10_000,
    })),
  };
}

describe('deliverability rates are one set of messages (real DB + Redis + API)', () => {
  beforeAll(async () => {
    seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'delivery-rate');
    const [u] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = 'demo@acme.test' AND org_id = ${seed.id}
    `;
    userId = u!.id;

    for (const [name, ip] of [
      ['mixed', IPS.mixed],
      ['bad', IPS.bad],
      ['clean', IPS.clean],
    ] as const) {
      const o = await org(name, ip);
      ids[name] = o.id;
      tokens[name] = o.token;
    }
    await send(ids.mixed!, IPS.mixed, 100, 5, 'campaign');
    await send(ids.mixed!, IPS.mixed, 100, 5, 'reset');
    await send(ids.bad!, IPS.bad, 100, 15, 'reset');
    await send(ids.clean!, IPS.clean, 100, 0, 'campaign');
    await send(ids.clean!, IPS.clean, 100, 1, 'reset');
    await opens(ids.clean!, 60);

    // The route the 06:00 cron calls; the reputation sweep is one of its parts.
    const res = await fetch(`${API}/api/v1/internal/triggers/daily-run`, {
      method: 'POST',
      headers: { ...internalHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(120_000),
    });
    expect(res.status, await res.text()).toBe(200);

    for (const [name, ip] of [
      ['mixed', IPS.mixed],
      ['bad', IPS.bad],
      ['clean', IPS.clean],
    ] as const) {
      measured[name] = await measure(name, ip);
      console.log(`[z122] ${name}: ${JSON.stringify(measured[name])}`);
    }
  }, 300_000);

  afterAll(async () => {
    if (orgs.length) {
      await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
    }
    await sql`DELETE FROM dedicated_ips WHERE ip_address IN ${sql([IPS.mixed, IPS.bad, IPS.clean])}`;
    await sql.end();
  }, 120_000);

  it('the rows are what mta-sender writes: no send for a bounce or a reset; every outcome names the IP', () => {
    expect(measured.mixed!.rows).toEqual({
      bounce: { all: 10, withIp: 10 },
      deliver: { all: 190, withIp: 190 },
      send: { all: 95, withIp: 95 },
    });
    expect(measured.bad!.rows).toEqual({
      bounce: { all: 15, withIp: 15 },
      deliver: { all: 85, withIp: 85 },
    });
  });

  it('IP reputation: the bounce rate is bounces over delivery outcomes', () => {
    expect(measured.mixed!.ip.bounceRate, 'mixed IP: true rate is 10 of 200').toBe(5);
    expect(measured.clean!.ip.bounceRate, 'clean IP: true rate is 1 of 200').toBe(0.5);
  });

  it('IP reputation: an IP that only sends resets is scored, and scored bad', () => {
    expect(measured.bad!.ip.scored, 'an IP with 100 outcomes was skipped as "no history"').toBe(
      true,
    );
    expect(measured.bad!.ip.bounceRate).toBe(15);
    expect(measured.bad!.ip.score).toBeLessThan(60);
    expect(measured.clean!.ip.score, 'the clean IP must score above the bad one').toBeGreaterThan(
      measured.bad!.ip.score,
    );
  });

  it('health score: delivery and bounce rates are fractions of the same messages', () => {
    expect(measured.mixed!.health.bounceRate).toBe(0.05);
    expect(measured.mixed!.health.deliveryRate).toBe(0.95);
    expect(measured.clean!.health.deliveryRate).toBe(0.995);
  });

  it('health score: a reset-only org bouncing 15 % fails, it does not read 100 (A)', () => {
    expect(measured.bad!.health.bounceRate).toBe(0.15);
    expect(['D', 'F']).toContain(measured.bad!.health.grade);
    expect(measured.clean!.health.grade, 'the clean org must still read clean').toBe('A');
  });

  it('insights: a true 5 % hard-bounce rate is a warning at 5 %, and 15 % is critical', () => {
    expect(measured.mixed!.insights).toEqual([
      { ruleId: 'hard-bounce-rate', severity: 'warn', rate: 0.05 },
    ]);
    expect(measured.bad!.insights).toEqual([
      { ruleId: 'hard-bounce-rate', severity: 'critical', rate: 0.15 },
    ]);
    expect(measured.clean!.insights).toEqual([]);
  });
});
