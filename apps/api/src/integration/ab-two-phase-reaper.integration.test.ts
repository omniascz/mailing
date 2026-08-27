/**
 * What the reaper may and may not touch once an A/B send has a counter.
 *
 * Before the two-phase counter, no A/B campaign armed one at all, and the
 * reaper skipped every campaign without one — so an A/B send was invisible to
 * the safety net from beginning to end. Now both of its phases are counted, and
 * the exclusion has to be narrowed to the one silence that is not a fault: a
 * test that has finished its variants and is waiting out its window for the
 * winner dispatch. That wait is the feature, and `testDurationHours` is the
 * customer's to choose, so it can be far longer than the sweep's 24-hour
 * cutoff.
 *
 * The distinction the query makes is `pending_batches = 0` while awaiting:
 *   awaiting, zero outstanding  → waiting for the winner job → leave alone
 *   awaiting, some outstanding  → variant batches have gone quiet → a stall
 *   not awaiting                → an ordinary dispatch, supervised as ever
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { campaigns, campaignDispatchBatches, organizations, lists } from '../db/schema/index.js';
import { reapStalledDispatches, REAP_AFTER_MS } from '../services/campaigns/dispatch-reaper.js';
import { addWinnerPhase, startDispatch } from '../services/campaigns/batch-completion.js';

let orgId: string;
let listId: string;
const made: string[] = [];

/** Comfortably past the sweep's cutoff. */
const LONG_AGO = () => new Date(Date.now() - REAP_AFTER_MS - 60 * 60 * 1000);

async function makeCampaign(over: {
  status?: 'sending' | 'paused';
  pendingBatches?: number | null;
  awaitingAbWinner?: boolean;
  updatedAt?: Date;
}): Promise<string> {
  const [c] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `reaper2p ${randomUUID().slice(0, 8)}`,
      subject: 'Reaper probe',
      type: 'email',
      listId,
      status: over.status ?? 'sending',
      pendingBatches: over.pendingBatches ?? null,
      awaitingAbWinner: over.awaitingAbWinner ?? false,
    })
    .returning({ id: campaigns.id });
  made.push(c!.id);

  // updated_at has a default and is touched by the insert, so the age the
  // sweep reads has to be written afterwards.
  if (over.updatedAt) {
    await db.update(campaigns).set({ updatedAt: over.updatedAt }).where(eq(campaigns.id, c!.id));
  }
  return c!.id;
}

async function statusOf(id: string) {
  const [row] = await db
    .select({
      status: campaigns.status,
      pendingBatches: campaigns.pendingBatches,
      awaitingAbWinner: campaigns.awaitingAbWinner,
      totalSent: campaigns.totalSent,
    })
    .from(campaigns)
    .where(eq(campaigns.id, id));
  return row!;
}

