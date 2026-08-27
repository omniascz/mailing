/**
 * The closing step: what turns `sending` into `sent` or `failed`.
 *
 * A campaign used to be marked `sent` by the splitter, the moment the last
 * batch reached the queue — before a single message had been handed to an MX.
 * So `sent` meant "queued", and there was no state at all for "this send is
 * over". Nothing closed a campaign out; nothing could.
 *
 * The closing condition is **batches, not recipients**. Each batch reports once
 * when its job finishes, whether it sent anything or gave up for good, and the
 * report that takes the counter to zero decides the outcome. Deliberately not
 * built on `email_events`: a recipient can fail to produce any event at all,
 * and a campaign whose closure waits on one that never arrives is the stuck
 * state this model exists to remove, wearing a different name.
 *
 * The outcome is read from what the batches actually reported:
 *   any batch sent at least one message  → `sent`, with the total
 *   every batch reported and none sent   → `failed`
 * There is no partial state. A campaign that reached some of its audience is
 * sent, and the numbers say how much.
 *
 * A send can have more than one phase. An A/B test with a holdback sends its
 * variants first and the winning variant to the remainder after the test
 * window, and both are phases of one send: one counter, added to when the
 * second phase begins, and `awaiting_ab_winner` to say that zero at the end of
 * the first phase is not the end of the campaign. Additive rather than a
 * counter per phase because the phases can overlap — a variant batch may still
 * be retrying when the winner job fires — and a sum does not care which phase a
 * batch belonged to. The last batch out closes the campaign, whichever phase
 * produced it.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaigns, campaignDispatchBatches } from '../../db/schema/index.js';
import { markCampaignSent, markCampaignFailed } from './index.js';

/**
 * Statuses a campaign cannot move out of. A batch reporting into one of these
 * is late, not wrong — the campaign ended while its work was still in flight.
 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['sent', 'failed', 'cancelled']);

export interface DispatchStart {
  orgId: string;
  campaignId: string;
  /** Recipients the splitter actually planned for — the audience it resolved. */
  plannedRecipients: number;
  /**
   * Batches it is about to enqueue for them, or null to arm no counter.
   *
   * Null used to be the A/B case, on the reasoning that an armed counter would
   * hit zero when the variant batches finished and declare the campaign sent
   * while the holdback had not gone out. The reasoning was right; leaving the
   * counter unarmed was the wrong answer to it, because then nothing counted
   * either phase. `awaitingAbWinner` is the right one: the batches are counted,
   * and zero means "phase one is done" rather than "the campaign is done".
   */
  batchCount: number | null;
  /**
   * A winner dispatch will add more batches to this counter later, so reaching
   * zero must not close the campaign.
   *
   * Set by the splitter for an A/B test with a holdback and a test window.
   * Cleared by the winner job when it adds the holdback's batches — see
   * `addWinnerPhase`.
   */
  awaitingAbWinner?: boolean;
}

/**
 * Arm the counter, before the first batch is enqueued.
 *
 * Order matters: a batch can finish while the splitter is still working, and a
 * completion that arrives before the counter exists would be lost. Setting it
 * first means every completion has something to decrement.
 *
 * Only sets the counter when there is none. A splitter job that is retried
 * re-runs this with the same total, and the batches from the first run may
 * already have decremented — overwriting would resurrect a send that is
 * partly over.
 */
export async function startDispatch(input: DispatchStart): Promise<void> {
  const scope = and(eq(campaigns.id, input.campaignId), eq(campaigns.orgId, input.orgId));

  if (input.batchCount === null) {
    await db
      .update(campaigns)
      .set({ plannedRecipients: input.plannedRecipients, updatedAt: new Date() })
      .where(scope);
    return;
  }

  await db
    .update(campaigns)
    .set({
      plannedRecipients: input.plannedRecipients,
      pendingBatches: input.batchCount,
      awaitingAbWinner: input.awaitingAbWinner ?? false,
      updatedAt: new Date(),
    })
    .where(and(scope, isNull(campaigns.pendingBatches)));
}

export interface WinnerPhaseStart {
  orgId: string;
  campaignId: string;
  /** Batches the winner job is about to enqueue for the holdback. */
  batchCount: number;
}

