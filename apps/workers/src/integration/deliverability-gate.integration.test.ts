/**
 * The pre-send verdict is enforced where a campaign enters sending, with a
 * minimum sample for the criteria that judge history.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 *
 * The go/no-go panel was advisory: only GET /campaigns/:id/pre-send-checks and
 * the MCP tool read it. A campaign with a no-go verdict was sent like any
 * other (measured: HTTP 200, a splitter job). And the verdict could not have
 * been enforced as it stood:
 *  - 'audience-empty' read campaigns.estimated_recipients, which nothing
 *    writes, so every campaign failed it;
 *  - 'unsubscribe-link' read the stored blocks, while the renderer attaches the
 *    opt-out footer to every marketing message, so block campaigns without a
 *    link in their blocks failed it and left with one;
 *  - the bounce and complaint rates had no minimum sample: 1 bounce in 2
 *    messages was a 50 % bounce rate and a fail.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * Organisations whose history is written by the real mta-sender against a
 * stub engine (250 or 550), sending campaigns through the real API:
 *
 *   fresh    nothing sent                          go         → sent
 *   oneOne   campaign of 2, 1 bounced              go (2/100) → sent
 *   bad      100 resets, 15 bounced                no-go      → 422 with the numbers
 *                                                   + ack      → sent, override recorded
 *   warn     100 resets, 3 bounced                 caution    → sent, verdict recorded
 *   turns    healthy when scheduled, 15 % by the time the cron runs
 *
 * The bad organisation's transactional mail and flow mail still go: the gate
 * is on the campaign path only. A scheduled campaign meets the same gate as an
 * immediate one — at POST /schedule and again when the cron dispatches it.
 *
 * WHAT THIS FILE CANNOT SEE
 * - The Go engine and SMTP; the web UI (no page sends the acknowledgement yet).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Job, JobType, Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { loginAsSeedUser } from './setup/login.js';
import { readSeedOrg } from './setup/seed-org.js';
import { processMtaSend } from '../jobs/mta-sender.js';
import { processBatchSender } from '../jobs/batch-sender.js';
import {
  batchSenderQueues,
  campaignSplitterQueue,
  mtaQueues,
  type BatchSenderJobData,
  type CampaignSplitterJobData,
  type MtaSendJobData,
} from '../queues/index.js';

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
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET!;
const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

/** This file's own bucket in the API's limiters. */
const RATE_LIMIT_BUCKET = `integration-deliverability-gate-${randomUUID()}`;
const tag = randomUUID().slice(0, 8);
const ALL: JobType[] = ['waiting', 'prioritized', 'delayed', 'paused', 'active', 'completed'];

/** Block content the renderer recognises: it gets the opt-out footer. */
const CONTENT = {
  blocks: [
    {
      id: 'g1',
      type: 'text',
      content: '<p>Dobrý den, máme novinky.</p>',
      fontSize: '15px',
      fontFamily: 'Arial',
      color: '#111827',
      lineHeight: '1.5',
      textAlign: 'left',
    },
  ],
  globalStyles: {
    backgroundColor: '#fff',
    contentBackgroundColor: '#fff',
    fontFamily: 'Arial',
    linkColor: '#00f',
    textColor: '#000',
    contentWidth: 600,
  },
  plainText: 'Dobrý den, máme novinky.',
};

let token: string;
let userId: string;
const orgs: string[] = [];

