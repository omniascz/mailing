/**
 * Every reader that reports a bounce, complaint or delivery rate divides by
 * delivery outcomes, not by the billing 'send' rows.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * A 'send' row is a billing record. mta-sender writes one for a campaign
 * message it delivered and none for a campaign message that bounced; nothing
 * writes one for a password reset (#240). Deliveries and bounces are written
 * for every message. #241 moved the auto-pause and #242 the IP reputation,
 * health score and insights onto `deliveryDenominators`; these readers were
 * still on 'send':
 *
 *   pre-send/go-no-go.ts            7-day bounce/complaint, 24h complaint (the pre-send verdict)
 *   analytics/index.ts              campaign delivery / bounce / complaint rate (customer-facing)
 *   analytics/account-stats.ts      account delivery / bounce / complaint rate
 *   deliverability/anomaly-detector campaign bounce / complaint — pauses a sending campaign
 *   analytics/anomaly-detector      org bounce / complaint spike alerts
 *   report-builder/pure.ts          bounce_rate
 *   routes/v1/superadmin.ts         org complaint rate (operator)
 *   templates/performance.ts        template delivery / bounce rate
 *   mcp campaign-performance        delivered (x %) line
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Five organisations. Every message goes through the real mta-sender against
 * a stub engine that answers 250 or 550, and is stored by the real API. The
 * readers are asked through their routes, as the org's owner (or, for the
 * superadmin view, a system admin).
 *
 *   resets   100 password resets, 15 bounce, 1 complaint      transactional only
 *   oneOne   campaign of 2: 1 delivered, 1 bounced            campaign only
 *   fresh    nothing sent; one draft campaign                 no history
 *   mixed    campaign 100 (4 bounce) + resets 100 (4 bounce), 2 complaints off the campaign
 *   spike    campaign 100 (6 bounce), status sending          the anomaly pause
 *
 * The complaints are SQL rows: mta-sender does not write complaints (the FBL
 * processor does), and the readers only count them.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * The bad must still read bad: a 15 % reset sender fails the pre-send verdict
 * and raises alerts; 6 bounces in 100 pause the campaign. The clean must still
 * read clean: a true 4 % campaign is not paused. And no history is not a
 * block: the fresh org's reputation checks are informational.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP; ClickHouse (the campaign stats here come from the
 *   Postgres fallback, which feeds the same pure function).
 * - The UI. No web page reads these routes.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser, SEED_LOGIN } from './setup/login.js';
import { readSeedOrg } from './setup/seed-org.js';
import { processMtaSend } from '../jobs/mta-sender.js';
import type { MtaSendJobData } from '../queues/index.js';
import { internalHeaders } from '../lib/internal-api.js';
import { getCampaignPerformance } from '../../../api/dist/services/mcp/tools/campaign-performance.js';

const engine = vi.hoisted(() => ({ bounce: new Set<string>() }));
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
      sendingIp: '',
    };
  },
}));

const API = process.env.API_URL!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

/** This file's own bucket in the API's limiters, as in delivery-rate-denominator. */
const RATE_LIMIT_BUCKET = `integration-rate-readers-${randomUUID()}`;

const tag = randomUUID().slice(0, 8);
const fromEmail = `noreply@rate-readers-${tag}.test`;

let token: string;
let userId: string;
let adminToken: string;
const orgs: string[] = [];
const adminUserIds: string[] = [];

async function call(method: string, path: string, bearer: string, body?: unknown) {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      'x-api-key': RATE_LIMIT_BUCKET,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(120_000),
  });
}

