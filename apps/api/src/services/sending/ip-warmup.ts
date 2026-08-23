/**
 * IP warmup scheduler.
 *
 * New sending IPs must be gradually ramped up to avoid ISP reputation damage.
 * This service:
 *   1. Defines the warmup schedule (daily volume caps by day of warmup)
 *   2. Tracks per-IP progress in the `warmup_ips` table
 *   3. Hands out daily capacity, one send at a time, atomically
 *   4. Advances the warmup day counter once per calendar day
 *
 * The counter lives in Postgres and nowhere else. There used to be three of
 * them — `warmup_ips.today_sent` that nothing wrote, `warmup:{ip}:sent:{date}`
 * in Redis written by this file, and `warmup:{ip}:today_sent` in Redis written
 * by the Go engine — so if enforcement had ever been switched on, each half
 * would have counted into its own and the real cap would have been double.
 *
 * Postgres rather than Redis, despite this being a hot-path counter, because
 * Redis runs with `--maxmemory-policy allkeys-lru` in both compose files: the
 * key is evictable, and a warmup counter that silently returns to zero lets a
 * cold IP send its whole daily allowance again. That is the exact reputation
 * damage warmup exists to prevent, so the failure has to be impossible rather
 * than unlikely. The cost is bounded by the thing it limits — at most 20 000
 * writes on the last day of the ramp, and none at all once the IP is warm.
 *
 * Warmup schedule (emails per day per IP):
 *   Days 1-3   →    50
 *   Days 4-7   →   200
 *   Days 8-14  →  1 000
 *   Days 15-21 →  5 000
 *   Days 22-30 → 20 000
 *   Days 30+   → unlimited (warm)
 */

import { db } from '../../db/client.js';
import { warmupIps } from '../../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface WarmupPhase {
  fromDay: number;
  toDay: number;
  dailyLimit: number;
  label: string;
}

export const WARMUP_SCHEDULE: WarmupPhase[] = [
  { fromDay: 1, toDay: 3, dailyLimit: 50, label: 'Phase 1 — Initial' },
  { fromDay: 4, toDay: 7, dailyLimit: 200, label: 'Phase 2 — Ramp-up' },
  { fromDay: 8, toDay: 14, dailyLimit: 1_000, label: 'Phase 3 — Growth' },
  { fromDay: 15, toDay: 21, dailyLimit: 5_000, label: 'Phase 4 — Acceleration' },
  { fromDay: 22, toDay: 30, dailyLimit: 20_000, label: 'Phase 5 — High volume' },
];

/** Day at which the IP is considered fully warmed up */
export const WARMUP_COMPLETE_DAY = 31;

/**
 * Get the daily send limit for a given warmup day.
 * Returns Infinity for days beyond the schedule (IP is warm).
 */
export function getDailyLimit(warmupDay: number): number {
  if (warmupDay >= WARMUP_COMPLETE_DAY) return Infinity;
  const phase = WARMUP_SCHEDULE.find((p) => warmupDay >= p.fromDay && warmupDay <= p.toDay);
  return phase?.dailyLimit ?? 50;
}

/**
 * Get the warmup phase label for a given day.
 */