async function call(method: string, path: string, bearer: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
      'x-api-key': RATE_LIMIT_BUCKET,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

interface Org {
  id: string;
  token: string;
  name: string;
  domain: string;
  listId: string;
}

/** An organisation that is set up right: production mode, authenticated domain, a list. */
async function makeOrg(name: string): Promise<Org> {
  const [o] = await sql<{ id: string }[]>`
    INSERT INTO organizations (name, slug, sending_mode)
    VALUES (${`gate ${name} ${tag}`}, ${`gate-${name}-${tag}`}, 'production') RETURNING id
  `;
  orgs.push(o!.id);
  await sql`
    INSERT INTO organization_members (org_id, user_id, email, role, status)
    SELECT ${o!.id}, id, email, 'owner', 'active' FROM users WHERE id = ${userId}
  `;
  const domain = `gate-${name}-${tag}.test`.toLowerCase();
  await sql`
    INSERT INTO sending_domains (org_id, domain, dkim_selector, is_verified, dkim_verified, spf_verified, dmarc_verified)
    VALUES (${o!.id}, ${domain}, 'fm1', true, true, true, true)
  `;
  const [l] = await sql<{ id: string }[]>`
    INSERT INTO lists (org_id, name) VALUES (${o!.id}, ${`gate ${name} ${tag}`}) RETURNING id
  `;
  for (const i of [1, 2]) {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, status)
      VALUES (${o!.id}, ${`gate-${name}-${i}-${tag}@test.local`}, 'active') RETURNING id
    `;
    await sql`INSERT INTO contact_lists (contact_id, list_id) VALUES (${c!.id}, ${l!.id})`;
  }
  const sw = await call('POST', '/api/v1/me/orgs/switch', token, { orgId: o!.id });
  expect(sw.status, JSON.stringify(sw.body)).toBe(200);
  return {
    id: o!.id,
    token: (sw.body.data as { token: string }).token,
    name,
    domain,
    listId: l!.id,
  };
}

async function campaign(o: Org, label: string): Promise<string> {
  const subject = `Novinky ${label} ${tag}`;
  const res = await call('POST', '/api/v1/campaigns', o.token, {
    name: `gate ${label} ${tag}`,
    subject,
    fromName: 'Obchod',
    fromEmail: `noreply@${o.domain}`,
    listId: o.listId,
    content: { subject, ...CONTENT },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body.data as { id: string }).id;
}

/** History through the real mta-sender: `n` messages, the first `bouncing` answered 550. */
async function history(o: Org, n: number, bouncing: number, kind: 'reset' | 'campaign') {
  let campaignId = o.id;
  if (kind === 'campaign') {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO campaigns (org_id, name) VALUES (${o.id}, ${`gate history ${tag}`}) RETURNING id
    `;
    campaignId = c!.id;
  }
  for (let i = 0; i < n; i++) {
    const to = `gate-h-${o.name}-${i}-${randomUUID().slice(0, 6)}@test.local`;
    if (i < bouncing) engine.bounce.add(to);
    let contactId: string = randomUUID();
    if (kind === 'campaign') {
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contacts (org_id, email, status) VALUES (${o.id}, ${to}, 'active') RETURNING id
      `;
      contactId = c!.id;
    }
    await processMtaSend({
      id: `gate-${randomUUID()}`,
      data: {
        campaignId,
        orgId: o.id,
        contactId,
        messageId: `<gate-${randomUUID()}@forgemsg>`,
        fromEmail: `noreply@${o.domain}`,
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
      } as unknown as MtaSendJobData,
      opts: { attempts: 1 },
      attemptsMade: 0,
      log: async () => {},
    } as unknown as Job<MtaSendJobData>);
    engine.bounce.delete(to);
  }
}

async function jobIds(q: Queue): Promise<Set<string>> {
  return new Set((await q.getJobs(ALL, 0, 5_000)).map((j) => String(j?.id)));
}

interface Attempt {
  http: number;
  status: string;
  splitterJobs: number;
  code?: string;
  message?: string;
  blocking?: Array<{ id: string; metrics?: Record<string, number | string> }>;
  records: Array<{ action: string; via: string; verdict: string; blocking: string[] }>;
}

async function records(campaignId: string): Promise<Attempt['records']> {
  const rows = await sql<{ action: string; metadata: Record<string, unknown> }[]>`
    SELECT action, metadata FROM audit_logs
    WHERE resource = 'campaign' AND resource_id = ${campaignId}
      AND action = ANY(${['campaign.deliverability_blocked', 'campaign.deliverability_override', 'campaign.deliverability_caution']})
    ORDER BY created_at
  `;
  return rows.map((r) => ({
    action: r.action,
    via: String(r.metadata.via),
    verdict: String(r.metadata.verdict),
    blocking: ((r.metadata.blocking as Array<{ id: string }>) ?? []).map((b) => b.id),
  }));
}

async function send(o: Org, campaignId: string, body?: unknown): Promise<Attempt> {
  const q = campaignSplitterQueue as unknown as Queue;
  const before = await jobIds(q);
  const res = await call('POST', `/api/v1/campaigns/${campaignId}/send`, o.token, body);
  const split = (await q.getJobs(ALL, 0, 5_000)).filter(
    (j) =>
      j &&
      !before.has(String(j.id)) &&
      (j.data as CampaignSplitterJobData).campaignId === campaignId,
  );
  const [row] = await sql<
    { status: string }[]
  >`SELECT status FROM campaigns WHERE id = ${campaignId}`;
  const details = res.body.details as { blocking?: Attempt['blocking'] } | undefined;
  return {
    http: res.status,
    status: row!.status,
    splitterJobs: split.length,
    ...(res.status === 200
      ? {}
      : {
          code: String(res.body.code),
          message: String(res.body.message),
          blocking: details?.blocking?.map((b) => ({ id: b.id, metrics: b.metrics })),
        }),
    records: await records(campaignId),
  };
}

async function bounceCheck(o: Org, campaignId: string) {
  const r = await call('GET', `/api/v1/campaigns/${campaignId}/pre-send-checks`, o.token);
  const d = r.body.data as {
    verdict: string;
    checks: Array<{ id: string; severity: string; title: string; metrics?: object }>;
  };
  const b = d.checks.find((c) => c.id === 'bounce-rate')!;
  return {
    verdict: d.verdict,
    bounce: { severity: b.severity, title: b.title, metrics: b.metrics },
  };
}

const o: Record<string, Org> = {};
const out: Record<string, unknown> = {};

describe('the pre-send verdict is enforced at the send (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const seed = await readSeedOrg(sql);
    token = await loginAsSeedUser(API, 'deliverability-gate');
    const [u] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = 'demo@acme.test' AND org_id = ${seed.id}
    `;
    userId = u!.id;
    for (const name of ['fresh', 'oneOne', 'bad', 'warn', 'turns']) o[name] = await makeOrg(name);
    await history(o.oneOne!, 2, 1, 'campaign');
    await history(o.bad!, 100, 15, 'reset');
    await history(o.warn!, 100, 3, 'reset');
  }, 300_000);

  afterAll(async () => {
    if (orgs.length) {
      await sql`DELETE FROM audit_logs WHERE org_id = ANY(${orgs})`;
      await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
    }
    await sql.end();
  }, 120_000);

  it('a new organisation with no history: go, and the campaign is sent', async () => {
    const id = await campaign(o.fresh!, 'fresh');
    const check = await bounceCheck(o.fresh!, id);
    const sent = await send(o.fresh!, id);
    out.fresh = { check, sent };
    console.log(`[z125] fresh: ${JSON.stringify(out.fresh)}`);
    expect(check.verdict).toBe('go');
    expect(check.bounce.severity).toBe('info');
    expect(sent).toMatchObject({ http: 200, status: 'queueing', splitterJobs: 1, records: [] });
  });

  it('1 bounce in 2 messages does not block: the sample is reported, the campaign is sent', async () => {
    const id = await campaign(o.oneOne!, 'oneone');
    const check = await bounceCheck(o.oneOne!, id);
    const sent = await send(o.oneOne!, id);
    out.oneOne = { check, sent };
    console.log(`[z125] oneOne: ${JSON.stringify(out.oneOne)}`);
    expect(check.bounce).toMatchObject({
      severity: 'info',
      metrics: { sampleSize: 2, minSample: 100 },
    });
    expect(sent).toMatchObject({ http: 200, status: 'queueing', splitterJobs: 1 });
  });

  it('a bad organisation with enough history: 422, naming the criterion and its numbers', async () => {
    const id = await campaign(o.bad!, 'bad');
    const sent = await send(o.bad!, id);
    out.bad = sent;
    console.log(`[z125] bad: ${JSON.stringify(sent)}`);
    expect(sent).toMatchObject({
      http: 422,
      code: 'DELIVERABILITY_NO_GO',
      status: 'draft',
      splitterJobs: 0,
    });
    expect(sent.message).toContain('bounce-rate');
    expect(sent.message).toContain('bounceRatePct=15');
    expect(sent.message).toContain('sampleSize=100');
    expect(sent.message).toContain('acknowledgeDeliverabilityRisk');
    expect(sent.blocking).toContainEqual({
      id: 'bounce-rate',
      metrics: { bounceRatePct: 15, thresholdPct: 5, sampleSize: 100, minSample: 100 },
    });
    expect(sent.records).toEqual([
      {
        action: 'campaign.deliverability_blocked',
        via: 'send',
        verdict: 'no-go',
        blocking: ['bounce-rate'],
      },
    ]);
  });

  it('the same campaign, acknowledged: sent, and the override is recorded with its verdict', async () => {
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM campaigns WHERE org_id = ${o.bad!.id} AND name = ${`gate bad ${tag}`}
    `;
    const id = row!.id;
    const sent = await send(o.bad!, id, { acknowledgeDeliverabilityRisk: true });
    out.badAck = sent;
    console.log(`[z125] bad + ack: ${JSON.stringify(sent)}`);
    expect(sent).toMatchObject({ http: 200, status: 'queueing', splitterJobs: 1 });
    expect(sent.records.at(-1)).toEqual({
      action: 'campaign.deliverability_override',
      via: 'send',
      verdict: 'no-go',
      blocking: ['bounce-rate'],
    });
  });

  it('a warning lets the campaign through and records the verdict', async () => {
    const id = await campaign(o.warn!, 'warn');
    const check = await bounceCheck(o.warn!, id);
    const sent = await send(o.warn!, id);
    out.warn = { check, sent };
    console.log(`[z125] warn: ${JSON.stringify(out.warn)}`);
    expect(check).toMatchObject({ verdict: 'caution', bounce: { severity: 'warn' } });
    expect(sent).toMatchObject({ http: 200, status: 'queueing', splitterJobs: 1 });
    expect(sent.records).toEqual([
      { action: 'campaign.deliverability_caution', via: 'send', verdict: 'caution', blocking: [] },
    ]);
  });

  it("the bad organisation's transactional mail and flow mail still go", async () => {
    // Transactional: the API's /emails route, then the MTA job it queued.
    const txTo = `gate-tx-${tag}@test.local`;
    const tx = await call('POST', '/api/v1/emails', o.bad!.token, {
      from: `noreply@${o.bad!.domain}`,
      to: txTo,
      subject: 'Vaše objednávka',
      html: '<p>Děkujeme.</p>',
    });
    const txJobs = (
      await Promise.all(
        Object.values(mtaQueues).map((q) => (q as unknown as Queue).getJobs(ALL, 0, 5_000)),
      )
    )
      .flat()
      .filter((j) => (j?.data as MtaSendJobData | undefined)?.toEmail === txTo);

    // Flow: the workflow engine's send-email call, then its batch.
    const [flowContact] = await sql<{ id: string; email: string }[]>`
      INSERT INTO contacts (org_id, email, status)
      VALUES (${o.bad!.id}, ${`gate-flow-${tag}@test.local`}, 'active') RETURNING id, email
    `;
    const [tpl] = await sql<{ id: string }[]>`
      INSERT INTO templates (org_id, name, subject, preheader, blocks, global_styles, locale)
      VALUES (${o.bad!.id}, ${`gate flow ${tag}`}, 'Novinky z flow', '',
        ${sql.json(CONTENT.blocks)}, ${sql.json(CONTENT.globalStyles)}, 'cs')
      RETURNING id
    `;
    const triggered = batchSenderQueues.triggered as unknown as Queue;
    const beforeBatch = await jobIds(triggered);
    const flow = await fetch(`${API}/api/v1/internal/workflow/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({
        orgId: o.bad!.id,
        contactId: flowContact!.id,
        templateId: tpl!.id,
        mergeData: {},
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const flowBody = (await flow.json()) as { data?: { queued?: boolean } };
    const batches = (await triggered.getJobs(ALL, 0, 5_000))
      .filter((j) => j && !beforeBatch.has(String(j.id)))
      .map((j) => j.data as BatchSenderJobData)
      .filter((d) => d.orgId === o.bad!.id);
    const otherQ = mtaQueues.other as unknown as Queue;
    const beforeMta = await jobIds(otherQ);
    for (const b of batches) {
      await processBatchSender({
        id: `gate-b-${randomUUID()}`,
        timestamp: Date.now(),
        data: b,
        log: async () => {},
      } as unknown as Job<BatchSenderJobData>);
    }
    const flowMta = (await otherQ.getJobs(ALL, 0, 5_000)).filter(
      (j) =>
        j &&
        !beforeMta.has(String(j.id)) &&
        (j.data as MtaSendJobData).toEmail === flowContact!.email,
    );

    out.bypass = {
      transactional: { http: tx.status, mtaJobs: txJobs.length },
      flow: {
        http: flow.status,
        queued: flowBody.data?.queued,
        batches: batches.length,
        mtaJobs: flowMta.length,
      },
    };
    console.log(`[z125] bad org, not campaigns: ${JSON.stringify(out.bypass)}`);
    expect(tx.status).toBe(200);
    expect(txJobs.length).toBe(1);
    expect(flowBody.data?.queued).toBe(true);
    expect(flowMta.length).toBe(1);
  });

  it('a scheduled campaign meets the same gate: at /schedule, and again when the cron sends it', async () => {
    const soon = () => new Date(Date.now() + 2_500).toISOString();
    const dispatch = () =>
      fetch(`${API}/api/v1/internal/campaigns/dispatch-scheduled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: '{}',
        signal: AbortSignal.timeout(60_000),
      }).then(async (r) => ({ http: r.status, body: await r.json() }));
    const status = async (id: string) =>
      (await sql<{ status: string }[]>`SELECT status FROM campaigns WHERE id = ${id}`)[0]!.status;

    // Bad organisation, no acknowledgement: refused at the click, like /send.
    const refusedId = await campaign(o.bad!, 'sched-refused');
    const refused = await call('POST', `/api/v1/campaigns/${refusedId}/schedule`, o.bad!.token, {
      scheduledAt: soon(),
    });

    // Bad organisation, acknowledged at /schedule: the cron sends it.
    const ackId = await campaign(o.bad!, 'sched-ack');
    const ack = await call('POST', `/api/v1/campaigns/${ackId}/schedule`, o.bad!.token, {
      scheduledAt: soon(),
      acknowledgeDeliverabilityRisk: true,
    });

    // Healthy when scheduled, bad by the time it is due: the cron refuses it
    // and hands it back as a draft.
    const turnsId = await campaign(o.turns!, 'sched-turns');
    const turnsScheduled = await call(
      'POST',
      `/api/v1/campaigns/${turnsId}/schedule`,
      o.turns!.token,
      { scheduledAt: soon() },
    );
    await history(o.turns!, 100, 15, 'reset');

    await new Promise((r) => setTimeout(r, 3_000));
    const q = campaignSplitterQueue as unknown as Queue;
    const before = await jobIds(q);
    const cron = await dispatch();
    const split = (await q.getJobs(ALL, 0, 5_000))
      .filter((j) => j && !before.has(String(j.id)))
      .map((j) => (j.data as CampaignSplitterJobData).campaignId);

    out.scheduled = {
      refused: {
        http: refused.status,
        code: refused.body.code,
        message: String(refused.body.message).slice(0, 160),
        status: await status(refusedId),
        records: await records(refusedId),
      },
      ack: {
        http: ack.status,
        status: await status(ackId),
        dispatched: split.includes(ackId),
        records: await records(ackId),
      },
      turns: {
        scheduledHttp: turnsScheduled.status,
        status: await status(turnsId),
        dispatched: split.includes(turnsId),
        records: await records(turnsId),
      },
      cron: { http: cron.http, blocked: (cron.body as { data: { blocked: number } }).data.blocked },
    };
    console.log(`[z125] scheduled: ${JSON.stringify(out.scheduled)}`);

    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('DELIVERABILITY_NO_GO');
    expect(String(refused.body.message)).toContain('bounceRatePct=15');
    expect(await status(refusedId)).toBe('draft');

    expect(ack.status).toBe(200);
    expect(split).toContain(ackId);
    expect(await status(ackId)).toBe('queueing');
    expect((await records(ackId)).map((r) => `${r.action}/${r.via}`)).toEqual([
      'campaign.deliverability_override/schedule',
      'campaign.deliverability_override/scheduled-dispatch',
    ]);

    expect(turnsScheduled.status).toBe(200);
    expect(split).not.toContain(turnsId);
    expect(await status(turnsId)).toBe('draft');
    expect(await records(turnsId)).toEqual([
      {
        action: 'campaign.deliverability_blocked',
        via: 'scheduled-dispatch',
        verdict: 'no-go',
        blocking: ['bounce-rate'],
      },
    ]);
  }, 120_000);
});
