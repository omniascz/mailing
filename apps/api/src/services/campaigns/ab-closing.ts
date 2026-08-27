/**
 * How an A/B campaign ends when its winner job cannot finish the job.
 *
 * An A/B campaign arms no batch counter — its variants' batches are only the
 * first phase, so a counter reaching zero would declare it sent while the
 * holdback was still waiting — and the reaper skips campaigns without one. The
 * winner job is therefore the only thing that can close such a campaign, and a
 * winner job that dies without writing a status leaves it in `sending` with
 * nothing that will ever move it again.
 *
 * That is what this module is for: the last exit, taken when the winner job has
 * exhausted its attempts on an error that will not go away — no variant has any
 * recorded sends to compare, or `ab_config` no longer holds the variants the
 * stored result names.
 *
 * The verdict is not invented here. It is the same question the ordinary
 * closing step and the reaper both ask — did anything actually go out? —
 * answered from the dispatch ledger:
 *
 *   any batch recorded a send  → `sent`, with the total
 *   nothing was sent at all    → `failed`
 *
 * so a campaign whose variants reached real people is not reported as a failure
 * merely because the holdback never followed, and one that reached nobody is
 * not reported as sent.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, campaignDispatchBatches } from '../../db/schema/index.js';
import { markCampaignSent, markCampaignFailed } from './index.js';

/** Statuses a campaign cannot be moved out of; reaching one is already an end. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['sent', 'failed', 'cancelled']);

export type AbWinnerFailureOutcome = 'sent' | 'failed' | 'already_closed' | 'not_found';

export interface AbWinnerFailureResult {
  outcome: AbWinnerFailureOutcome;
  totalSent: number;
}

/**
 * Close a campaign whose A/B winner job has failed terminally.
 *
 * Idempotent: a campaign that is already in a terminal status is left alone and
 * reported as `already_closed`, so a replayed call cannot move a finished
 * campaign or overwrite the totals its own closing step recorded.
 */
export async function closeAfterWinnerFailure(
  orgId: string,
  campaignId: string,
  reason: string,
): Promise<AbWinnerFailureResult> {
  const [current] = await db
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.orgId, orgId)))
    .limit(1);

  if (!current) return { outcome: 'not_found', totalSent: 0 };

  const [totals] = await db
    .select({
      sent: sql<number>`coalesce(sum(${campaignDispatchBatches.sentCount}), 0)::int`,
    })
    .from(campaignDispatchBatches)
    .where(eq(campaignDispatchBatches.campaignId, campaignId));

  const totalSent = totals?.sent ?? 0;

  if (TERMINAL_STATUSES.has(current.status)) {
    console.warn(
      `[ab-closing] campaign ${campaignId} is already ${current.status}; its winner job failed ` +
        `terminally (${reason}) but there is nothing left to close`,
    );
    return { outcome: 'already_closed', totalSent };
  }

  // Loud on purpose. Reaching here means an A/B test produced no usable verdict
  // and a human is going to want to know why, not discover it from a status.
  console.error(
    `[ab-closing] campaign ${campaignId}: the A/B winner job gave up for good — ${reason}. ` +
      `${totalSent} message(s) went out to the test variants; the holdback was never ` +
      `dispatched. Closing the campaign as ${totalSent > 0 ? 'sent' : 'failed'} so it does not ` +
      `sit in 'sending' with nothing left to move it.`,
  );

  if (totalSent > 0) {
    await markCampaignSent(orgId, campaignId, { totalSent });
    return { outcome: 'sent', totalSent };
  }

  await markCampaignFailed(
    orgId,
    campaignId,
    `A/B winner job failed terminally and nothing was sent: ${reason}`,
  );
  return { outcome: 'failed', totalSent: 0 };
}
