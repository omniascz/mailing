/**
 * ab-winner has the same defect as the splitter and one extra reason to care:
 * its BullMQ jobId is fixed at `ab-winner-${campaignId}`, so `job.id` alone
 * cannot tell a retry apart from a genuinely new winner dispatch. The ledger
 * keys on `${job.id}:${job.timestamp}` for exactly that reason.
 *
 * The holdback slice is the part of the audience that was deliberately *not*
 * sent during the test window, so duplicating it means mailing the same people
 * the winning variant twice.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processAbWinner } from '../jobs/ab-winner.js';
import { batchSenderQueue, type AbWinnerJobData } from '../queues/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const HOLDBACK = 1200; // → 2 batches at BATCH_SIZE 1000
let orgId: string;
let campaignId: string;
const createdCampaigns: string[] = [];

const AB_CONFIG = {
  variants: [
    { id: 'a', subject: 'Variant A', content: { blocks: [] }, percentage: 40 },
    { id: 'b', subject: 'Variant B', content: { blocks: [] }, percentage: 40 },
  ],
  winnerCriteria: 'click_rate',
  testDurationHours: 4,
  autoSendWinner: true,
};

function fakeJob(id: string, timestamp: number): Job<AbWinnerJobData> {
  return {
    id,
    timestamp,
    data: {
      campaignId,
      orgId,
      fromName: 'ForgeMsg',
      fromEmail: 'probe@test.local',
      priority: 5,
    },
    log: async () => {},
  } as unknown as Job<AbWinnerJobData>;
}

async function queuedBatchCount(): Promise<number> {
  const jobs = await batchSenderQueue.getJobs(
    ['waiting', 'prioritized', 'delayed', 'paused', 'active'],
    0,
    10_000,
  );
  return jobs.filter((j) => j.data?.campaignId && createdCampaigns.includes(j.data.campaignId))
    .length;
}

async function clearQueue() {
  const jobs = await batchSenderQueue.getJobs(
    ['waiting', 'prioritized', 'delayed', 'paused', 'completed', 'failed'],
    0,
    10_000,
  );
  await Promise.all(
    jobs
      .filter((j) => j.data?.campaignId && createdCampaigns.includes(j.data.campaignId))
      .map((j) => j.remove().catch(() => {})),
  );
}

describe('ab-winner idempotency (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1
    `;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    const [c] = await sql<{ id: string }[]>`
      INSERT INTO campaigns (org_id, name, subject, status, type, ab_config)
      VALUES (${orgId}, ${'ab-idem ' + randomUUID().slice(0, 8)}, 'AB idempotency probe',
              'sending', 'email', ${sql.json(AB_CONFIG)})
      RETURNING id
    `;
    campaignId = c!.id;
    createdCampaigns.push(campaignId);

    const tag = randomUUID().slice(0, 8);
    const emails = Array.from({ length: HOLDBACK }, (_, i) => `abi-${tag}-${i}@test.local`);
    for (let i = 0; i < emails.length; i += 400) {
      const slice = emails.slice(i, i + 400);
      const ids = await sql<{ id: string }[]>`
        INSERT INTO contacts ${sql(slice.map((email) => ({ org_id: orgId, email, status: 'active' })))}
        RETURNING id
      `;
      await sql`
        INSERT INTO ab_test_holdbacks ${sql(
          ids.map((r) => ({ campaign_id: campaignId, org_id: orgId, contact_id: r.id })),
        )}
      `;
    }

    // The test-phase cohort. Without it computeAbWinner has nothing to compare
    // and refuses outright — a campaign whose variants were never sent has no
    // winner to pick, and it now says so instead of returning zeros and
    // crowning ab_config.variants[0]. The holdback above is the slice that was
    // deliberately NOT sent, so it cannot double as this.
    const testTag = randomUUID().slice(0, 8);
    for (const [variantId, clicks] of [
      ['a', 10],
      ['b', 40],
    ] as const) {
      const testers = await sql<{ id: string }[]>`
        INSERT INTO contacts ${sql(
          Array.from({ length: 100 }, (_, i) => ({
            org_id: orgId,
            email: `abi-test-${testTag}-${variantId}-${i}@test.local`,
            status: 'active',
          })),
        )}
        RETURNING id
      `;
      await sql`
        INSERT INTO email_events ${sql(
          testers.map((r) => ({
            org_id: orgId,
            campaign_id: campaignId,
            contact_id: r.id,
            event_type: 'send',
            ab_variant_id: variantId,
          })),
        )}
      `;
      await sql`
        INSERT INTO email_events ${sql(
          testers.slice(0, clicks).map((r) => ({
            org_id: orgId,
            campaign_id: campaignId,
            contact_id: r.id,
            event_type: 'click',
          })),
        )}
      `;
    }
  }, 120_000);

  afterAll(async () => {
    await clearQueue();
    await sql`DELETE FROM ab_test_holdbacks WHERE campaign_id = ${campaignId}`;
    await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    await sql`DELETE FROM email_events WHERE campaign_id = ${campaignId}`;
    await sql`DELETE FROM contacts WHERE org_id = ${orgId} AND email LIKE 'abi-%@test.local'`;
    await sql.end();
    await batchSenderQueue.close();
  }, 60_000);

  beforeEach(async () => {
    await clearQueue();
    // Each case starts from "the winner has not been computed or dispatched".
    // The stored result is deleted, not just un-flagged — see the note in the
    // second case for why clearing the flag alone is not enough.
    await sql`DELETE FROM ab_test_results WHERE campaign_id = ${campaignId}`;
  });

  it('a retry of the same winner job does not re-dispatch the holdback', async () => {
    const id = `ab-winner-${campaignId}`;
    const ts = 1_700_000_000_000;

    const first = await processAbWinner(fakeJob(id, ts));
    const afterFirst = await queuedBatchCount();

    // The retry window this is reproducing.
    //
    // processAbWinner enqueues the holdback batches and only then POSTs to
    // ab-winner-dispatched. Anything that goes wrong in between — the process
    // dying, the API refusing the call — leaves the batches queued and the
    // campaign still marked "not dispatched", and BullMQ hands the same job
    // back. Clearing the stored result models exactly that: the enqueue
    // happened, the record of it did not.
    await sql`DELETE FROM ab_test_results WHERE campaign_id = ${campaignId}`;

    await processAbWinner(fakeJob(id, ts));
    const afterSecond = await queuedBatchCount();

    expect(first.dispatched).toBe(HOLDBACK);
    expect(afterFirst).toBe(2);
    expect(afterSecond).toBe(2);
  }, 120_000);

  it('a fresh winner dispatch is not blocked by the previous one', async () => {
    // Same BullMQ jobId — the splitter always uses `ab-winner-${campaignId}` —
    // but a new enqueue, so a different timestamp.
    const id = `ab-winner-${campaignId}`;

    // Distinct from the retry case above — the ledger is keyed on the
    // timestamp, so reusing it would (correctly) make this a retry.
    await processAbWinner(fakeJob(id, 1_700_050_000_000));
    const afterFirst = await queuedBatchCount();

    // A second dispatch is a new A/B cycle, so the stored result goes with it.
    //
    // It has to be deleted rather than just un-flagged, and that is a defect
    // this test had to work around rather than one it is asserting on:
    // computeAbWinner short-circuits on any existing ab_test_results row and
    // returns `rankings: []` from the cache. processAbWinner then looks the
    // winning variant up in those rankings, does not find it, logs "Winner
    // variant not found in rankings" and returns `{ dispatched: 0 }`. So a
    // repeat winner dispatch is independently broken today, quite apart from
    // idempotency — worth fixing, but not in this change.
    await sql`DELETE FROM ab_test_results WHERE campaign_id = ${campaignId}`;

    await processAbWinner(fakeJob(id, 1_700_060_000_000));
    const afterSecond = await queuedBatchCount();

    expect(afterFirst).toBe(2);
    expect(afterSecond).toBe(4);
  }, 120_000);
});
