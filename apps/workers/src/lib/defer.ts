/**
 * One way to put a message off until later.
 *
 * There were three. A retryable failure threw and let BullMQ's backoff decide.
 * The ISP throttle enqueued a *new* job with a delay — which resets
 * attemptsMade, so it had to copy the original job's attempts/backoff by hand
 * and carry its own counter (`throttleAttempts`) in the payload, because the
 * job it created had no memory of the one it replaced. The warmup daily cap
 * had no mechanism at all: it returned an error and fell into the retry path,
 * so a message over quota was retried for 31 minutes and then failed, when the
 * quota it was waiting on resets at midnight.
 *
 * `moveToDelayed` keeps the same job — same id, same attemptsMade, same
 * payload — and BullMQ marks the move with `skipAttempt: true`, so a planned
 * wait does not spend part of the retry allowance. Measured on bullmq 5.73.4:
 * three deferrals left attemptsMade at 0, and the three real failures that
 * followed took it 1 → 2 → 3 before the job was failed.
 *
 * Deferring is not failing, and the two now have separate accounting:
 *   retry        — something went wrong; attemptsMade counts it
 *   throttle     — the ISP's bucket is empty; capacity returns on a schedule
 *   warmup_quota — today's allowance for this IP is spent; it returns at
 *                  midnight UTC
 */
import type { Job } from 'bullmq';
import { DelayedError } from 'bullmq';

export type DeferReason = 'retry' | 'throttle' | 'warmup_quota';

/**
 * How many times this job has been deferred for a given reason.
 *
 * Deferrals deliberately do not consume attempts, so nothing in BullMQ bounds
 * them — the bound has to live somewhere, and it lives here, on the job's own
 * data. That is a different thing from the old `throttleAttempts`: that
 * existed because each deferral created a *new* job which had forgotten
 * everything, and it had to be threaded through by hand. This is one job
 * counting its own waits.
 */
export interface DeferralCounts {
  throttle?: number;
  warmup_quota?: number;
}

export function deferralCount(
  data: { deferrals?: DeferralCounts },
  reason: keyof DeferralCounts,
): number {
  return data.deferrals?.[reason] ?? 0;
}

/** Midnight UTC after `from` — when a per-day allowance resets. */
export function nextUtcMidnight(from: Date = new Date()): number {
  return Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1, 0, 0, 0, 0);
}

/**
 * Put `job` back to sleep until `untilMs`, then hand control back to BullMQ.
 *
 * Throws DelayedError, which is how a processor tells the worker "I did not
 * finish this and I did not fail it" — without it the worker would try to
 * complete a job it no longer owns. The throw is the return path, so callers
 * must not catch it.
 */
export async function defer(
  job: Job<{ deferrals?: DeferralCounts }>,
  token: string | undefined,
  reason: keyof DeferralCounts,
  untilMs: number,
): Promise<never> {
  const counts = { ...(job.data.deferrals ?? {}) };
  counts[reason] = (counts[reason] ?? 0) + 1;
  await job.updateData({ ...job.data, deferrals: counts });
  await job.moveToDelayed(untilMs, token);
  throw new DelayedError();
}
