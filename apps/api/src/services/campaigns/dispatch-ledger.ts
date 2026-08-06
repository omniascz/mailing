/**
 * The record of which batches a dispatch has already handed to batch-sender.
 *
 * See `campaign_dispatch_batches` for why the queue itself cannot serve as
 * that record. The two calls here are the whole protocol:
 *
 *   claimBatches(...)   → which of these keys should actually be enqueued
 *   confirmBatches(...) → addBulk returned, these are definitely in the queue
 *
 * Claim before enqueue, confirm after. A row that is claimed but never
 * confirmed is ambiguous — the worker may have died between the two — and
 * `claimBatches` deliberately hands those back to be enqueued again, because
 * the alternative is dropping a batch of contacts on the floor. The batch jobs
 * carry a deterministic jobId derived from the same key, so if the job really
 * did make it into the queue the duplicate add is ignored.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { campaignDispatchBatches } from '../../db/schema/campaign-dispatch-batches.js';

export interface ClaimResult {
  /** Keys the caller should enqueue. */
  toEnqueue: string[];
  /** Keys already confirmed by an earlier run — the caller must skip these. */
  alreadyEnqueued: string[];
}

/**
 * Reserve a set of batch keys for this dispatch.
 *
 * Insert-first with ON CONFLICT DO NOTHING, so two workers racing on the same
 * dispatch cannot both claim the same key — Postgres decides. Whatever comes
 * back from RETURNING is ours to enqueue; anything else we look up to see
 * whether an earlier run got as far as confirming it.
 */
export async function claimBatches(
  orgId: string,
  campaignId: string,
  dispatchId: string,
  keys: string[],
): Promise<ClaimResult> {
  if (keys.length === 0) return { toEnqueue: [], alreadyEnqueued: [] };

  const inserted = await db
    .insert(campaignDispatchBatches)
    .values(keys.map((batchKey) => ({ orgId, campaignId, dispatchId, batchKey })))
    .onConflictDoNothing({
      target: [campaignDispatchBatches.dispatchId, campaignDispatchBatches.batchKey],
    })
    .returning({ batchKey: campaignDispatchBatches.batchKey });

  const fresh = new Set(inserted.map((r) => r.batchKey));
  const contested = keys.filter((k) => !fresh.has(k));
  if (contested.length === 0) return { toEnqueue: keys, alreadyEnqueued: [] };

  // A contested key belongs to an earlier attempt. Only a confirmed one is
  // safe to skip; an unconfirmed one goes back out.
  const unconfirmed = await db
    .select({ batchKey: campaignDispatchBatches.batchKey })
    .from(campaignDispatchBatches)
    .where(
      and(
        eq(campaignDispatchBatches.dispatchId, dispatchId),
        inArray(campaignDispatchBatches.batchKey, contested),
        isNull(campaignDispatchBatches.enqueuedAt),
      ),
    );

  const retryable = new Set(unconfirmed.map((r) => r.batchKey));
  return {
    toEnqueue: keys.filter((k) => fresh.has(k) || retryable.has(k)),
    alreadyEnqueued: contested.filter((k) => !retryable.has(k)),
  };
}

/** Mark keys as definitely enqueued. Called once `addBulk` has returned. */
export async function confirmBatches(
  dispatchId: string,
  keys: string[],
  now: Date = new Date(),
): Promise<void> {
  if (keys.length === 0) return;
  await db
    .update(campaignDispatchBatches)
    .set({ enqueuedAt: now })
    .where(
      and(
        eq(campaignDispatchBatches.dispatchId, dispatchId),
        inArray(campaignDispatchBatches.batchKey, keys),
      ),
    );
}
