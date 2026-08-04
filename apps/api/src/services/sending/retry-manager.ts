/**
 * Email send retry manager — exponential backoff per ISP.
 *
 * Retry schedule (delays between attempts):
 *   Attempt 1 (first retry):  1 min
 *   Attempt 2:                5 min
 *   Attempt 3:               30 min
 *   Attempt 4:                2 h
 *   Attempt 5:                8 h
 *   Attempt 6 (last):        24 h
 *   → After 6 retries: mark as permanently failed, move to dead-letter queue
 *
 * ISP-specific overrides:
 *   Gmail soft bounces get longer delays (Gmail penalises aggressive retries).
 *
 * Redis is used to track retry state:
 *   retry:{messageId}:count    — current retry attempt number
 *   retry:{messageId}:next_at  — Unix timestamp for next allowed retry
 *   retry:{messageId}:isp      — detected ISP for this message
 *
 * In production the actual retry execution is triggered by a BullMQ delayed job;
 * this service provides the scheduling logic and state tracking.
 */

import { redis } from '@forgemsg/shared/redis';
import type { IspName } from '@forgemsg/shared/sending/isp-throttle';

// ─── Schedule ─────────────────────────────────────────────────────────────────

/** Base delays in seconds (attempt index 1-6) */
const BASE_DELAYS_SECONDS: Record<number, number> = {
  1: 60, // 1 min
  2: 300, // 5 min
  3: 1_800, // 30 min
  4: 7_200, // 2 h
  5: 28_800, // 8 h
  6: 86_400, // 24 h
};

/** Gmail multiplier — 3x longer to avoid aggressive retry penalties */
const GMAIL_DELAY_MULTIPLIER = 3;

export const MAX_RETRY_ATTEMPTS = 6;

/** TTL for retry state keys — 2 days is enough to cover 6 retries */
const RETRY_STATE_TTL = 48 * 3600;

// ─── Redis key helpers ────────────────────────────────────────────────────────

const countKey = (msgId: string) => `retry:${msgId}:count`;
const nextAtKey = (msgId: string) => `retry:${msgId}:next_at`;
const ispKey = (msgId: string) => `retry:${msgId}:isp`;
const failKey = (msgId: string) => `retry:${msgId}:failed`;

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RetryState {
  messageId: string;
  attemptNumber: number;
  nextRetryAt: Date | null;
  nextRetryDelaySeconds: number | null;
  isp: IspName;
  isPermanentlyFailed: boolean;
}

/**
 * Schedule a retry for a failed send.
 *
 * Call this when the MTA receives a soft bounce or temp failure.
 *
 * @param messageId   Unique message ID (e.g. SMTP Message-ID header)
 * @param isp         Detected ISP for adaptive delay
 * @returns State after scheduling, or null if max retries exceeded → dead letter
 */
export async function scheduleRetry(
  messageId: string,
  isp: IspName = 'other',
): Promise<RetryState> {
  const currentCount = parseInt((await redis.get(countKey(messageId))) ?? '0', 10);
  const nextAttempt = currentCount + 1;

  if (nextAttempt > MAX_RETRY_ATTEMPTS) {
    await redis.set(failKey(messageId), '1', 'EX', RETRY_STATE_TTL);
    return {
      messageId,
      attemptNumber: currentCount,
      nextRetryAt: null,
      nextRetryDelaySeconds: null,
      isp,
      isPermanentlyFailed: true,
    };
  }

  const baseDelay = BASE_DELAYS_SECONDS[nextAttempt] ?? 86_400;
  const delay = isp === 'gmail' ? baseDelay * GMAIL_DELAY_MULTIPLIER : baseDelay;
  const nextAt = Math.floor(Date.now() / 1000) + delay;

  await redis
    .pipeline()
    .set(countKey(messageId), String(nextAttempt), 'EX', RETRY_STATE_TTL)
    .set(nextAtKey(messageId), String(nextAt), 'EX', RETRY_STATE_TTL)
    .set(ispKey(messageId), isp, 'EX', RETRY_STATE_TTL)
    .exec();

  return {
    messageId,
    attemptNumber: nextAttempt,
    nextRetryAt: new Date(nextAt * 1000),
    nextRetryDelaySeconds: delay,
    isp,
    isPermanentlyFailed: false,
  };
}

/**
 * Check whether a message is ready for its next retry attempt.
 *
 * @returns true if the scheduled delay has passed and the message can be retried
 */
export async function isReadyForRetry(messageId: string): Promise<boolean> {
  const [nextAtRaw, failedRaw] = await Promise.all([
    redis.get(nextAtKey(messageId)),
    redis.get(failKey(messageId)),
  ]);

  if (failedRaw) return false; // permanently failed
  if (!nextAtRaw) return false; // no retry scheduled

  const nextAt = parseInt(nextAtRaw, 10);
  return Math.floor(Date.now() / 1000) >= nextAt;
}

/**
 * Get the full retry state for a message.
 */
export async function getRetryState(messageId: string): Promise<RetryState> {
  const [countRaw, nextAtRaw, ispRaw, failedRaw] = await Promise.all([
    redis.get(countKey(messageId)),
    redis.get(nextAtKey(messageId)),
    redis.get(ispKey(messageId)),
    redis.get(failKey(messageId)),
  ]);

  const count = parseInt(countRaw ?? '0', 10);
  const nextAt = nextAtRaw ? parseInt(nextAtRaw, 10) : null;
  const isp = (ispRaw as IspName | null) ?? 'other';
  const isPermanentlyFailed = !!failedRaw;

  return {
    messageId,
    attemptNumber: count,
    nextRetryAt: nextAt ? new Date(nextAt * 1000) : null,
    nextRetryDelaySeconds: nextAt ? nextAt - Math.floor(Date.now() / 1000) : null,
    isp,
    isPermanentlyFailed,
  };
}

/**
 * Mark a message as permanently failed (dead letter) without going through all retries.
 * Used when a hard bounce is received during a retry attempt.
 */
export async function permanentlyFail(messageId: string): Promise<void> {
  await redis.set(failKey(messageId), '1', 'EX', RETRY_STATE_TTL);
}

/**
 * Clear retry state after successful delivery.
 */
export async function clearRetryState(messageId: string): Promise<void> {
  await redis.del(countKey(messageId), nextAtKey(messageId), ispKey(messageId), failKey(messageId));
}

/**
 * Calculate the delay for a given attempt number and ISP, without side effects.
 * Useful for UI display and test assertions.
 */
export function calculateRetryDelay(attemptNumber: number, isp: IspName = 'other'): number | null {
  if (attemptNumber > MAX_RETRY_ATTEMPTS) return null;
  const base = BASE_DELAYS_SECONDS[attemptNumber] ?? 86_400;
  return isp === 'gmail' ? base * GMAIL_DELAY_MULTIPLIER : base;
}
