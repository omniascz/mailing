/**
 * An A/B campaign always reaches an end state.
 *
 * An A/B campaign arms no batch counter — its variants are only the first phase
 * of the send, so a counter reaching zero would declare it sent while the
 * holdback was still waiting — and the dispatch reaper skips campaigns without
 * a counter. The winner job is therefore the only thing that can close one, and
 * every path where that job was never scheduled, or returned without writing a
 * status, left the campaign in `sending` with nothing that could ever move it.
 *
 * Measured against a live database before any of this changed: an A/B campaign
 * with a 20% holdback and `autoSendWinner: false` came out of the real splitter
 * as `sending` / pending_batches NULL / zero winner jobs / zero holdback rows,
 * and the reaper still would not take it with its row aged 48 hours.
 *
 * These tests drive the real processors against a real Postgres, a real Redis
 * and a real API process, and read the campaign row back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import { processAbWinner, startAbWinnerWorker } from '../jobs/ab-winner.js';
import {
  abWinnerQueue,
  batchSenderQueue,
  type CampaignSplitterJobData,
  type AbWinnerJobData,
} from '../queues/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 4, prepare: false });
const API = process.env.API_URL ?? 'http://localhost:3001';
const SECRET = process.env.INTERNAL_API_SECRET!;

/** Contacts per campaign. One batch per variant at BATCH_SIZE 1000. */
const POOL = 100;

let orgId: string;
let listId: string;
const createdCampaigns: string[] = [];

interface Variant {
  id: string;
  subject: string;
  content: Record<string, unknown>;
  percentage: number;
}

const VARIANTS_80: Variant[] = [
  { id: 'a', subject: 'A', content: { blocks: ['A'] }, percentage: 40 },
  { id: 'b', subject: 'B', content: { blocks: ['B'] }, percentage: 40 },
];
const VARIANTS_100: Variant[] = [
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

function winnerJob(data: AbWinnerJobData): Job<AbWinnerJobData> {
  return {
    id: `ab-winner-${data.campaignId}`,
    timestamp: Date.now(),
    data,
    log: async () => {},
  } as unknown as Job<AbWinnerJobData>;
}

/**
 * A campaign in `queueing` — exactly where sendCampaign() leaves one before the
 * splitter runs. Starting anywhere else makes the splitter's status PATCH a
 * refused transition and the test would measure that instead.
 */
async function makeCampaign(abConfig: Record<string, unknown>): Promise<string> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO campaigns (org_id, name, subject, status, type, list_id, ab_config)
    VALUES (${orgId}, ${'ab-closes ' + randomUUID().slice(0, 8)}, 'A/B closing probe',
            'queueing', 'email', ${listId},
            ${sql.json(abConfig as Parameters<typeof sql.json>[0])})
    RETURNING id`;
  createdCampaigns.push(c!.id);
  return c!.id;
}

async function runSplitter(campaignId: string, abConfig: Record<string, unknown>) {
  return processCampaignSplitter(
    splitterJob({
      campaignId,
      orgId,
      listId,
      content: { blocks: [] },
      subject: 'A/B closing probe',
      fromName: 'ForgeMsg',
      fromEmail: 'probe@test.local',
      priority: 5,
      abConfig,
    } as unknown as CampaignSplitterJobData),
  );
}

async function campaignRow(id: string) {
  const [row] = await sql<
    {
      status: string;
      pending_batches: number | null;
      paused_reason: string | null;
      total_sent: number;
    }[]
  >`SELECT status, pending_batches, paused_reason, total_sent FROM campaigns WHERE id = ${id}`;
  return row!;
}

async function winnerJobsFor(campaignId: string) {
  const jobs = await abWinnerQueue.getJobs(
    ['waiting', 'delayed', 'prioritized', 'active', 'paused'],
    0,
    2000,
  );
  return jobs.filter((j) => j.data?.campaignId === campaignId);
}

/** Batch jobs this campaign put on the queue, in enqueue order. */
async function batchJobsFor(campaignId: string) {
  const jobs = await batchSenderQueue.getJobs(
    ['waiting', 'prioritized', 'delayed', 'active'],
    0,
    10_000,
  );
  return jobs.filter((j) => j.data?.campaignId === campaignId);
}

/**
 * Poll until `probe` returns something, or give up. Used for the cases driven
 * through a real Worker, where the closing write happens on BullMQ's schedule
 * rather than on the test's.
 */
async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = await probe();
    if (hit !== null) return hit;
    if (Date.now() > deadline) throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Report a batch finished, the way batch-sender does when its job ends. */
async function reportBatch(
  campaignId: string,
  dispatchId: string,
  batchKey: string,
  sent: number,
) {
  const res = await fetch(`${API}/api/v1/internal/campaigns/${campaignId}/batch-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': SECRET },
    body: JSON.stringify({ orgId, dispatchId, batchKey, sent, skipped: 0 }),
  });
  if (!res.ok) throw new Error(`batch-complete → ${res.status} ${await res.text()}`);
  return (await res.json()) as { data: { counted: boolean; closed: string | null } };
}

