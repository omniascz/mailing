/**
 * An A/B send has two phases, and both of them are counted.
 *
 * The variants go out first; the winning variant goes to the held-back
 * remainder after the test window. Both are batches of one send. Before this,
 * only the first phase existed as far as the counter was concerned — and then
 * only after #74; before that neither phase was counted at all. The winner job
 * marked the campaign `sent` the moment `addBulk` returned, which is precisely
 * the defect the state model removed from the ordinary send path, where `sent`
 * used to mean "queued".
 *
 * So what these pin is: phase one reaching zero does NOT close the campaign,
 * the winner job adds its batches to the same counter, and `sent` waits for the
 * last of those to report in.
 *
 * Real processors, real Postgres, real Redis, real API process.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import { processAbWinner } from '../jobs/ab-winner.js';
import {
  abWinnerQueue,
  batchSenderQueue,
  type CampaignSplitterJobData,
  type AbWinnerJobData,
} from '../queues/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 4, prepare: false });
const API = process.env.API_URL ?? 'http://localhost:3001';
const SECRET = process.env.INTERNAL_API_SECRET!;

/** 100 contacts: 40 + 40 to the variants, 20 held back. One batch each. */
const POOL = 100;

let orgId: string;
let listId: string;
let poolContactIds: string[] = [];
const createdCampaigns: string[] = [];

const VARIANTS_80 = [
  { id: 'a', subject: 'A', content: { blocks: ['A'] }, percentage: 40 },
  { id: 'b', subject: 'B', content: { blocks: ['B'] }, percentage: 40 },
];
const VARIANTS_100 = [
  { id: 'a', subject: 'A', content: { blocks: ['A'] }, percentage: 50 },
  { id: 'b', subject: 'B', content: { blocks: ['B'] }, percentage: 50 },
];

function splitterJob(data: CampaignSplitterJobData): Job<CampaignSplitterJobData> {
  return {
    id: randomUUID(),
    timestamp: Date.now(),
    data,
    log: async () => {},
  } as unknown as Job<CampaignSplitterJobData>;
}

function winnerJob(campaignId: string, nonce = 'w'): Job<AbWinnerJobData> {
  return {
    id: `ab-winner-${nonce}-${campaignId}`,
    timestamp: Date.now(),
    data: { campaignId, orgId },
    log: async () => {},
  } as unknown as Job<AbWinnerJobData>;
}

