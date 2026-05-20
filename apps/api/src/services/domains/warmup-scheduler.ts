/**
 * List warming / IP warmup scheduler (#220)
 *
 * Controls the gradual ramp-up of send volume for new sending domains and IPs.
 * On each send-batch, the scheduler is consulted to determine:
 *   1. Whether the domain/IP is still warming up
 *   2. How many emails can be sent today
 *   3. What percentage of the list to include per day
 *
 * Warmup schedule (industry-standard 30-day ramp):
 *   Day 1:   50  emails
 *   Day 2:   100
 *   Day 3:   200
 *   Day 5:   500
 *   Day 7:   1 000
 *   Day 10:  2 000
 *   Day 14:  5 000
 *   Day 21: 10 000
 *   Day 30: 50 000 (warm threshold — switch domain to 'warm')
 *
 * Domain warmup_status transitions:
 *   cold → warming (when first send occurs)
 *   warming → warm  (when warmupDay >= 30 AND todaySent >= quota)
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { sendingDomains, warmupIps } from '../../db/schema/index.js';

// ─── Warmup ramp table ────────────────────────────────────────────────────────

/** Returns the daily send quota for a given warmup day (1-indexed). */
export function getWarmupQuota(day: number): number {
  if (day <= 0) return 0;
  if (day === 1) return 50;
  if (day === 2) return 100;
  if (day === 3) return 200;
  if (day <= 5) return 500;
  if (day <= 7) return 1_000;
  if (day <= 10) return 2_000;
  if (day <= 14) return 5_000;
  if (day <= 21) return 10_000;
  if (day <= 30) return 50_000;
  return Infinity; // fully warm
}

/** Day at which a domain/IP is considered fully warm */
const WARM_THRESHOLD_DAY = 30;

// ─── Domain warmup ────────────────────────────────────────────────────────────

export interface DomainWarmupStatus {
  isWarming: boolean;
  warmupDay: number;
  dailyQuota: number;
  /** Recommended max percentage of list to send today (0–100) */
  listPercentage: number;
}

/**
 * Returns the warmup status for a sending domain.
 * Updates the domain's warmup_started_at if starting for the first time.
 */
export async function getDomainWarmupStatus(
  orgId: string,
  domainId: string,
): Promise<DomainWarmupStatus> {
  const [domain] = await db
    .select()
    .from(sendingDomains)
    .where(and(eq(sendingDomains.id, domainId), eq(sendingDomains.orgId, orgId)))
    .limit(1);

  if (!domain) {
    return { isWarming: false, warmupDay: 0, dailyQuota: Infinity, listPercentage: 100 };
  }

  if (domain.warmupStatus === 'warm') {
    return { isWarming: false, warmupDay: 99, dailyQuota: Infinity, listPercentage: 100 };
  }

  // Calculate current warmup day
  const startedAt = domain.warmupStartedAt ?? new Date();
  if (!domain.warmupStartedAt) {
    // First send — start warmup
    await db
      .update(sendingDomains)
      .set({ warmupStatus: 'warming', warmupStartedAt: new Date(), updatedAt: new Date() })
      .where(eq(sendingDomains.id, domainId));
  }

  const daysSinceStart = Math.floor((Date.now() - startedAt.getTime()) / 86_400_000) + 1;

  const warmupDay = Math.min(daysSinceStart, WARM_THRESHOLD_DAY + 1);
  const dailyQuota = getWarmupQuota(warmupDay);
  const isWarming = warmupDay <= WARM_THRESHOLD_DAY;

  // Promote to warm if past threshold
  if (!isWarming && domain.warmupStatus !== 'warm') {
    await db
      .update(sendingDomains)
      .set({ warmupStatus: 'warm', warmupCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(sendingDomains.id, domainId));
  }

  // List percentage: ramp from 1% on day 1 to 100% on day 30
  const listPercentage = isWarming
    ? Math.min(100, Math.round((warmupDay / WARM_THRESHOLD_DAY) * 100))
    : 100;

  return { isWarming, warmupDay, dailyQuota, listPercentage };
}

// ─── IP warmup ────────────────────────────────────────────────────────────────

export interface IpWarmupStatus {
  ipAddress: string;
  isWarming: boolean;
  warmupDay: number;
  remainingQuota: number;
}

const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

/**
 * Check remaining send quota for a warming IP.
 * Creates a warmup record if not found.
 */
export async function getIpWarmupStatus(orgId: string, ipAddress: string): Promise<IpWarmupStatus> {
  let [ip] = await db.select().from(warmupIps).where(eq(warmupIps.ipAddress, ipAddress)).limit(1);

  const currentDay = today();

  if (!ip) {
    // First use — start warming
    [ip] = await db
      .insert(warmupIps)
      .values({
        orgId,
        ipAddress,
        warmupDay: 1,
        todaySent: 0,
        currentDate: currentDay,
        status: 'warming',
      })
      .returning();
  }

  if (!ip) {
    return { ipAddress, isWarming: false, warmupDay: 0, remainingQuota: Infinity };
  }

  // Reset daily counter if it's a new day
  if (ip.currentDate !== currentDay) {
    const newDay = ip.warmupDay + 1;
    [ip] = await db
      .update(warmupIps)
      .set({ warmupDay: newDay, todaySent: 0, currentDate: currentDay, updatedAt: new Date() })
      .where(eq(warmupIps.ipAddress, ipAddress))
      .returning();
  }

  if (!ip) {
    return { ipAddress, isWarming: false, warmupDay: 0, remainingQuota: Infinity };
  }

  const isWarming = ip.status === 'warming';
  const quota = getWarmupQuota(ip.warmupDay);
  const remainingQuota = isWarming ? Math.max(0, quota - ip.todaySent) : Infinity;

  return { ipAddress, isWarming, warmupDay: ip.warmupDay, remainingQuota };
}

/**
 * Record that N emails were sent from a warming IP.
 * Promotes IP to 'warm' once the warmup threshold is reached.
 */
export async function recordIpSend(ipAddress: string, count: number): Promise<void> {
  const [ip] = await db.select().from(warmupIps).where(eq(warmupIps.ipAddress, ipAddress)).limit(1);

  if (!ip || ip.status !== 'warming') return;

  const newTodaySent = ip.todaySent + count;
  const newStatus =
    ip.warmupDay >= WARM_THRESHOLD_DAY && newTodaySent >= getWarmupQuota(ip.warmupDay)
      ? 'warm'
      : ip.status;

  await db
    .update(warmupIps)
    .set({ todaySent: newTodaySent, status: newStatus, updatedAt: new Date() })
    .where(eq(warmupIps.ipAddress, ipAddress));
}

// ─── Batch-sender integration ────────────────────────────────────────────────

/**
 * Returns the maximum number of contacts to include in a batch for a warming domain.
 * Designed to be called by batch-sender.ts before segmenting the contact list.
 *
 * @param totalContacts - Total contacts in the campaign list
 * @param domainId - Sending domain ID (can be null for non-warmup sends)
 */
export async function getWarmupBatchLimit(
  orgId: string,
  domainId: string | null,
  totalContacts: number,
): Promise<number> {
  if (!domainId) return totalContacts;

  const status = await getDomainWarmupStatus(orgId, domainId);
  if (!status.isWarming) return totalContacts;

  // Apply the smaller of: daily quota vs. list percentage
  const byQuota = status.dailyQuota;
  const byPercentage = Math.ceil(totalContacts * (status.listPercentage / 100));
  return Math.min(byQuota, byPercentage);
}