/** A completed ledger row, so the reaper has a sent count to read. */
async function ledgerRow(campaignId: string, sentCount: number) {
  await db.insert(campaignDispatchBatches).values({
    campaignId,
    orgId,
    dispatchId: `d-${campaignId}`,
    batchKey: randomUUID().slice(0, 8),
    completedAt: new Date(),
    sentCount,
    skippedCount: 0,
  });
}

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: 'reaper2p itest', slug: `reaper2p-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  const [list] = await db
    .insert(lists)
    .values({ orgId, name: `reaper2p ${randomUUID().slice(0, 8)}` })
    .returning({ id: lists.id });
  listId = list!.id;
});

afterAll(async () => {
  if (made.length) await db.delete(campaigns).where(inArray(campaigns.id, made));
  await db.delete(lists).where(eq(lists.id, listId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe('the reaper and an A/B send that is waiting for its winner', () => {
  it('leaves a campaign whose variants are done and whose winner has not fired', async () => {
    const id = await makeCampaign({
      pendingBatches: 0,
      awaitingAbWinner: true,
      updatedAt: LONG_AGO(),
    });
    await ledgerRow(id, 40);

    await reapStalledDispatches();

    // A long test window is not a stall. Closing here would cut the test short
    // and strand the holdback, which is the whole reason A/B campaigns were
    // excluded from this sweep in the first place.
    const after = await statusOf(id);
    expect(after.status).toBe('sending');
    expect(after.awaitingAbWinner).toBe(true);
  });

  it('DOES reap an A/B campaign whose variant batches went quiet mid-phase', async () => {
    const id = await makeCampaign({
      pendingBatches: 2,
      awaitingAbWinner: true,
      updatedAt: LONG_AGO(),
    });
    await ledgerRow(id, 40);

    await reapStalledDispatches();

    // Outstanding batches and no sign of life for a day is a stall whichever
    // phase it happens in. Before the two-phase counter this campaign had no
    // counter at all and was invisible here — it would have sat in `sending`.
    const after = await statusOf(id);
    expect(after.status).toBe('sent');
    expect(after.totalSent).toBe(40);
  });

  it('DOES reap a stalled winner dispatch, which was never supervised before', async () => {
    const id = await makeCampaign({
      pendingBatches: 1,
      awaitingAbWinner: false,
      updatedAt: LONG_AGO(),
    });
    await ledgerRow(id, 40);

    await reapStalledDispatches();

    const after = await statusOf(id);
    expect(after.status).toBe('sent');
  });

  it('leaves a waiting campaign alone even when it is recent', async () => {
    const id = await makeCampaign({ pendingBatches: 0, awaitingAbWinner: true });

    await reapStalledDispatches();

    expect((await statusOf(id)).status).toBe('sending');
  });

  it('still leaves an ordinary campaign that is merely slow', async () => {
    const id = await makeCampaign({ pendingBatches: 3, awaitingAbWinner: false });

    await reapStalledDispatches();

    expect((await statusOf(id)).status).toBe('sending');
  });
});

describe('addWinnerPhase adds the second phase exactly once', () => {
  it('adds to the counter the variants armed, and stops the campaign waiting', async () => {
    const id = await makeCampaign({});
    await startDispatch({
      orgId,
      campaignId: id,
      plannedRecipients: 100,
      batchCount: 2,
      awaitingAbWinner: true,
    });

    const first = await addWinnerPhase({ orgId, campaignId: id, batchCount: 1 });

    expect(first).toEqual({ armed: true, pending: 3 });
    const after = await statusOf(id);
    expect(after.pendingBatches).toBe(3);
    expect(after.awaitingAbWinner).toBe(false);
  });

  it('a second call adds nothing — the flag is the compare-and-swap', async () => {
    const id = await makeCampaign({});
    await startDispatch({
      orgId,
      campaignId: id,
      plannedRecipients: 100,
      batchCount: 2,
      awaitingAbWinner: true,
    });
    await addWinnerPhase({ orgId, campaignId: id, batchCount: 1 });

    const replay = await addWinnerPhase({ orgId, campaignId: id, batchCount: 1 });

    expect(replay.armed).toBe(false);
    // Still three. A second add leaves a counter the batches cannot take to
    // zero, and the campaign never closes.
    expect((await statusOf(id)).pendingBatches).toBe(3);
  });

  it('adds while phase one is still outstanding — the phases may overlap', async () => {
    const id = await makeCampaign({});
    await startDispatch({
      orgId,
      campaignId: id,
      plannedRecipients: 100,
      batchCount: 5,
      awaitingAbWinner: true,
    });

    // The winner job fires on a timer; a variant batch that is still retrying
    // has not reported yet. A counter that was replaced rather than added to
    // would throw those away and the campaign would never close.
    const result = await addWinnerPhase({ orgId, campaignId: id, batchCount: 2 });

    expect(result).toEqual({ armed: true, pending: 7 });
  });

  it('refuses a campaign that was never waiting for a winner dispatch', async () => {
    const id = await makeCampaign({});
    await startDispatch({
      orgId,
      campaignId: id,
      plannedRecipients: 100,
      batchCount: 2,
      awaitingAbWinner: false,
    });

    const result = await addWinnerPhase({ orgId, campaignId: id, batchCount: 1 });

    expect(result.armed).toBe(false);
    expect((await statusOf(id)).pendingBatches).toBe(2);
  });
});