async function makeCampaign(abConfig: Record<string, unknown> | null): Promise<string> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO campaigns (org_id, name, subject, status, type, list_id, ab_config)
    VALUES (${orgId}, ${'ab2p ' + randomUUID().slice(0, 8)}, 'Two-phase probe',
            'queueing', 'email', ${listId},
            ${abConfig ? sql.json(abConfig as Parameters<typeof sql.json>[0]) : null})
    RETURNING id`;
  createdCampaigns.push(c!.id);
  return c!.id;
}

async function runSplitter(campaignId: string, abConfig: Record<string, unknown> | null) {
  return processCampaignSplitter(
    splitterJob({
      campaignId,
      orgId,
      listId,
      content: { blocks: [] },
      subject: 'Two-phase probe',
      fromName: 'ForgeMsg',
      fromEmail: 'probe@test.local',
      priority: 5,
      ...(abConfig ? { abConfig } : {}),
    } as unknown as CampaignSplitterJobData),
  );
}

async function campaignRow(id: string) {
  const [row] = await sql<
    {
      status: string;
      pending_batches: number | null;
      awaiting_ab_winner: boolean;
      total_sent: number;
      paused_reason: string | null;
    }[]
  >`SELECT status, pending_batches, awaiting_ab_winner, total_sent, paused_reason
      FROM campaigns WHERE id = ${id}`;
  return row!;
}

async function batchJobsFor(campaignId: string) {
  const jobs = await batchSenderQueue.getJobs(
    ['waiting', 'prioritized', 'delayed', 'active'],
    0,
    10_000,
  );
  return jobs.filter((j) => j.data?.campaignId === campaignId);
}

async function winnerJobsFor(campaignId: string) {
  const jobs = await abWinnerQueue.getJobs(
    ['waiting', 'delayed', 'prioritized', 'active', 'paused'],
    0,
    2000,
  );
  return jobs.filter((j) => j.data?.campaignId === campaignId);
}

/** Report one batch finished, the way batch-sender does when its job ends. */
async function reportBatch(
  campaignId: string,
  dispatchId: string,
  batchKey: string,
  sent: number,
): Promise<{ counted: boolean; closed: string | null; phase?: string; pending: number | null }> {
  const res = await fetch(`${API}/api/v1/internal/campaigns/${campaignId}/batch-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': SECRET },
    body: JSON.stringify({ orgId, dispatchId, batchKey, sent, skipped: 0 }),
  });
  if (!res.ok) throw new Error(`batch-complete → ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    data: { counted: boolean; closed: string | null; phase?: string; pending: number | null };
  };
  return body.data;
}

/** Report every batch currently queued for a campaign, then drop the jobs. */
async function reportAllQueued(campaignId: string, sentPerBatch: (n: number) => number) {
  const jobs = await batchJobsFor(campaignId);
  const results = [];
  for (const j of jobs) {
    results.push(
      await reportBatch(
        campaignId,
        j.data.dispatchId,
        j.data.batchKey,
        sentPerBatch(j.data.contactIds.length),
      ),
    );
    await j.remove().catch(() => {});
  }
  return results;
}

async function recordSends(campaignId: string, variantId: string, contactIds: string[]) {
  if (contactIds.length === 0) return;
  await sql`
    INSERT INTO email_events (org_id, campaign_id, contact_id, event_type, ab_variant_id)
    SELECT ${orgId}::uuid, ${campaignId}::uuid, c, 'send', ${variantId}
      FROM unnest(${contactIds}::uuid[]) AS c`;
}

async function recordClicks(campaignId: string, contactIds: string[]) {
  if (contactIds.length === 0) return;
  await sql`
    INSERT INTO email_events (org_id, campaign_id, contact_id, event_type)
    SELECT ${orgId}::uuid, ${campaignId}::uuid, c, 'click'
      FROM unnest(${contactIds}::uuid[]) AS c`;
}

/** A decisive result: variant B clearly ahead, comfortably past 95% confidence. */
async function makeDecisive(campaignId: string) {
  const all = poolContactIds.slice(0, 80);
  await recordSends(campaignId, 'a', all.slice(0, 40));
  await recordSends(campaignId, 'b', all.slice(40, 80));
  await recordClicks(campaignId, all.slice(40, 78));
  await recordClicks(campaignId, all.slice(0, 1));
}

describe('an A/B send is counted in two phases (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1`;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    const tag = randomUUID().slice(0, 8);
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${orgId}, ${'ab2p ' + tag}) RETURNING id`;
    listId = list!.id;

    const emails = Array.from({ length: POOL }, (_, i) => `ab2p-${tag}-${i}@test.local`);
    const ids = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, status)
      SELECT ${orgId}::uuid, e, 'active' FROM unnest(${emails}::text[]) AS e
      RETURNING id`;
    poolContactIds = ids.map((r) => r.id);
    await sql`
      INSERT INTO contact_lists (contact_id, list_id)
      SELECT c, ${listId}::uuid FROM unnest(${poolContactIds}::uuid[]) AS c`;
  }, 120_000);

  afterAll(async () => {
    for (const id of createdCampaigns) {
      for (const j of await batchJobsFor(id)) await j.remove().catch(() => {});
      for (const j of await winnerJobsFor(id)) await j.remove().catch(() => {});
    }
    await sql.end();
    await abWinnerQueue.close();
    await batchSenderQueue.close();
  }, 60_000);

  // ── (a) phase one finishing is not the end ────────────────────────────────

  it('phase one reaching zero does not close the campaign — it waits for the winner', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);

    const armed = await campaignRow(campaignId);
    expect(armed.pending_batches).toBe(2);
    expect(armed.awaiting_ab_winner).toBe(true);

    const results = await reportAllQueued(campaignId, (n) => n);
    const last = results[results.length - 1]!;

    // Zero reached, and deliberately not a closure.
    expect(last.pending).toBe(0);
    expect(last.closed).toBeNull();
    expect(last.phase).toBe('variants_done');

    const waiting = await campaignRow(campaignId);
    expect(waiting.status).toBe('sending');
    expect(waiting.pending_batches).toBe(0);
    expect(waiting.awaiting_ab_winner).toBe(true);
  }, 120_000);

  // ── (b) the winner job arms phase two; the last batch closes it ───────────

  it('the winner job adds its batches, and sent waits for the last of them', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);
    await reportAllQueued(campaignId, (n) => n);
    await makeDecisive(campaignId);

    const outcome = await processAbWinner(winnerJob(campaignId));
    expect(outcome.dispatched).toBe(20);

    // The counter was raised for the holdback, and the campaign is STILL
    // sending — this is the assertion the old code failed, because it wrote
    // `sent` the moment addBulk returned.
    const queued = await campaignRow(campaignId);
    expect(queued.status).toBe('sending');
    expect(queued.pending_batches).toBe(1);
    expect(queued.awaiting_ab_winner).toBe(false);

    const results = await reportAllQueued(campaignId, (n) => n);
    expect(results[results.length - 1]!.closed).toBe('sent');

    const closed = await campaignRow(campaignId);
    expect(closed.status).toBe('sent');
    // 80 from the variants plus 20 from the holdback: the total is taken over
    // the campaign, not over the dispatch that happened to close it.
    expect(closed.total_sent).toBe(100);
    expect(closed.pending_batches).toBeNull();
  }, 120_000);

  // ── (c) a replayed winner job must not add phase two twice ────────────────

  it('a replayed winner job does not add the holdback batches a second time', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);
    await reportAllQueued(campaignId, (n) => n);
    await makeDecisive(campaignId);

    await processAbWinner(winnerJob(campaignId));
    const afterFirst = await campaignRow(campaignId);
    expect(afterFirst.pending_batches).toBe(1);
    expect(afterFirst.awaiting_ab_winner).toBe(false);

    // The same job again — a BullMQ retry after addBulk had already returned.
    const replay = await processAbWinner(winnerJob(campaignId));
    expect(replay.dispatched).toBe(0);

    // Still one. A second add would leave a counter the batches can never take
    // to zero, and the campaign would never close.
    const afterReplay = await campaignRow(campaignId);
    expect(afterReplay.pending_batches).toBe(1);
    expect(afterReplay.status).toBe('sending');

    // And it still closes on the one batch that is genuinely outstanding.
    await reportAllQueued(campaignId, (n) => n);
    expect((await campaignRow(campaignId)).status).toBe('sent');
  }, 120_000);

  it('a winner job that died before marking dispatched re-arms nothing on its retry', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);
    await reportAllQueued(campaignId, (n) => n);
    await makeDecisive(campaignId);

    await processAbWinner(winnerJob(campaignId));
    expect((await campaignRow(campaignId)).pending_batches).toBe(1);

    // The narrow window the compare-and-swap exists for. `auto_send_dispatched`
    // is what makes the replay branch above short-circuit — so a run that armed
    // the counter and enqueued the batches but died BEFORE marking the result
    // dispatched comes back through the full path and reaches the arming call a
    // second time. Only the flag stops it adding the holdback's batches again.
    await sql`
      UPDATE ab_test_results SET auto_send_dispatched = false WHERE campaign_id = ${campaignId}`;

    await processAbWinner(winnerJob(campaignId, 'retry'));

    expect((await campaignRow(campaignId)).pending_batches).toBe(1);

    await reportAllQueued(campaignId, (n) => n);
    expect((await campaignRow(campaignId)).status).toBe('sent');
  }, 120_000);

  // ── (d) a holdback batch that fails for good still decrements ─────────────

  it('a holdback batch that gives up for good still decrements the counter', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);
    await reportAllQueued(campaignId, (n) => n);
    await makeDecisive(campaignId);
    await processAbWinner(winnerJob(campaignId));

    // sent: 0 — the batch reporting that it sent nothing at all, which is what
    // batch-sender does when it exhausts its retries.
    const results = await reportAllQueued(campaignId, () => 0);
    expect(results[results.length - 1]!.counted).toBe(true);

    const closed = await campaignRow(campaignId);
    // Closed, not stuck. And `sent`, not `failed`: the variants reached 80
    // people, and only the holdback failed.
    expect(closed.status).toBe('sent');
    expect(closed.total_sent).toBe(80);
  }, 120_000);

  // ── (e) every batch of both phases fails ──────────────────────────────────

  it('a send where nothing at all was delivered closes as failed', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);
    // Both variant batches give up without sending anything.
    await reportAllQueued(campaignId, () => 0);
    expect((await campaignRow(campaignId)).status).toBe('sending');

    // The events are recorded separately from what the batches reported, so the
    // winner can still be computed — a batch reporting zero sent is about the
    // dispatch, not about the test data.
    await makeDecisive(campaignId);
    await processAbWinner(winnerJob(campaignId));
    await reportAllQueued(campaignId, () => 0);

    const closed = await campaignRow(campaignId);
    expect(closed.status).toBe('failed');
    expect(closed.total_sent).toBe(0);
  }, 120_000);

  // ── (f) regression: the single-phase A/B test from #74 ────────────────────

  it('an A/B test with no holdback still closes on its own last batch', async () => {
    const cfg = { variants: VARIANTS_100, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);

    const armed = await campaignRow(campaignId);
    expect(armed.pending_batches).toBe(2);
    // No second phase is coming, so nothing is being waited for.
    expect(armed.awaiting_ab_winner).toBe(false);
    expect(await winnerJobsFor(campaignId)).toHaveLength(0);

    const results = await reportAllQueued(campaignId, (n) => n);
    expect(results[results.length - 1]!.closed).toBe('sent');
    expect((await campaignRow(campaignId)).total_sent).toBe(100);
  }, 120_000);

  // ── (g) regression: an ordinary campaign ──────────────────────────────────

  it('a campaign with no ab_config behaves exactly as before', async () => {
    const campaignId = await makeCampaign(null);

    const result = await runSplitter(campaignId, null);
    expect(result.batches).toBe(1);

    const armed = await campaignRow(campaignId);
    expect(armed.pending_batches).toBe(1);
    expect(armed.awaiting_ab_winner).toBe(false);
    expect(armed.status).toBe('sending');

    const results = await reportAllQueued(campaignId, (n) => n);
    expect(results[0]!.closed).toBe('sent');

    const closed = await campaignRow(campaignId);
    expect(closed.status).toBe('sent');
    expect(closed.total_sent).toBe(100);
    expect(closed.pending_batches).toBeNull();
  }, 120_000);
});