export type WinnerPhaseResult =
  | { armed: true; pending: number }
  | { armed: false; reason: 'not_awaiting'; pending: number | null };

/**
 * Add the winner dispatch's batches to the counter, and stop waiting for them.
 *
 * The second phase of an A/B send. Additive rather than a fresh counter,
 * because the two phases can overlap: the winner job fires on a timer, and a
 * variant batch that is still retrying — or one held by a paused campaign — has
 * not reported yet. A counter that was replaced rather than added to would
 * throw those away, and a campaign one report short never closes. Summed, it
 * does not matter which phase a batch belongs to; the last one out closes the
 * campaign, whichever phase it came from.
 *
 * `awaiting_ab_winner` is both the condition and the thing cleared, in one
 * statement. That is what makes this safe to replay: the second call finds the
 * flag already false and adds nothing. A BullMQ retry of the winner job after
 * `addBulk` has returned is exactly that second call.
 *
 * COALESCE covers the counter having been cleared: phase one reaching zero
 * leaves it at 0, but a campaign that was closed and reopened, or one whose
 * phase-one arming never happened, can present NULL. Adding to NULL would
 * yield NULL — a campaign with batches outstanding and no counter, which is
 * the stuck state this model exists to remove.
 */
export async function addWinnerPhase(input: WinnerPhaseStart): Promise<WinnerPhaseResult> {
  const [row] = await db
    .update(campaigns)
    .set({
      pendingBatches: sql`COALESCE(${campaigns.pendingBatches}, 0) + ${input.batchCount}`,
      awaitingAbWinner: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(campaigns.id, input.campaignId),
        eq(campaigns.orgId, input.orgId),
        eq(campaigns.awaitingAbWinner, true),
      ),
    )
    .returning({ pending: campaigns.pendingBatches });

  if (row) return { armed: true, pending: row.pending ?? input.batchCount };

  const [current] = await db
    .select({ pending: campaigns.pendingBatches })
    .from(campaigns)
    .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.orgId, input.orgId)))
    .limit(1);
  return { armed: false, reason: 'not_awaiting', pending: current?.pending ?? null };
}

export interface BatchCompletion {
  orgId: string;
  campaignId: string;
  dispatchId: string;
  batchKey: string;
  sent: number;
  skipped: number;
}

export type BatchCompletionResult =
  | { counted: false; reason: 'already_reported' | 'no_dispatch'; pending: number | null }
  | {
      counted: true;
      pending: number;
      closed: 'sent' | 'failed' | null;
      /** Zero reached, but a winner dispatch is still to come. */
      phase?: 'variants_done';
    };

/**
 * Record one batch's result and, if it was the last, close the campaign.
 *
 * Called on every terminal outcome of a batch-sender job — a clean run and a
 * run that exhausted its retries both land here. **A batch that fails without
 * reporting leaves the campaign in `sending` for good**, which is the single
 * most important line in this file: the failure path is not the exception, it
 * is half the reason the counter exists.
 */
