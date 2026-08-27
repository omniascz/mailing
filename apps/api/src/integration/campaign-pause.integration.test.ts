/**
 * What happens to a dispatch when the operator stops it.
 *
 * Two things this pins, both of which were broken:
 *
 *  - A campaign cancelled while its batches were still out. Cancel is only
 *    reachable from `paused`, so the real path is Pause then Cancel, and it
 *    ended in an exception: the last batch reported, the counter reached zero,
 *    markCampaignSent ran validateTransition, and `cancelled → sent` is not a
 *    transition. The worker got a 400 for reporting work it had genuinely
 *    finished, and the number of messages that did go out was discarded.
 *
 *  - A campaign paused and never resumed. With a brake in the batch-sender its
 *    batches sit on the queue re-delaying themselves forever, and nothing was
 *    watching: the reaper only ever looked at `sending`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { campaigns, campaignDispatchBatches, organizations, lists } from '../db/schema/index.js';
import { sendCampaign, pauseCampaign, cancelCampaign } from '../services/campaigns/index.js';
import { startDispatch, reportBatchCompletion } from '../services/campaigns/batch-completion.js';
import {
  reapStalledDispatches,
  REAP_PAUSED_AFTER_MS,
} from '../services/campaigns/dispatch-reaper.js';

let orgId: string;
let listId: string;
const made: string[] = [];

const dispatchFor = (campaignId: string) => `p3-${campaignId}`;

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: 'pause itest', slug: `pause-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;
  const [list] = await db
    .insert(lists)
    .values({ orgId, name: `pause ${randomUUID().slice(0, 8)}` })
    .returning({ id: lists.id });
  listId = list!.id;
});

afterAll(async () => {
  if (made.length) await db.delete(campaigns).where(inArray(campaigns.id, made));
  if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
});

/** A campaign mid-dispatch: two batches enqueued, none reported. */
async function inFlight(batchCount = 2) {
  const [c] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `pause ${randomUUID().slice(0, 8)}`,
      subject: 'Subject',
      fromName: 'Shop',
      fromEmail: 'orders@shop.cz',
      listId,
      content: { blocks: [{ type: 'text', text: 'hi' }] },
      type: 'email',
      status: 'draft',
    })
    .returning({ id: campaigns.id });
  const id = c!.id;
  made.push(id);

  await sendCampaign(orgId, id);
  await startDispatch({ orgId, campaignId: id, plannedRecipients: 20, batchCount });
  await db.insert(campaignDispatchBatches).values(
    Array.from({ length: batchCount }, (_, i) => ({
      campaignId: id,
      orgId,
      dispatchId: dispatchFor(id),
      batchKey: String(i),
      enqueuedAt: new Date(),
    })),
  );
  await db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, id));
  return id;
}

async function row(id: string) {
  const [r] = await db
    .select({
      status: campaigns.status,
      pendingBatches: campaigns.pendingBatches,
      totalSent: campaigns.totalSent,
    })
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);
  return r!;
}

const done = (id: string, key: string, sent: number) =>
  reportBatchCompletion({
    orgId,
    campaignId: id,
    dispatchId: dispatchFor(id),
    batchKey: key,
    sent,
    skipped: 0,
  });

describe('(c) cancelling a campaign whose batches are still out', () => {
  it('does not throw, records what was sent, and lets the counter reach zero', async () => {
    const id = await inFlight();
    await done(id, '0', 5);
    expect((await row(id)).pendingBatches).toBe(1);

    // The operator's real path: Pause, then Cancel. `sending → cancelled` is
    // not a transition at all, so Cancel is only reachable through the pause.
    await pauseCampaign(orgId, id);
    await cancelCampaign(orgId, id);
    expect((await row(id)).status).toBe('cancelled');

    // The batch that was already in flight finishes and reports. This used to
    // throw `Invalid campaign status transition: cancelled → sent`.
    const last = await done(id, '1', 4);

    expect(last).toMatchObject({ counted: true, pending: 0, closed: null });
    const r = await row(id);
    // Nothing transitioned — the campaign is still cancelled, as the operator
    // left it.
    expect(r.status).toBe('cancelled');
    expect(r.pendingBatches).toBeNull();
    // But the nine messages that really went out are recorded. Discarding them
    // is what the old path did, and it is the operator's number, not ours.
    expect(r.totalSent).toBe(9);
  });

  it('records zero rather than nothing when the cancel beat every batch', async () => {
    const id = await inFlight(1);
    await pauseCampaign(orgId, id);
    await cancelCampaign(orgId, id);

    // The brake drops a batch on a cancelled campaign and reports it as fully
    // skipped — that is what arrives here.
    const last = await done(id, '0', 0);

    expect(last).toMatchObject({ counted: true, closed: null });
    const r = await row(id);
    expect(r.status).toBe('cancelled');
    expect(r.totalSent).toBe(0);
    expect(r.pendingBatches).toBeNull();
  });
});

describe('(e) the reaper and an abandoned pause', () => {
  it('cancels a pause older than the threshold that is still holding batches', async () => {
    const id = await inFlight();
    await pauseCampaign(orgId, id);
    await db
      .update(campaigns)
      .set({ updatedAt: new Date(Date.now() - REAP_PAUSED_AFTER_MS - 60_000) })
      .where(eq(campaigns.id, id));

    const result = await reapStalledDispatches();

    expect(result.cancelledAbandoned).toBeGreaterThanOrEqual(1);
    // Cancelled, not failed: nobody decided this send failed. Somebody stopped
    // it and never came back, and cancelled is what that is.
    expect((await row(id)).status).toBe('cancelled');
  });

  it('leaves a pause that is merely recent alone', async () => {
    const id = await inFlight();
    await pauseCampaign(orgId, id);

    await reapStalledDispatches();

    expect((await row(id)).status).toBe('paused');
  });

  it('leaves an old pause that holds no batches alone', async () => {
    const id = await inFlight();
    // Both batches reported before the pause, so the dispatch is over and the
    // pause holds nothing open. There is nothing to rescue.
    await done(id, '0', 1);
    await done(id, '1', 1);
    await db
      .update(campaigns)
      .set({
        status: 'paused',
        pendingBatches: 0,
        updatedAt: new Date(Date.now() - REAP_PAUSED_AFTER_MS - 60_000),
      })
      .where(eq(campaigns.id, id));

    await reapStalledDispatches();

    expect((await row(id)).status).toBe('paused');
  });
});
