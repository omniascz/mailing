/**
 * IP warmup scheduler.
 *
 * New sending IPs must be gradually ramped up to avoid ISP reputation damage.
 * This service:
 *   1. Defines the warmup schedule (daily volume caps by day of warmup)
 *   2. Tracks per-IP progress in the `warmup_ips` DB table (Redis for fast checks)
 *   3. Distributes traffic between warm and cold IPs
 *   4. Advances the warmup day counter once per calendar day
 *
 * Warmup schedule (emails per day per IP):
 *   Days 1-3   →    50
 *   Days 4-7   →   200
 *   Days 8-14  →  1 000
 *   Days 15-21 →  5 000
 *   Days 22-30 → 20 000
 *   Days 30+   → unlimited (warm)
 */

import { redis } from '../../lib/redis.js';
import { db } from '../../db/client.js';
import { warmupIps } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface WarmupPhase {
  fromDay: number;
  toDay: number;
  dailyLimit: number;
  label: string;
}

export const WARMUP_SCHEDULE: WarmupPhase[] = [
  { fromDay: 1,  toDay: 3,   dailyLimit: 50,     label: 'Phase 1 — Initial' },
  { fromDay: 4,  toDay: 7,   dailyLimit: 200,     label: 'Phase 2 — Ramp-up' },
  { fromDay: 8,  toDay: 14,  dailyLimit: 1_000,   label: 'Phase 3 — Growth' },
  { fromDay: 15, toDay: 21,  dailyLimit: 5_000,   label: 'Phase 4 — Acceleration' },
  { fromDay: 22, toDay: 30,  dailyLimit: 20_000,  label: 'Phase 5 — High volume' },
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

// ─── Redis key helpers ────────────────────────────────────────────────────────

const todaySentKey = (ip: string) => `warmup:${ip}:sent:${todayString()}`;
const warmupDayKey = (ip: string) => `warmup:${ip}:day`;

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
 * Seeds Redis and inserts a DB row if not already present.
 */
export async function startWarmup(ipAddress: string, orgId?: string): Promise<void> {
  const today = todayString();

  await db
    .insert(warmupIps)
    .values({
      ipAddress,
      orgId: orgId ?? null,
      status: 'warming',
      currentDate: today,
    })
    .onConflictDoNothing();

  // Seed Redis
  await redis.set(warmupDayKey(ipAddress), '1', 'EX', 86_400 * 35);
  await redis.set(todaySentKey(ipAddress), '0', 'EX', 86_400);
}

/**
 * Check whether a send is allowed for this IP given its warmup state.
 * Increments the today_sent counter if allowed.
 */
export async function checkWarmupAllowance(
  ipAddress: string,
): Promise<{ allowed: boolean; status: WarmupStatus }> {
  // Fast path via Redis
  const dayRaw = await redis.get(warmupDayKey(ipAddress));
  const warmupDay = dayRaw ? parseInt(dayRaw, 10) : 1;
  const sentRaw = await redis.get(todaySentKey(ipAddress));
  const sentToday = sentRaw ? parseInt(sentRaw, 10) : 0;

  const dailyLimit = getDailyLimit(warmupDay);
  const isWarm = warmupDay >= WARMUP_COMPLETE_DAY;
  const allowed = isWarm || sentToday < dailyLimit;

  const status: WarmupStatus = {
    ipAddress,
    warmupDay,
    phase: getWarmupPhase(warmupDay),
    dailyLimit: isWarm ? -1 : dailyLimit, // -1 = unlimited
    sentToday,
    remainingToday: isWarm ? -1 : Math.max(0, dailyLimit - sentToday),
    isWarm,
  };

  if (allowed) {
    // Increment counter (TTL = rest of today UTC = seconds until midnight)
    const now = new Date();
    const secondsUntilMidnight =
      86_400 - (now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds());
    await redis.incr(todaySentKey(ipAddress));
    await redis.expire(todaySentKey(ipAddress), secondsUntilMidnight + 60);
  }

  return { allowed, status };
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
      status: isWarm ? 'warm' : 'warming',
      updatedAt: new Date(),
    })
    .where(eq(warmupIps.ipAddress, ipAddress));

  // Sync Redis
  await redis.set(warmupDayKey(ipAddress), String(newDay), 'EX', 86_400 * 35);
  // Reset today_sent counter for new day
  const secondsUntilMidnight = 86_400 - (new Date().getUTCSeconds() + new Date().getUTCMinutes() * 60 + new Date().getUTCHours() * 3600);
  await redis.set(todaySentKey(ipAddress), '0', 'EX', secondsUntilMidnight + 60);

  return newDay;
}

/**
 * Get warmup status for all IPs under an org.
 */
export async function listWarmupStatuses(orgId: string): Promise<WarmupStatus[]> {
  const rows = await db
    .select()
    .from(warmupIps)
    .where(eq(warmupIps.orgId, orgId));

  return Promise.all(
    rows.map(async (row) => {
      const sentRaw = await redis.get(todaySentKey(row.ipAddress));
      const sentToday = sentRaw ? parseInt(sentRaw, 10) : 0;
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