export function getWarmupPhase(warmupDay: number): string {
  if (warmupDay >= WARMUP_COMPLETE_DAY) return 'Warm — Full capacity';
  const phase = WARMUP_SCHEDULE.find((p) => warmupDay >= p.fromDay && warmupDay <= p.toDay);
  return phase?.label ?? 'Phase 1 — Initial';
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface WarmupStatus {
  ipAddress: string;
  warmupDay: number;
  phase: string;
  dailyLimit: number;
  sentToday: number;
  remainingToday: number;
  isWarm: boolean;
}

/**
 * Start warmup tracking for a new IP.
 *
 * Day 1, not 0: the schedule's first phase is `fromDay: 1`, so a row left at
 * the column default of 0 falls through `WARMUP_SCHEDULE.find` and only gets a
 * limit from the `?? 50` fallback — the right number by luck. It also
 * disagreed with the Redis seed, which wrote 1.
 */
export async function startWarmup(ipAddress: string, orgId?: string): Promise<void> {
  await db
    .insert(warmupIps)
    .values({
      ipAddress,
      orgId: orgId ?? null,
      status: 'warming',
      warmupDay: 1,
      todaySent: 0,
      currentDate: todayString(),
    })
    .onConflictDoNothing();
}

/**
 * Claim one send's worth of daily capacity for `ipAddress`.
 *
 * Check and increment in a single statement, so two concurrent senders cannot
 * both read "49 of 50 used" and both go. The day rollover is folded in: when
 * `current_date` is stale the counter restarts at 1 for today rather than
 * needing a cron to have run first, which means a send just after midnight is
 * counted against the new day even if the advance job is late.
 *
 * A claim is spent by the *attempt*, not by a delivery. That is deliberate:
 * what a receiving ISP saw is a connection and a delivery attempt from this
 * IP, which is what warmup is rationing. It also errs toward sending less,
 * which is the safe direction for a ramp.
 *
 * Returns `allowed: false` when today's allowance is gone; the caller defers
 * the message rather than failing it. An unknown IP is allowed — an address
 * nobody registered for warmup is not being warmed up, and refusing mail from
 * it would be a surprising way to find that out.
 */
export interface WarmupClaim {
  allowed: boolean;
  known: boolean;
  warmupDay: number;
  dailyLimit: number;
  sentToday: number;
  isWarm: boolean;
}

export async function claimWarmupCapacity(ipAddress: string): Promise<WarmupClaim> {
  const today = todayString();

  // `current_date` is also a SQL function name, hence the quoting.
  const rows = await db.execute(sql`
    WITH current AS (
      SELECT
        ip_address,
        warmup_day,
        status,
        CASE WHEN "current_date" = ${today} THEN today_sent ELSE 0 END AS sent_today
      FROM warmup_ips
      WHERE ip_address = ${ipAddress}
      FOR UPDATE
    ), limits AS (
      SELECT
        c.*,
        CASE
          WHEN c.status = 'warm' OR c.warmup_day >= ${WARMUP_COMPLETE_DAY} THEN NULL
          WHEN c.warmup_day <= 3  THEN 50
          WHEN c.warmup_day <= 7  THEN 200
          WHEN c.warmup_day <= 14 THEN 1000
          WHEN c.warmup_day <= 21 THEN 5000
          WHEN c.warmup_day <= 30 THEN 20000
          ELSE NULL
        END AS daily_limit
      FROM current c
    )
    UPDATE warmup_ips w
       SET today_sent = l.sent_today + 1,
           "current_date" = ${today},
           updated_at = now()
      FROM limits l
     WHERE w.ip_address = l.ip_address
       AND (l.daily_limit IS NULL OR l.sent_today < l.daily_limit)
    RETURNING w.warmup_day AS warmup_day,
              w.today_sent AS today_sent,
              w.status AS status,
              l.daily_limit AS daily_limit
  `);

  const claimed = (rows as unknown as Array<Record<string, unknown>>)[0];
  if (claimed) {
    const limit = claimed.daily_limit === null ? Infinity : Number(claimed.daily_limit);
    return {
      allowed: true,
      known: true,
      warmupDay: Number(claimed.warmup_day),
      dailyLimit: limit,
      sentToday: Number(claimed.today_sent),
      isWarm: limit === Infinity,
    };
  }

  // Nothing updated: either the IP is unknown, or the allowance is spent.
  const [row] = await db
    .select()
    .from(warmupIps)
    .where(eq(warmupIps.ipAddress, ipAddress))
    .limit(1);

  if (!row) {
    return {
      allowed: true,
      known: false,
      warmupDay: 0,
      dailyLimit: Infinity,
      sentToday: 0,
      isWarm: true,
    };
  }

  const sentToday = row.currentDate === today ? row.todaySent : 0;
  const limit = getDailyLimit(row.warmupDay);
  return {
    allowed: false,
    known: true,
    warmupDay: row.warmupDay,
    dailyLimit: limit,
    sentToday,
    isWarm: limit === Infinity,
  };
}

/**
 * Advance the warmup day for an IP (called once per day by a cron job).
 * Should only run when the calendar date has changed since last advancement.
 *
 * @returns new warmup day, or null if IP is already warm
 */
export async function advanceWarmupDay(ipAddress: string): Promise<number | null> {
  const today = todayString();

  const [row] = await db
    .select()
    .from(warmupIps)
    .where(eq(warmupIps.ipAddress, ipAddress))
    .limit(1);

  if (!row) return null;
  if (row.status === 'warm') return null;
  if (row.currentDate === today) return null; // already advanced today

  const newDay = row.warmupDay + 1;
  const isWarm = newDay >= WARMUP_COMPLETE_DAY;

  await db
    .update(warmupIps)
    .set({
      warmupDay: newDay,
      currentDate: today,
      // New day, new allowance. claimWarmupCapacity also resets on a stale
      // date, so a send that beats this job to the new day is still counted
      // correctly — this just keeps the stored row tidy.
      todaySent: 0,
      status: isWarm ? 'warm' : 'warming',
      updatedAt: new Date(),
    })
    .where(eq(warmupIps.ipAddress, ipAddress));

  return newDay;
}

/**
 * Get warmup status for all IPs under an org.
 */
export async function listWarmupStatuses(orgId: string): Promise<WarmupStatus[]> {
  const rows = await db.select().from(warmupIps).where(eq(warmupIps.orgId, orgId));

  return Promise.all(
    rows.map(async (row) => {
      // Same counter the send path claims against — no second reading of a
      // different store that can disagree with it.
      const sentToday = row.currentDate === todayString() ? row.todaySent : 0;
      const warmupDay = row.warmupDay;
      const dailyLimit = getDailyLimit(warmupDay);
      const isWarm = row.status === 'warm';

      return {
        ipAddress: row.ipAddress,
        warmupDay,
        phase: getWarmupPhase(warmupDay),
        dailyLimit: isWarm ? -1 : dailyLimit,
        sentToday,
        remainingToday: isWarm ? -1 : Math.max(0, dailyLimit - sentToday),
        isWarm,
      };
    }),
  );
}