async function api<T>(method: string, path: string, bearer: string, body?: unknown): Promise<T> {
  const res = await call(method, path, bearer, body);
  const text = await res.text();
  if (!res.ok)
    throw new Error(`[rate-readers] ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (JSON.parse(text) as { data: T }).data;
}

interface Org {
  id: string;
  token: string;
  templateId: string;
  campaigns: Record<string, string>;
}

async function makeOrg(name: string): Promise<Org> {
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug) VALUES (${`rate-readers ${name} ${tag}`}, ${`rate-readers-${name}-${tag}`})
    RETURNING id
  `;
  orgs.push(o!.id);
  await sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    SELECT ${o!.id}, id, email, 'owner', 'active' FROM users WHERE id = ${userId}
  `;
  const [t] = await sql<{ id: string }[]>`
    INSERT INTO templates (org_id, name) VALUES (${o!.id}, ${`rate-readers ${tag}`}) RETURNING id
  `;
  const switched = await api<{ token: string }>('POST', '/api/v1/me/orgs/switch', token, {
    orgId: o!.id,
  });
  return { id: o!.id, token: switched.token, templateId: t!.id, campaigns: {} };
}

async function campaign(o: Org, key: string): Promise<string> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO campaigns (org_id, name, template_id)
    VALUES (${o.id}, ${`rate-readers ${key} ${tag}`}, ${o.templateId}) RETURNING id
  `;
  o.campaigns[key] = c!.id;
  return c!.id;
}

/** `n` messages through the real mta-sender, the first `bouncing` answered 550. */
async function send(
  o: Org,
  n: number,
  bouncing: number,
  kind: 'campaign' | 'reset',
  campaignId?: string,
): Promise<void> {
  for (let i = 0; i < n; i++) {
    const to = `rate-readers-${kind}-${i}-${randomUUID().slice(0, 6)}@test.local`;
    if (i < bouncing) engine.bounce.add(to);
    let contactId: string = randomUUID();
    if (kind === 'campaign') {
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, status) VALUES (${o.id}, ${to}, 'active') RETURNING id
      `;
      contactId = c!.id;
    }
    const data = {
      campaignId: kind === 'campaign' ? campaignId! : o.id,
      orgId: o.id,
      contactId,
      messageId: `<rr-${randomUUID()}@forgemsg>`,
      fromEmail,
      fromName: '',
      toEmail: to,
      toName: '',
      subject: kind === 'campaign' ? 'Novinky' : 'Reset your password',
      htmlBody: '<p>x</p>',
      textBody: '',
      replyTo: '',
      customHeaders: {},
      stream: kind === 'campaign' ? 'broadcast' : 'transactional',
      ...(kind === 'campaign' ? {} : { campaignIsPlaceholder: true }),
    } as unknown as MtaSendJobData;
    await processMtaSend({
      id: `rate-readers-${randomUUID()}`,
      data,
      opts: { attempts: 1 },
      attemptsMade: 0,
      log: async () => {},
    } as unknown as Job<MtaSendJobData>);
    engine.bounce.delete(to);
  }
}

/** Complaints as rows: the FBL processor writes them, not mta-sender. */
async function complaints(orgId: string, n: number, campaignId: string | null): Promise<void> {
  await sql`
    INSERT INTO email_events (org_id, campaign_id, event_type)
    SELECT ${orgId}, ${campaignId}, 'complaint'::email_event_type FROM generate_series(1, ${n})
  `;
}

interface Check {
  id: string;
  severity: string;
  metrics?: Record<string, number | string>;
}
interface Reading {
  rows: Record<string, number>;
  goNoGo: { verdict: string; bounce: Check; complaint: Check; failing: string[] };
  account: { deliveryRate: number; bounceRate: number; complaintRate: number };
  alerts: Array<{ type: string; severity: string; rate: number }>;
  report: { bounce_rate: number; complaint_rate: number };
  superadmin: number;
  campaign?: {
    stats: { deliveryRate: number; bounceRate: number; complaintRate: number };
    template: { deliveryRatePct: number | null; bounceRatePct: number | null };
    report: { bounce_rate: number; complaint_rate: number };
    mcp: string;
  };
}

async function read(o: Org, campaignKey: string): Promise<Reading> {
  const rows = await sql<{ event_type: string; n: number }[]>`
    SELECT event_type::text AS event_type, count(*)::int AS n FROM email_events
    WHERE org_id = ${o.id} GROUP BY event_type ORDER BY event_type
  `;
  const cid = o.campaigns[campaignKey]!;
  const pre = await api<{ verdict: string; checks: Check[] }>(
    'GET',
    `/api/v1/campaigns/${cid}/pre-send-checks`,
    o.token,
  );
  const account = await api<Reading['account']>(
    'GET',
    '/api/v1/account/send-statistics?days=30',
    o.token,
  );
  const check = await api<{
    alerts: Array<{ type: string; severity: string; details: Record<string, number> }>;
  }>('POST', '/api/v1/alerts/run-check', o.token, {});
  const definition = { metrics: ['bounce_rate', 'complaint_rate'], dimension: 'none' };
  const report = await api<{ totals: Reading['report'] }>('POST', '/api/v1/reports/run', o.token, {
    definition,
  });
  const admin = await api<{ stats: { complaintRate: number } }>(
    'GET',
    `/api/v1/superadmin/orgs/${o.id}`,
    adminToken,
  );

  const reading: Reading = {
    rows: Object.fromEntries(rows.map((r) => [r.event_type, r.n])),
    goNoGo: {
      verdict: pre.verdict,
      bounce: pick(pre.checks, 'bounce-rate'),
      complaint: pick(pre.checks, 'complaint-rate'),
      failing: pre.checks
        .filter((c) => c.severity === 'fail' || c.severity === 'warn')
        .map((c) => `${c.id}:${c.severity}`),
    },
    account: {
      deliveryRate: account.deliveryRate,
      bounceRate: account.bounceRate,
      complaintRate: account.complaintRate,
    },
    alerts: check.alerts.map((a) => ({
      type: a.type,
      severity: a.severity,
      rate:
        Math.round((a.details.currentBounceRate ?? a.details.complaintRate ?? -1) * 10_000) /
        10_000,
    })),
    report: report.totals,
    superadmin: Math.round(admin.stats.complaintRate * 10_000) / 10_000,
  };

  // Campaign mail only: these readers are per campaign or per template.
  const [{ n: sentMail } = { n: 0 }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM email_events
    WHERE campaign_id = ${cid} AND event_type IN ('deliver', 'bounce')
  `;
  if (sentMail > 0) {
    const stats = await api<{ deliveryRate: number; bounceRate: number; complaintRate: number }>(
      'GET',
      `/api/v1/campaigns/${cid}/stats`,
      o.token,
    );
    const template = await api<{ deliveryRatePct: number | null; bounceRatePct: number | null }>(
      'GET',
      `/api/v1/saved-templates/${o.templateId}/performance`,
      o.token,
    );
    const campaignReport = await api<{ totals: Reading['report'] }>(
      'POST',
      '/api/v1/reports/run',
      o.token,
      { definition, campaignId: cid },
    );
    const out = await getCampaignPerformance.run({ campaign: cid }, {
      call: async (path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
        const res = await call(method, path, o.token, body);
        return { status: res.status, body: (await res.json()) as unknown };
      },
    } as never);
    reading.campaign = {
      stats: {
        deliveryRate: stats.deliveryRate,
        bounceRate: stats.bounceRate,
        complaintRate: stats.complaintRate,
      },
      template: {
        deliveryRatePct: template.deliveryRatePct,
        bounceRatePct: template.bounceRatePct,
      },
      report: campaignReport.totals,
      mcp: out
        .split('\n')
        .find((l) => l.trim().startsWith('delivered'))!
        .trim(),
    };
  }
  return reading;
}

function pick(checks: Check[], id: string): Check {
  const c = checks.find((x) => x.id === id)!;
  return { id: c.id, severity: c.severity, ...(c.metrics ? { metrics: c.metrics } : {}) };
}

const o: Record<string, Org> = {};
const r: Record<string, Reading> = {};
let scan: {
  scanned: number;
  anomalies: Array<{
    campaignId: string;
    reason: string;
    bounceRatePct: number;
    sampleSize: number;
  }>;
};

describe('every bounce, complaint and delivery rate is over delivery outcomes (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'rate-readers');
    const [u] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = 'demo@acme.test' AND org_id = ${seed.id}
    `;
    userId = u!.id;

    for (const name of ['resets', 'oneOne', 'fresh', 'mixed', 'spike'])
      o[name] = await makeOrg(name);

    // A system admin for the superadmin view: the seed user's password, its own row.
    const adminEmail = `rate-readers-admin-${tag}@test.local`;
    const [a] = await sql<{ id: string }[]>`
      INSERT INTO users (org_id, email, name, password_hash, role, email_verified)
      SELECT ${o.fresh!.id}, ${adminEmail}, 'rate readers admin', password_hash, 'system_admin', true
      FROM users WHERE id = ${userId}
      RETURNING id
    `;
    adminUserIds.push(a!.id);
    const login = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': RATE_LIMIT_BUCKET },
      body: JSON.stringify({ email: adminEmail, password: SEED_LOGIN.password }),
      signal: AbortSignal.timeout(20_000),
    });
    const loginText = await login.text();
    expect(login.status, loginText).toBe(200);
    adminToken = (JSON.parse(loginText) as { token: string }).token;

    await campaign(o.resets!, 'draft');
    await send(o.resets!, 100, 15, 'reset');
    await complaints(o.resets!.id, 1, null);

    await send(o.oneOne!, 2, 1, 'campaign', await campaign(o.oneOne!, 'main'));

    await campaign(o.fresh!, 'draft');

    await send(o.mixed!, 100, 4, 'campaign', await campaign(o.mixed!, 'main'));
    await send(o.mixed!, 100, 4, 'reset');
    // Off the campaign: on it, 2 in 96 is 2.08 % and the detector rightly
    // pauses the campaign for complaints, which would hide the bounce control.
    await complaints(o.mixed!.id, 2, null);

    await send(o.spike!, 100, 6, 'campaign', await campaign(o.spike!, 'main'));

    // The detector watches campaigns that are sending.
    await sql`
      UPDATE campaigns SET status = 'sending'
      WHERE id = ANY(${[o.mixed!.campaigns.main!, o.spike!.campaigns.main!]})
    `;

    r.resets = await read(o.resets!, 'draft');
    r.oneOne = await read(o.oneOne!, 'main');
    r.fresh = await read(o.fresh!, 'draft');
    r.mixed = await read(o.mixed!, 'main');
    r.spike = await read(o.spike!, 'main');

    // The 5-minute sweep the workers call.
    const res = await fetch(`${API}/api/v1/internal/anomaly-detector/scan`, {
      method: 'POST',
      headers: { ...internalHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const mine = new Set([o.mixed!.campaigns.main!, o.spike!.campaigns.main!]);
    const all = (JSON.parse(text) as { data: typeof scan }).data;
    scan = {
      scanned: all.scanned,
      anomalies: all.anomalies
        .filter((x) => mine.has(x.campaignId))
        .map((x) => ({
          campaignId: x.campaignId === o.spike!.campaigns.main ? 'spike' : 'mixed',
          reason: x.reason,
          bounceRatePct: Math.round(x.bounceRatePct * 100) / 100,
          sampleSize: x.sampleSize,
        })),
    };

    for (const [name, reading] of Object.entries(r)) {
      console.log(`[z124] ${name}: ${JSON.stringify(reading)}`);
    }
    console.log(`[z124] anomaly scan: ${JSON.stringify(scan.anomalies)}`);
  }, 600_000);

  afterAll(async () => {
    if (adminUserIds.length) await sql`DELETE FROM users WHERE id = ANY(${adminUserIds})`;
    if (orgs.length) await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
    await sql.end();
  }, 120_000);

  it('the rows are what mta-sender writes: no send for a bounce or a reset', () => {
    expect(r.resets!.rows).toEqual({ bounce: 15, complaint: 1, deliver: 85 });
    expect(r.oneOne!.rows).toEqual({ bounce: 1, deliver: 1, send: 1 });
    expect(r.fresh!.rows).toEqual({});
    expect(r.mixed!.rows).toEqual({ bounce: 8, complaint: 2, deliver: 192, send: 96 });
    expect(r.spike!.rows).toEqual({ bounce: 6, deliver: 94, send: 94 });
  });

  it('go-no-go: a reset-only sender is judged, one bounce in two is 50 %, a true 4 % warns', () => {
    expect(r.resets!.goNoGo.bounce).toMatchObject({
      severity: 'fail',
      metrics: { bounceRatePct: 15 },
    });
    // Z125: below the auto-pause's minimum sample (100 outcomes) a rate is
    // reported and does not count. The rates are the ones measured before;
    // only the severity of these two thin samples changed.
    expect(r.resets!.goNoGo.complaint).toMatchObject({
      severity: 'info', // 1 / 85 = 1.18 %, over 85 deliveries
      metrics: { sample7d: 85, minSample: 100 },
    });
    expect(r.resets!.goNoGo.complaint.metrics?.complaintRatePct).toBeCloseTo(1.1765, 4);
    expect(r.oneOne!.goNoGo.bounce).toMatchObject({
      severity: 'info',
      metrics: { bounceRatePct: 50, sampleSize: 2, minSample: 100 },
    });
    expect(r.mixed!.goNoGo.bounce).toMatchObject({
      severity: 'warn',
      metrics: { bounceRatePct: 4 },
    });
    // 2 complaints over 192 deliveries in the last 24h: enough volume for the 24h window.
    expect(r.mixed!.goNoGo.complaint.metrics?.window).toBe('24h');
    expect(r.mixed!.goNoGo.complaint.metrics?.complaintRatePct).toBeCloseTo(1.0417, 4);
  });

  it('go-no-go: an org with nothing sent is not blocked for having no history', () => {
    expect(r.fresh!.goNoGo.bounce.severity).toBe('info');
    expect(r.fresh!.goNoGo.complaint.severity).toBe('info');
    expect(r.fresh!.goNoGo.failing.filter((f) => /bounce|complaint/.test(f))).toEqual([]);
  });

  it('campaign stats: 1 bounce and 1 delivery is 50 %, not 100 %', () => {
    expect(r.oneOne!.campaign!.stats).toEqual({
      deliveryRate: 50,
      bounceRate: 50,
      complaintRate: 0,
    });
    expect(r.mixed!.campaign!.stats).toEqual({ deliveryRate: 96, bounceRate: 4, complaintRate: 0 });
    expect(r.spike!.campaign!.stats.bounceRate).toBe(6);
  });

  it('account stats: resets are rated, and the delivery rate never exceeds 100 %', () => {
    expect(r.resets!.account).toEqual({ deliveryRate: 85, bounceRate: 15, complaintRate: 1.18 });
    expect(r.oneOne!.account).toEqual({ deliveryRate: 50, bounceRate: 50, complaintRate: 0 });
    expect(r.fresh!.account).toEqual({ deliveryRate: 0, bounceRate: 0, complaintRate: 0 });
    expect(r.mixed!.account).toEqual({ deliveryRate: 96, bounceRate: 4, complaintRate: 1.04 });
  });

  it('deliverability anomaly detector: 6 bounces in 100 pause the campaign; a true 4 % does not', () => {
    expect(scan.anomalies).toEqual([
      { campaignId: 'spike', reason: 'high_bounce_rate', bounceRatePct: 6, sampleSize: 100 },
    ]);
  });

  it('analytics anomaly alerts: a reset-only spike alerts, a true 4 % bounce rate does not', () => {
    expect(r.resets!.alerts).toEqual([
      { type: 'bounce_rate_spike', severity: 'critical', rate: 0.15 },
      { type: 'complaint_rate_spike', severity: 'critical', rate: 0.0118 },
    ]);
    expect(r.mixed!.alerts).toEqual([
      { type: 'complaint_rate_spike', severity: 'critical', rate: 0.0104 },
    ]);
    expect(r.fresh!.alerts).toEqual([]);
  });

  it('report builder: bounce_rate is bounces over delivery outcomes', () => {
    expect(r.resets!.report).toEqual({ bounce_rate: 0.15, complaint_rate: 0.0118 });
    expect(r.oneOne!.campaign!.report).toEqual({ bounce_rate: 0.5, complaint_rate: 0 });
    expect(r.mixed!.report).toEqual({ bounce_rate: 0.04, complaint_rate: 0.0104 });
    expect(r.mixed!.campaign!.report).toEqual({ bounce_rate: 0.04, complaint_rate: 0 });
  });

  it('superadmin: the complaint rate is complaints over delivered', () => {
    expect(r.resets!.superadmin).toBe(0.0118);
    expect(r.mixed!.superadmin).toBe(0.0104);
    expect(r.fresh!.superadmin).toBe(0);
  });

  it('template performance and the MCP tool: delivered over delivery outcomes', () => {
    expect(r.oneOne!.campaign!.template).toEqual({ deliveryRatePct: 50, bounceRatePct: 50 });
    expect(r.mixed!.campaign!.template).toEqual({ deliveryRatePct: 96, bounceRatePct: 4 });
    expect(r.oneOne!.campaign!.mcp).toBe('delivered   1 (50.0%)');
    expect(r.mixed!.campaign!.mcp).toBe('delivered   96 (96.0%)');
  });
});