export async function reportBatchCompletion(
  input: BatchCompletion,
): Promise<BatchCompletionResult> {
  // Marking the row complete and decrementing the counter have to happen
  // together. Marked-but-not-decremented is unrecoverable by replay — the
  // second report finds the row already complete and declines to count it.
  const outcome = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(campaignDispatchBatches)
      .set({
        completedAt: new Date(),
        sentCount: input.sent,
        skippedCount: input.skipped,
      })
      .where(
        and(
          eq(campaignDispatchBatches.campaignId, input.campaignId),
          eq(campaignDispatchBatches.dispatchId, input.dispatchId),
          eq(campaignDispatchBatches.batchKey, input.batchKey),
          // The idempotency hinge. A job re-run by stalled-job recovery reports
          // the same batch twice; only the write that finds it incomplete counts.
          isNull(campaignDispatchBatches.completedAt),
        ),
      )
      .returning({ id: campaignDispatchBatches.id });

    if (claimed.length === 0)
      return { counted: false as const, reason: 'already_reported' as const };

    // GREATEST guards the floor rather than trusting arithmetic: a counter that
    // went negative would never equal zero, and the campaign would never close.
    const [row] = await tx
      .update(campaigns)
      .set({
        pendingBatches: sql`GREATEST(${campaigns.pendingBatches} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(campaigns.id, input.campaignId),
          eq(campaigns.orgId, input.orgId),
          // No counter means no dispatch is being tracked — a campaign already
          // closed, or one whose arming never happened.
          //
          // A/B winner batches used to land here: the counter was NULL for the
          // whole of an A/B send, so every holdback batch was told
          // `no_dispatch` and closed nothing. They are counted now, in the same
          // counter as the variants that preceded them.
          sql`${campaigns.pendingBatches} IS NOT NULL`,
        ),
      )
      .returning({
        pending: campaigns.pendingBatches,
        awaitingAbWinner: campaigns.awaitingAbWinner,
      });

    if (!row) return { counted: false as const, reason: 'no_dispatch' as const };
    return {
      counted: true as const,
      pending: row.pending ?? 0,
      awaitingAbWinner: row.awaitingAbWinner,
    };
  });

  if (!outcome.counted) {
    return { counted: false, reason: outcome.reason, pending: null };
  }
  if (outcome.pending > 0) {
    return { counted: true, pending: outcome.pending, closed: null };
  }

  // Zero, but not the end. An A/B test's variants have finished and the winner
  // dispatch has not been added yet, so the send is half done — closing here
  // would report the campaign `sent` with its held-back contacts still waiting.
  // The campaign stays `sending` until the winner job adds its batches and the
  // last of those reports in.
  if (outcome.awaitingAbWinner) {
    console.info(
      `[dispatch] campaign ${input.campaignId}: every variant batch has reported and the ` +
        `campaign is waiting for its A/B winner dispatch. Not closing.`,
    );
    return { counted: true, pending: 0, closed: null, phase: 'variants_done' };
  }

  // Last one out. Decide from what the batches recorded, not from the campaign
  // row — the row is what we are about to write.
  //
  // Counted over the CAMPAIGN, not over the reporting batch's dispatch. An A/B
  // send has two dispatches — the splitter's variants and the winner job's
  // holdback — and the batch that closes it is always one of the second. Scoped
  // to that dispatch, a test whose variants reached forty thousand people and
  // whose holdback then failed outright would total zero and be reported
  // `failed`. The campaign is the unit the operator sees, so it is the unit the
  // total is taken over; this also brings the closing step into line with the
  // reaper and with ab-closing.ts, which have always counted this way.
  const [totals] = await db
    .select({
      sent: sql<number>`coalesce(sum(${campaignDispatchBatches.sentCount}), 0)::int`,
      batches: sql<number>`count(*)::int`,
    })
    .from(campaignDispatchBatches)
    .where(eq(campaignDispatchBatches.campaignId, input.campaignId));

  const totalSent = totals?.sent ?? 0;

  // The campaign may have been cancelled while its batches were still out. That
  // is an ordinary operator action — Pause, then Cancel — and it used to end
  // here in an exception: markCampaignSent ran validateTransition, cancelled →
  // sent is not a transition, and the worker got a 400 for reporting a batch it
  // had genuinely finished. Worse, the number of messages that did go out was
  // thrown away with it.
  //
  // So a terminal campaign is not a failure to close, it is a campaign that is
  // already closed. Nothing transitions, nothing throws — but the count is
  // still written, because those messages were really sent and the operator is
  // entitled to know how many went before the cancel took effect.
  const [current] = await db
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.orgId, input.orgId)))
    .limit(1);

  if (current && TERMINAL_STATUSES.has(current.status)) {
    await db
      .update(campaigns)
      .set({ totalSent, pendingBatches: null, updatedAt: new Date() })
      .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.orgId, input.orgId)));
    console.info(
      `[dispatch] campaign ${input.campaignId} was already ${current.status} when its last ` +
        `batch reported; recorded ${totalSent} sent and left the status alone`,
    );
    return { counted: true, pending: 0, closed: null };
  }

  if (totalSent > 0) {
    await markCampaignSent(input.orgId, input.campaignId, { totalSent });
    return { counted: true, pending: 0, closed: 'sent' };
  }

  await markCampaignFailed(
    input.orgId,
    input.campaignId,
    `all ${totals?.batches ?? 0} batches of this campaign reported, none sent ` +
      `(closed by dispatch ${input.dispatchId})`,
  );
  return { counted: true, pending: 0, closed: 'failed' };
}
