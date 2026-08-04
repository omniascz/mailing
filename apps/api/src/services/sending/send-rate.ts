/**
 * Per-second send-rate limit (SES "max send rate"). A fixed-window counter in
 * Redis caps how many messages an org may enqueue per second. The rate comes
 * from the org's plan tier, overridable via settings.maxSendRate.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';
import { AppError } from '../../lib/app-error.js';

/** Default max send rate (messages/second) by plan tier. 0 = unlimited. */
export const PLAN_SEND_RATE: Record<string, number> = {
  free: 1,
  starter: 5,
  pro: 14,
  business: 50,
  enterprise: 0, // unlimited (custom infra)
};

/** Pure decision: would adding `cost` to `current` exceed the per-second limit? */
export function exceedsRate(current: number, cost: number, limitPerSec: number): boolean {
  if (limitPerSec <= 0) return false; // 0 = unlimited
  return current + cost > limitPerSec;
}

/** Resolve an org's per-second send rate (settings override → plan default). */
export async function getOrgSendRate(orgId: string): Promise<number> {
  const [org] = await db
    .select({ plan: organizations.plan, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return 0;
  const override = (org.settings as Record<string, unknown> | null)?.maxSendRate;
  if (typeof override === 'number' && override >= 0) return override;
  return PLAN_SEND_RATE[org.plan] ?? 0;
}

/**
 * Enforce the org's per-second send rate. Throws 429 when the current second's
 * window would be exceeded. `nowMs` injectable for tests. No-op when unlimited.
 */
export async function enforceSendRate(
  orgId: string,
  cost = 1,
  nowMs: number = Date.now(),
): Promise<void> {
  const limit = await getOrgSendRate(orgId);
  if (limit <= 0) return;

  const sec = Math.floor(nowMs / 1000);
  const key = `sendrate:${orgId}:${sec}`;
  const count = await redis.incrby(key, cost);
  if (count === cost) await redis.expire(key, 2);

  if (count > limit) {
    // Roll back our contribution so a rejected send doesn't consume budget.
    await redis.decrby(key, cost).catch(() => {});
    throw AppError.tooManyRequests(`Send rate limit exceeded (${limit}/sec) — retry shortly`);
  }
}
