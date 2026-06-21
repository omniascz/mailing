/**
 * Per-ISP sending throttle using Redis token buckets.
 *
 * Each ISP has:
 *   - A base hourly cap (emails/hour per sending IP)
 *   - Adaptive reduction: if the ISP returns 421/451 (throttle signal),
 *     the cap is halved for 30 minutes then gradually restored.
 *
 * Redis key schema:
 *   throttle:{orgId}:{isp}:{ip}:tokens       — current token count (DECR-based)
 *   throttle:{orgId}:{isp}:{ip}:reduced       — flag: rate is currently reduced (EX 1800)
 *   throttle:{orgId}:{isp}:{ip}:refill_ts     — timestamp of last refill window start
 */

import { redis } from '../../lib/redis.js';

// ─── ISP definitions ──────────────────────────────────────────────────────────
//
// CZ ISPs (Seznam, Volny, Centrum) get dedicated buckets. Without this they
// would fall into `other` and share its rate limit, which violates Seznam's
// observed throttle behavior (sub-5K/h triggers temp-defer). Limits below
// mirror RecommendedThrottle() in apps/engine/internal/email/headers.go.

export type IspName = 'gmail' | 'microsoft' | 'yahoo' | 'seznam' | 'volny' | 'centrum' | 'other';

interface IspConfig {
  /** Base hourly limit per sending IP */
  baseHourlyLimit: number;
  /** Domains that route to this ISP bucket */
  domains: string[];
}

const ISP_CONFIG: Record<IspName, IspConfig> = {
  gmail: {
    baseHourlyLimit: 500,
    domains: ['gmail.com', 'googlemail.com', 'google.com'],
  },
  microsoft: {
    baseHourlyLimit: 1000,
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.cz'],
  },
  yahoo: {
    baseHourlyLimit: 500,
    domains: ['yahoo.com', 'yahoo.co.uk', 'ymail.com', 'aol.com'],
  },
  seznam: {
    baseHourlyLimit: 5000,
    domains: ['seznam.cz', 'email.cz'],
  },
  volny: {
    baseHourlyLimit: 2000,
    domains: ['volny.cz'],
  },
  centrum: {
    baseHourlyLimit: 2000,
    domains: ['centrum.cz', 'post.cz'],
  },
  other: {
    baseHourlyLimit: 2000,
    domains: [],
  },
};

/** Per-org limit overrides (loaded from org settings at runtime) */
export interface OrgThrottleOverrides {
  [isp: string]: number; // e.g. { gmail: 2000, microsoft: 5000 }
}

// ─── ISP detection ────────────────────────────────────────────────────────────

/**
 * Detect which ISP bucket a recipient domain belongs to.
 */
export function detectIsp(recipientDomain: string): IspName {
  const lower = recipientDomain.toLowerCase();
  for (const [isp, cfg] of Object.entries(ISP_CONFIG) as [IspName, IspConfig][]) {
    if (cfg.domains.includes(lower)) return isp;
  }
  return 'other';
}

// ─── Token bucket operations ──────────────────────────────────────────────────

function tokenKey(orgId: string, isp: IspName, ip: string): string {
  return `throttle:${orgId}:${isp}:${ip}:tokens`;
}
function reducedKey(orgId: string, isp: IspName, ip: string): string {
  return `throttle:${orgId}:${isp}:${ip}:reduced`;
}

const WINDOW_SECONDS = 3600; // 1 hour

/**
 * Compute the effective hourly limit for an ISP, accounting for adaptive reduction
 * and optional org-level overrides.
 */
async function effectiveLimit(
  orgId: string,
  isp: IspName,
  ip: string,
  overrides?: OrgThrottleOverrides,
): Promise<number> {
  const base = overrides?.[isp] ?? ISP_CONFIG[isp].baseHourlyLimit;
  const isReduced = await redis.get(reducedKey(orgId, isp, ip));
  return isReduced ? Math.ceil(base / 2) : base;
}

/**
 * Check whether a send is allowed for this org + ISP + IP.
 *
 * Uses a sliding window token bucket:
 *   - On first call in the window, seeds the bucket with the hourly limit.
 *   - Each call decrements; when exhausted, returns `allowed: false`.
 *
 * @returns { allowed: boolean; remaining: number }
 */
export async function checkThrottle(
  orgId: string,
  recipientDomain: string,
  sendingIp: string,
  overrides?: OrgThrottleOverrides,
): Promise<{ allowed: boolean; remaining: number; isp: IspName }> {
  const isp = detectIsp(recipientDomain);
  const key = tokenKey(orgId, isp, sendingIp);
  const limit = await effectiveLimit(orgId, isp, sendingIp, overrides);

  // Atomic seed-or-decrement.
  // SET NX eliminates the TOCTOU race where two concurrent callers both see
  // EXISTS=false and both seed the bucket, doubling its effective capacity.
  const seeded = await redis.set(key, String(limit - 1), 'EX', WINDOW_SECONDS, 'NX');
  if (seeded !== null) {
    return { allowed: true, remaining: limit - 1, isp };
  }

  // Key exists — decrement and inspect.
  // DECR returns the value AFTER decrement; if it goes negative the window is
  // exhausted (concurrent sends may have raced past 0). Leave the negative
  // value in Redis — it decays with the window TTL and has no lasting effect.
  const tokens = await redis.decr(key);
  if (tokens < 0) {
    return { allowed: false, remaining: 0, isp };
  }
  return { allowed: true, remaining: tokens, isp };
}

/**
 * Record an ISP throttle signal (421 / 451 response from the MTA).
 * Reduces the effective rate for this org+ISP+IP for 30 minutes.
 *
 * Also logs to a counter so the system can detect persistent throttling.
 */
export async function recordThrottleSignal(
  orgId: string,
  isp: IspName,
  sendingIp: string,
): Promise<void> {
  const rKey = reducedKey(orgId, isp, sendingIp);
  await redis.set(rKey, '1', 'EX', 30 * 60); // 30-minute reduction window

  // Increment a signal counter (useful for alerting)
  const counterKey = `throttle:${orgId}:${isp}:${sendingIp}:signals`;
  await redis.incr(counterKey);
  await redis.expire(counterKey, 86_400); // count per day
}

/**
 * Get the current throttle state for an org (useful for monitoring dashboards).
 */
export async function getThrottleState(
  orgId: string,
  isp: IspName,
  sendingIp: string,
  overrides?: OrgThrottleOverrides,
): Promise<{
  isp: IspName;
  sendingIp: string;
  limit: number;
  remaining: number;
  isReduced: boolean;
}> {
  const limit = await effectiveLimit(orgId, isp, sendingIp, overrides);
  const key = tokenKey(orgId, isp, sendingIp);
  const raw = await redis.get(key);
  const remaining = raw !== null ? parseInt(raw, 10) : limit;
  const isReduced = !!(await redis.get(reducedKey(orgId, isp, sendingIp)));

  return { isp, sendingIp, limit, remaining, isReduced };
}

/**
 * Reset throttle counters for an ISP (admin action or after IP change).
 */
export async function resetThrottle(orgId: string, isp: IspName, sendingIp: string): Promise<void> {
  await redis.del(
    tokenKey(orgId, isp, sendingIp),
    reducedKey(orgId, isp, sendingIp),
    `throttle:${orgId}:${isp}:${sendingIp}:signals`,
  );
}