/** Give every contact of a variant a `send` row, so the test has data to judge. */
async function recordSends(campaignId: string, variantId: string, contactIds: string[]) {
  if (contactIds.length === 0) return;
  await sql`
    INSERT INTO email_events (org_id, campaign_id, contact_id, event_type, ab_variant_id)
    SELECT ${orgId}::uuid, ${campaignId}::uuid, c, 'send', ${variantId}
      FROM unnest(${contactIds}::uuid[]) AS c`;
}

async function recordOpens(campaignId: string, contactIds: string[]) {
  if (contactIds.length === 0) return;
  await sql`
    INSERT INTO email_events (org_id, campaign_id, contact_id, event_type)
    SELECT ${orgId}::uuid, ${campaignId}::uuid, c, 'click'
      FROM unnest(${contactIds}::uuid[]) AS c`;
}

describe('an A/B campaign always reaches an end state (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1`;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    const tag = randomUUID().slice(0, 8);
    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name) VALUES (${orgId}, ${'ab-closes ' + tag}) RETURNING id`;
    listId = list!.id;

    // Inserted with explicit column lists rather than postgres.js's
    // `sql(arrayOfObjects)` helper. That helper builds the identifiers at
    // runtime, which puts the statement in sql-explain's unanalysable bucket —
    // a budget for raw SQL the guard cannot check, and not one a test fixture
    // should be spending.
    const emails = Array.from({ length: POOL }, (_, i) => `abc-${tag}-${i}@test.local`);
    const ids = await sql<{ id: string }[]>`
      INSERT INTO contacts (org_id, email, status)
      SELECT ${orgId}::uuid, e, 'active' FROM unnest(${emails}::text[]) AS e
      RETURNING id`;
    await sql`
      INSERT INTO contact_lists (contact_id, list_id)
      SELECT c, ${listId}::uuid FROM unnest(${ids.map((r) => r.id)}::uuid[]) AS c`;
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

  // ── (a) variants summing to 100 — a single-phase test ──────────────────────

  it('a test with no holdback arms the counter and closes on its last batch', async () => {
    const cfg = { variants: VARIANTS_100, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    const result = await runSplitter(campaignId, cfg);
    expect(result.batches).toBe(2);

    // The counter is armed — this is the assertion the old code failed. It
    // passed null for every A/B campaign, so pending_batches stayed NULL and no
    // batch report could ever decrement it.
    const armed = await campaignRow(campaignId);
    expect(armed.pending_batches).toBe(2);
    expect(armed.status).toBe('sending');

    // No winner job: there is no holdback to dispatch.
    expect(await winnerJobsFor(campaignId)).toHaveLength(0);

    // The batches report in, and the last one closes the campaign.
    const jobs = await batchJobsFor(campaignId);
    expect(jobs).toHaveLength(2);
    for (const j of jobs) {
      await reportBatch(campaignId, j.data.dispatchId, j.data.batchKey, j.data.contactIds.length);
    }

    const closed = await campaignRow(campaignId);
    expect(closed.status).toBe('sent');
    expect(closed.total_sent).toBe(100);
  }, 120_000);

  // ── (c) autoSendWinner: false ─────────────────────────────────────────────

  it('a test with auto-send off still gets a winner job and is parked for review', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: false };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);

    // The job is scheduled — this is what the old condition refused to do,
    // which is why nothing could ever close this campaign.
    const scheduled = await winnerJobsFor(campaignId);
    expect(scheduled).toHaveLength(1);

    // And the holdback was stored rather than silently dropped.
    const [hb] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ab_test_holdbacks WHERE campaign_id = ${campaignId}`;
    expect(hb!.n).toBe(20);

    // Give both variants data so computeAbWinner has something to judge.
    const contactRows = await sql<{ contact_id: string }[]>`
      SELECT contact_id FROM contact_lists WHERE list_id = ${listId} ORDER BY contact_id LIMIT 80`;
    const all = contactRows.map((r) => r.contact_id);
    await recordSends(campaignId, 'a', all.slice(0, 40));
    await recordSends(campaignId, 'b', all.slice(40, 80));
    await recordOpens(campaignId, all.slice(40, 75)); // B clearly ahead

    const outcome = await processAbWinner(
      winnerJob({ campaignId, orgId } as unknown as AbWinnerJobData),
    );
    expect(outcome.decision).toBe('needs_review');
    expect(outcome.dispatched).toBe(0);

    const row = await campaignRow(campaignId);
    expect(row.status).toBe('paused');
    // The reason is what stops Resume turning this park into a permanent stall.
    expect(row.paused_reason).toBe('ab_needs_review');
  }, 120_000);

  // ── (h) regression: the ordinary auto-send path still works ───────────────

  it('a decisive test with auto-send on dispatches the holdback and is marked sent', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);
    expect(await winnerJobsFor(campaignId)).toHaveLength(1);

    const contactRows = await sql<{ contact_id: string }[]>`
      SELECT contact_id FROM contact_lists WHERE list_id = ${listId} ORDER BY contact_id LIMIT 80`;
    const all = contactRows.map((r) => r.contact_id);
    await recordSends(campaignId, 'a', all.slice(0, 40));
    await recordSends(campaignId, 'b', all.slice(40, 80));
    // B: 38/40 clicks, A: 1/40 — decisively above the 95% threshold.
    await recordOpens(campaignId, all.slice(40, 78));
    await recordOpens(campaignId, all.slice(0, 1));

    const outcome = await processAbWinner(
      winnerJob({ campaignId, orgId } as unknown as AbWinnerJobData),
    );
    expect(outcome.decision).toBe('auto_send');
    expect(outcome.dispatched).toBe(20);

    const row = await campaignRow(campaignId);
    expect(row.status).toBe('sent');

    const [res] = await sql<{ auto_send_dispatched: boolean }[]>`
      SELECT auto_send_dispatched FROM ab_test_results WHERE campaign_id = ${campaignId}`;
    expect(res!.auto_send_dispatched).toBe(true);
  }, 120_000);

  // ── (d) replay of a winner job whose dispatch already happened ────────────

  it('a replayed winner job whose holdback already went out closes the campaign as sent', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);

    const contactRows = await sql<{ contact_id: string }[]>`
      SELECT contact_id FROM contact_lists WHERE list_id = ${listId} ORDER BY contact_id LIMIT 80`;
    const all = contactRows.map((r) => r.contact_id);
    await recordSends(campaignId, 'a', all.slice(0, 40));
    await recordSends(campaignId, 'b', all.slice(40, 80));
    await recordOpens(campaignId, all.slice(40, 78));
    await recordOpens(campaignId, all.slice(0, 1));

    // First run dispatches and marks the result dispatched.
    await processAbWinner(winnerJob({ campaignId, orgId } as unknown as AbWinnerJobData));

    // Model the run that died before its status write: put the campaign back in
    // `sending` while ab_test_results still says the holdback went out. That is
    // exactly the state stalled-job recovery replays into.
    await sql`UPDATE campaigns SET status = 'sending' WHERE id = ${campaignId}`;
    expect((await campaignRow(campaignId)).status).toBe('sending');

    const replay = await processAbWinner(
      winnerJob({ campaignId, orgId } as unknown as AbWinnerJobData),
    );

    // The old code returned here without writing anything at all.
    expect(replay.dispatched).toBe(0);
    expect((await campaignRow(campaignId)).status).toBe('sent');
  }, 120_000);

  // ── (e) the stored winner is no longer in ab_config ───────────────────────

  it('a winner that is no longer in ab_config parks the campaign instead of returning silently', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);

    const contactRows = await sql<{ contact_id: string }[]>`
      SELECT contact_id FROM contact_lists WHERE list_id = ${listId} ORDER BY contact_id LIMIT 80`;
    const all = contactRows.map((r) => r.contact_id);
    await recordSends(campaignId, 'a', all.slice(0, 40));
    await recordSends(campaignId, 'b', all.slice(40, 80));
    await recordOpens(campaignId, all.slice(40, 78));
    await recordOpens(campaignId, all.slice(0, 1));

    // Store the verdict, then rewrite ab_config so the winning variant is gone
    // — an operator editing the test after it started.
    await processAbWinner(winnerJob({ campaignId, orgId } as unknown as AbWinnerJobData));
    await sql`
      UPDATE campaigns
         SET status = 'sending',
             ab_config = ${sql.json({
               variants: [
                 { id: 'x', subject: 'X', content: { blocks: ['X'] }, percentage: 40 },
                 { id: 'y', subject: 'Y', content: { blocks: ['Y'] }, percentage: 40 },
               ],
               testDurationHours: 4,
               autoSendWinner: true,
             })}
       WHERE id = ${campaignId}`;
    // Clear the dispatched flag so the run reaches the rankings lookup rather
    // than the already-dispatched branch.
    await sql`
      UPDATE ab_test_results SET auto_send_dispatched = false WHERE campaign_id = ${campaignId}`;

    const outcome = await processAbWinner(
      winnerJob({ campaignId, orgId } as unknown as AbWinnerJobData),
    );
    expect(outcome.dispatched).toBe(0);

    const row = await campaignRow(campaignId);
    expect(row.status).toBe('paused');
    expect(row.paused_reason).toBe('ab_needs_review');
  }, 120_000);

  // ── (f) the winner job fails on every attempt ─────────────────────────────
  //
  // Driven through a REAL Worker rather than by calling the processor, because
  // the thing under test is what happens when BullMQ gives up: the job is gone
  // and an A/B campaign with no winner job has nothing left that can close it.
  // The attempts and backoff are shortened at enqueue time so the ladder runs
  // in the test rather than in fifteen seconds of real waiting.

  it('a winner job that fails on every attempt closes the campaign instead of leaving it sending', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);
    // Deliberately NO send events: computeAbWinner then throws "no variant of
    // this campaign has any recorded sends", the same on every attempt.
    expect((await campaignRow(campaignId)).status).toBe('sending');

    // Drop the delayed job the splitter scheduled and enqueue one that runs now.
    for (const j of await winnerJobsFor(campaignId)) await j.remove();
    await abWinnerQueue.add(
      `winner-fail-${campaignId}`,
      { campaignId, orgId } as unknown as AbWinnerJobData,
      { jobId: `ab-winner-fail-${campaignId}`, attempts: 2, backoff: { type: 'fixed', delay: 50 } },
    );

    const worker = startAbWinnerWorker();
    try {
      const closed = await waitFor(async () => {
        const row = await campaignRow(campaignId);
        return row.status === 'failed' || row.status === 'sent' ? row : null;
      }, 40_000);

      // Nothing was ever reported as sent for this campaign, so `failed` is the
      // honest end. The old code wrote no status at all and the campaign stayed
      // in `sending` with no counter, no job and a reaper that skips it.
      expect(closed.status).toBe('failed');
      expect(closed.pending_batches).toBeNull();
    } finally {
      await worker.close();
    }
  }, 120_000);

  it('the same terminal failure reports `sent` when the variants did reach people', async () => {
    const cfg = { variants: VARIANTS_80, testDurationHours: 4, autoSendWinner: true };
    const campaignId = await makeCampaign(cfg);

    await runSplitter(campaignId, cfg);

    // The variant batches did their work and reported it. They cannot close an
    // A/B campaign — it arms no counter — but the ledger now records real sends.
    for (const j of await batchJobsFor(campaignId)) {
      await reportBatch(campaignId, j.data.dispatchId, j.data.batchKey, j.data.contactIds.length);
    }
    expect((await campaignRow(campaignId)).status).toBe('sending');

    for (const j of await winnerJobsFor(campaignId)) await j.remove();
    await abWinnerQueue.add(
      `winner-fail2-${campaignId}`,
      { campaignId, orgId } as unknown as AbWinnerJobData,
      {
        jobId: `ab-winner-fail2-${campaignId}`,
        attempts: 2,
        backoff: { type: 'fixed', delay: 50 },
      },
    );

    const worker = startAbWinnerWorker();
    try {
      const closed = await waitFor(async () => {
        const row = await campaignRow(campaignId);
        return row.status === 'failed' || row.status === 'sent' ? row : null;
      }, 40_000);

      // 80 messages really went out. Calling that a failure because the
      // holdback never followed would be the wrong end of the same lie.
      expect(closed.status).toBe('sent');
      expect(closed.total_sent).toBe(80);
    } finally {
      await worker.close();
    }
  }, 120_000);
});
