/**
 * Usage alerts (SendGrid parity) — fire a webhook when an org's send or contact
 * usage crosses a percentage threshold of its plan limit. Each (metric,
 * threshold) fires at most once per billing period, deduped via Redis.
 */

import { redis } from '@forgemsg/shared/redis';
import { dispatchEvent } from '../webhooks/index.js';
import type { PlanCapacity } from './plan-enforcement.js';

export const DEFAULT_THRESHOLDS = [80, 95, 100] as const;

export interface UsageAlert {
  metric: 'sends' | 'contacts';
  threshold: number;
  pctUsed: number;
  current: number;
  limit: number;
}

/**
 * Pure: given usage percentages and the thresholds already fired this period,
 * return the alerts that should fire now (highest crossed threshold per metric,
 * not yet fired). Metrics with no limit (limit <= 0, i.e. unlimited) never fire.
 */
export function evaluateUsageAlerts(
  capacity: Pick<PlanCapacity, 'sends' | 'contacts'>,
  thresholds: readonly number[],
  alreadyFired: ReadonlySet<string>,
): UsageAlert[] {
  const out: UsageAlert[] = [];
  const metrics: Array<'sends' | 'contacts'> = ['sends', 'contacts'];
  const sorted = [...thresholds].sort((a, b) => b - a); // highest first

  for (const metric of metrics) {
    const m = capacity[metric];
    if (!m || m.limit <= 0) continue;
    for (const t of sorted) {
      if (m.pctUsed < t) continue;
      const key = `${metric}:${t}`;
      if (alreadyFired.has(key)) break; // highest already fired → nothing new below
      out.push({ metric, threshold: t, pctUsed: m.pctUsed, current: m.current, limit: m.limit });
      break; // only the highest newly-crossed threshold per metric
    }
  }
  return out;
}

/** Redis key for the set of thresholds already fired this billing period. */
function firedKey(orgId: string, period: string): string {
  return `usage-alert:${orgId}:${period}`;
}

/** Current billing period bucket (YYYY-MM) used to scope + expire dedupe state. */
export function billingPeriod(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Evaluate + fire any newly-crossed usage alerts for an org. Deduped per
 * billing period. Non-blocking-safe: callers may ignore the returned promise.
 * `now` is injectable for tests.
 */
export async function checkAndFireUsageAlerts(
  orgId: string,
  capacity: Pick<PlanCapacity, 'sends' | 'contacts'>,
  now: Date = new Date(),
): Promise<UsageAlert[]> {
  const period = billingPeriod(now);
  const key = firedKey(orgId, period);
  const firedList = await redis.smembers(key).catch(() => [] as string[]);
  const fired = new Set(firedList);

  const alerts = evaluateUsageAlerts(capacity, DEFAULT_THRESHOLDS, fired);
  if (alerts.length === 0) return [];

  for (const a of alerts) {
    await redis.sadd(key, `${a.metric}:${a.threshold}`).catch(() => {});
    // Expire the dedupe set ~40 days out so a new period starts clean.
    await redis.expire(key, 40 * 86400).catch(() => {});
    void dispatchEvent(orgId, 'usage.alert', {
      metric: a.metric,
      threshold: a.threshold,
      pctUsed: a.pctUsed,
      current: a.current,
      limit: a.limit,
    }).catch(() => {});
  }
  return alerts;
}
