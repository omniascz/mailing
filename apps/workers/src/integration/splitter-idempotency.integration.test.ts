/**
 * The defect: running campaign-splitter twice with the same job enqueued the
 * batches twice, so every contact in the audience got the campaign twice.
 * Measured on a real worker before the fix — 2500 contacts, 3 batches after
 * the first run, 6 after the second.
 *
 * A BullMQ retry is exactly this second run: `attempts: 3`, and anything that
 * throws after `addBulk` has already returned (the campaign status PATCH, a
 * dropped connection) hands the same job back to the worker.
 *
 * These tests drive the real processors against a real Postgres, a real Redis
 * and a real API process, and count what actually landed in batch-sender.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { processCampaignSplitter } from '../jobs/campaign-splitter.js';
import { batchSenderQueue, type CampaignSplitterJobData } from '../queues/index.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false });

const CONTACTS = 2500; // → 3 batches at BATCH_SIZE 1000
let orgId: string;
let listId: string;
let campaignId: string;
const createdCampaigns: string[] = [];

/**
 * Job stand-in. `id` and `timestamp` are what the ledger keys off, so a retry
 * is modelled by reusing the same pair and a resend by minting a new one —
 * which is precisely the distinction the fix has to get right.
 */
function fakeJob(
  data: CampaignSplitterJobData,
  id: string,
  timestamp: number,
): Job<CampaignSplitterJobData> {
  return {
    id,
    timestamp,
    data,
    log: async () => {},
  } as unknown as Job<CampaignSplitterJobData>;
}

function splitterData(cid: string): CampaignSplitterJobData {
  return {
    campaignId: cid,
    orgId,
    listId,
    content: { blocks: [] },
    subject: 'Idempotency probe',
    fromName: 'ForgeMsg',
    fromEmail: 'probe@test.local',
    priority: 5,
  } as unknown as CampaignSplitterJobData;
}

/** Batch jobs this dispatch put in the queue, counted from a clean slate. */
async function queuedBatchCount(): Promise<number> {
  // Batch jobs carry a priority, and BullMQ 5 parks those in `prioritized`
  // rather than `waiting` — leaving it out counts every queue as empty.
  const jobs = await batchSenderQueue.getJobs(
    ['waiting', 'prioritized', 'delayed', 'paused', 'active'],
    0,
    10_000,
  );
  return jobs.filter((j) => j.data?.campaignId && createdCampaigns.includes(j.data.campaignId))
    .length;
}

async function makeCampaign(): Promise<string> {
  const [c] = await sql<{ id: string }[]>`
    INSERT INTO campaigns (org_id, name, subject, status, type, list_id)
    VALUES (${orgId}, ${'splitter-idem ' + randomUUID().slice(0, 8)}, 'Idempotency probe',
            'scheduled', 'email', ${listId})
    RETURNING id
  `;
  createdCampaigns.push(c!.id);
  return c!.id;
}

describe('campaign-splitter idempotency (real DB + Redis + API)', () => {
  beforeAll(async () => {
    const [org] = await sql<{ id: string }[]>`
      SELECT id FROM organizations WHERE slug = 'acme-demo' LIMIT 1
    `;
    if (!org) throw new Error('[workers-integration] seed org missing');
    orgId = org.id;

    const [list] = await sql<{ id: string }[]>`
      INSERT INTO lists (org_id, name)
      VALUES (${orgId}, ${'splitter-idem ' + randomUUID().slice(0, 8)})
      RETURNING id
    `;
    listId = list!.id;

    // 2500 contacts on the list → three batches.
    const tag = randomUUID().slice(0, 8);
    const emails = Array.from({ length: CONTACTS }, (_, i) => `si-${tag}-${i}@test.local`);
    for (let i = 0; i < emails.length; i += 500) {
      const slice = emails.slice(i, i + 500);
      const ids = await sql<{ id: string }[]>`
        INSERT INTO contacts ${sql(slice.map((email) => ({ org_id: orgId, email, status: 'active' })))}
        RETURNING id
      `;
      await sql`
        INSERT INTO contact_lists ${sql(ids.map((r) => ({ contact_id: r.id, list_id: listId })))}
      `;
    }

    campaignId = await makeCampaign();
  }, 120_000);

  afterAll(async () => {
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
    if (createdCampaigns.length > 0) {
      await sql`DELETE FROM campaigns WHERE id = ANY(${createdCampaigns})`;
    }
    await sql`DELETE FROM contacts WHERE org_id = ${orgId} AND email LIKE 'si-%@test.local'`;
    await sql`DELETE FROM lists WHERE id = ${listId}`;
    await sql.end();
    await batchSenderQueue.close();
  }, 60_000);

  beforeEach(async () => {
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
  });

  it('a retry of the same job does not enqueue the batches a second time', async () => {
    const data = splitterData(campaignId);
    const id = `retry-${randomUUID().slice(0, 8)}`;
    const ts = 1_700_000_000_000;

    const first = await processCampaignSplitter(fakeJob(data, id, ts));
    const afterFirst = await queuedBatchCount();

    // Same job id + same timestamp = the same dispatch, which is what BullMQ
    // hands back on attempt 2.
    await processCampaignSplitter(fakeJob(data, id, ts));
    const afterSecond = await queuedBatchCount();

    expect(first.batches).toBe(3);
    expect(afterFirst).toBe(3);
    expect(afterSecond).toBe(3);
  }, 120_000);

  it('a legitimate resend still produces a fresh set of batches', async () => {
    const data = splitterData(campaignId);

    await processCampaignSplitter(
      fakeJob(data, `send-${randomUUID().slice(0, 8)}`, 1_700_000_000_000),
    );
    const afterFirst = await queuedBatchCount();

    // A resend is a new enqueue: new BullMQ job, new timestamp.
    await processCampaignSplitter(
      fakeJob(data, `send-${randomUUID().slice(0, 8)}`, 1_700_000_999_000),
    );
    const afterSecond = await queuedBatchCount();

    expect(afterFirst).toBe(3);
    expect(afterSecond).toBe(6);
  }, 120_000);

  it('a retry after a partial enqueue completes the set without duplicating it', async () => {
    // Claim the batches for a dispatch, confirm only the first, then run the
    // splitter under that dispatch: batch 0 is skipped, 1 and 2 are enqueued.
    const cid = await makeCampaign();
    const id = `partial-${randomUUID().slice(0, 8)}`;
    const ts = 1_700_000_000_000;
    const dispatchId = `${id}:${ts}`;
    const secret = process.env.INTERNAL_API_SECRET ?? '';
    const base = process.env.API_URL ?? 'http://localhost:3001';

    const claimRes = await fetch(
      `${base}/api/v1/internal/campaigns/${cid}/dispatch-batches/claim`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify({ orgId, dispatchId, keys: ['0'] }),
      },
    );
    expect(claimRes.status).toBe(200);
    const confirmRes = await fetch(
      `${base}/api/v1/internal/campaigns/${cid}/dispatch-batches/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify({ dispatchId, keys: ['0'] }),
      },
    );
    expect(confirmRes.status).toBe(200);

    await processCampaignSplitter(fakeJob(splitterData(cid), id, ts));
    expect(await queuedBatchCount()).toBe(2);
  }, 120_000);
});
