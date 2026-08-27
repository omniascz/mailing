/**
 * The safety net under the counter, not a second way of closing campaigns.
 *
 * A campaign is closed by its last batch reporting in. That works as long as
 * every batch reports, and batches are jobs in a queue on a machine that can be
 * killed: a worker that dies between finishing its work and reporting it takes
 * one decrement with it, and the campaign waits on a batch that no longer
 * exists. The counter cannot detect that on its own — from the inside, "one
 * batch still to report" and "one batch lost" look identical.
 *
 * So: a narrow sweep, deliberately not a general one. It selects only campaigns
 * in `sending` that have not changed in a long time, which is a much smaller
 * set than "every campaign in sending" — the query the anomaly detector runs,
 * and the shape this file exists to avoid.
 *
 * `updated_at` is the right clock, not `sent_at`. Every batch that reports in
 * decrements the counter and touches the row, so `updated_at` measures time
 * since the last sign of life rather than time since the send began. A campaign
 * of a million recipients that is still working its way through the queue keeps
 * moving its own deadline; one whose workers have gone silent does not.
 */
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, campaignDispatchBatches } from '../../db/schema/index.js';
import { markCampaignSent, markCampaignFailed, cancelCampaign } from './index.js';

/**
 * How long a campaign may go without a single batch reporting before it is
 * assumed abandoned.
 *
 * The longest legitimate silence is one batch-sender job's whole life: its
 * retries (6 attempts on the broadcast ladder) plus the time the batch itself
 * takes. That is measured in tens of minutes, not hours. Twenty-four hours is
 * an order of magnitude above it, which is the point — this must never fire on
 * a send that is merely slow, because closing a live campaign would report it
 * finished while its remaining mail was still going out.
 *
 * It is also the retention window on failed jobs (`removeOnFail: age 24h`), so
 * a campaign reaped here still has its failed jobs available to look at.
 */
export const REAP_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The same idea for a different failure: a campaign somebody paused and never
 * came back to.
 *
 * With a real brake in the batch-sender, a paused campaign's batches sit on the
 * queue putting themselves back every few minutes, and its counter never comes
 * down. That is correct while somebody intends to resume. Three days later it
 * is not an intention, it is an abandoned send holding its batches open.
 *
 * Longer than the 24 h for `sending` on purpose, and the difference is the
 * point: `sending` means "this should be moving and is not", which is a fault.
 * `paused` means "a person stopped this", which is a decision, and a decision
 * deserves more room before we overrule it.
 */
export const REAP_PAUSED_AFTER_MS = 72 * 60 * 60 * 1000;

export interface ReapResult {
  examined: number;
  closedSent: number;
  closedFailed: number;
  /** Abandoned paused campaigns cancelled so their batches can stop waiting. */
  cancelledAbandoned: number;
  errors: number;
}

/**
 * Close campaigns whose dispatch has gone quiet.
 *
 * Conservative on purpose: it applies the same rule the last batch would have
 * applied — anything sent means `sent`, nothing sent means `failed` — rather
 * than inventing an outcome of its own. What it does not do is guess about the
 * batches that never reported. They are counted in the log line, because a
 * campaign arriving here at all means something upstream failed silently and
 * the number of missing batches is the size of that failure.
 */
export async function reapStalledDispatches(now: Date = new Date()): Promise<ReapResult> {
  const cutoff = new Date(now.getTime() - REAP_AFTER_MS);

  const stalled = await db
    .select({
      id: campaigns.id,
      orgId: campaigns.orgId,
      pendingBatches: campaigns.pendingBatches,
      updatedAt: campaigns.updatedAt,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, 'sending'),
        lt(campaigns.updatedAt, cutoff),
        // A/B campaigns are closed by the winner job and never arm a counter.
        // Reaping them here would race that job and cut a test short.
        sql`${campaigns.pendingBatches} IS NOT NULL`,
      ),
    )
    .limit(200);

  const result: ReapResult = {
    examined: stalled.length,
    closedSent: 0,
    closedFailed: 0,
    cancelledAbandoned: 0,
    errors: 0,
  };

  for (const c of stalled) {
    try {
      const [totals] = await db
        .select({
          sent: sql<number>`coalesce(sum(${campaignDispatchBatches.sentCount}), 0)::int`,
          reported: sql<number>`count(${campaignDispatchBatches.completedAt})::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(campaignDispatchBatches)
        .where(eq(campaignDispatchBatches.campaignId, c.id));

      const totalSent = totals?.sent ?? 0;
      const missing = c.pendingBatches ?? 0;

      console.warn(
        `[dispatch-reaper] campaign ${c.id} has not moved since ${c.updatedAt.toISOString()} — ` +
          `${missing} batch(es) never reported, ${totals?.reported ?? 0}/${totals?.total ?? 0} ` +
          `ledger rows complete, ${totalSent} sent. Closing it.`,
      );

      if (totalSent > 0) {
        await markCampaignSent(c.orgId, c.id, { totalSent });
        result.closedSent++;
      } else {
        await markCampaignFailed(c.orgId, c.id, `reaped after ${missing} batch(es) went silent`);
        result.closedFailed++;
      }
    } catch (err) {
      result.errors++;
      console.error(`[dispatch-reaper] campaign ${c.id} could not be closed:`, err);
    }
  }

  await reapAbandonedPauses(now, result);
  return result;
}

/**
 * Campaigns paused long enough that nobody is coming back.
 *
 * Its own pass and its own log line rather than a branch inside the sweep
 * above: a stalled `sending` campaign is a fault to investigate, an abandoned
 * `paused` one is a person who moved on. Reading them from the same message
 * would blur two diagnoses into one.
 *
 * `cancelCampaign` is the action, not markCampaignFailed — `paused → cancelled`
 * is already a legal transition, and it is honest: nobody decided this send
 * failed, somebody stopped it and never finished. Once cancelled, the brake in
 * the batch-sender drops the waiting batches instead of re-delaying them, so
 * the counter finally comes down.
 */
async function reapAbandonedPauses(now: Date, result: ReapResult): Promise<void> {
  const cutoff = new Date(now.getTime() - REAP_PAUSED_AFTER_MS);

  const abandoned = await db
    .select({
      id: campaigns.id,
      orgId: campaigns.orgId,
      pendingBatches: campaigns.pendingBatches,
      updatedAt: campaigns.updatedAt,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, 'paused'),
        lt(campaigns.updatedAt, cutoff),
        // Only a pause with a dispatch still open. A campaign paused before it
        // ever queued anything holds nothing and can sit there indefinitely.
        sql`${campaigns.pendingBatches} IS NOT NULL AND ${campaigns.pendingBatches} > 0`,
      ),
    )
    .limit(200);

  result.examined += abandoned.length;

  for (const c of abandoned) {
    const ageHours = Math.round((now.getTime() - c.updatedAt.getTime()) / 3_600_000);
    try {
      console.warn(
        `[dispatch-reaper] campaign ${c.id} has been paused for ${ageHours}h with ` +
          `${c.pendingBatches} batch(es) still held open. Cancelling it so they can stop waiting.`,
      );
      await cancelCampaign(c.orgId, c.id);
      result.cancelledAbandoned++;
    } catch (err) {
      result.errors++;
      console.error(`[dispatch-reaper] campaign ${c.id} could not be cancelled:`, err);
    }
  }
}
