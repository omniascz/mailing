/**
 * Quiet Hours — automatically pause sending outside acceptable hours.
 * The rule is org-scoped per channel; "all" applies to any unconfigured channel.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { quietHours, type QuietHours } from '../../db/schema/index.js';

export async function listRules(orgId: string): Promise<QuietHours[]> {
  return db.select().from(quietHours).where(eq(quietHours.orgId, orgId));
}

export async function getRule(orgId: string, channel: string): Promise<QuietHours | null> {
  const [exact] = await db.select().from(quietHours)
    .where(and(eq(quietHours.orgId, orgId), eq(quietHours.channel, channel))).limit(1);
  if (exact) return exact;
  const [fallback] = await db.select().from(quietHours)
    .where(and(eq(quietHours.orgId, orgId), eq(quietHours.channel, 'all'))).limit(1);
  return fallback ?? null;
}

export async function upsertRule(orgId: string, input: {
  channel?: string; startHour: number; endHour: number; timezone?: string; enabled?: boolean;
}): Promise<QuietHours> {
  const channel = input.channel ?? 'all';
  const existing = await db.select().from(quietHours)
    .where(and(eq(quietHours.orgId, orgId), eq(quietHours.channel, channel))).limit(1);

  if (existing.length > 0) {
    const [row] = await db.update(quietHours)
      .set({
        startHour: input.startHour, endHour: input.endHour,
        timezone: input.timezone ?? existing[0]!.timezone,
        enabled: input.enabled ?? existing[0]!.enabled,
        updatedAt: new Date(),
      })
      .where(eq(quietHours.id, existing[0]!.id))
      .returning();
    return row!;
  }
  const [row] = await db.insert(quietHours).values({
    orgId, channel,
    startHour: input.startHour, endHour: input.endHour,
    timezone: input.timezone ?? 'UTC',
    enabled: input.enabled ?? true,
  }).returning();
  return row!;
}

/** Computes the local hour at the given timezone for a moment in time. */
function hourInZone(at: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone });
    const parts = fmt.formatToParts(at);
    const h = parts.find((p) => p.type === 'hour')?.value;
    return h ? Number(h) % 24 : at.getUTCHours();
  } catch {
    return at.getUTCHours();
  }
}

export interface QuietCheckResult {
  inQuietHours: boolean;
  nextSendAt?: Date;
}

export async function isQuiet(orgId: string, channel: string, at: Date = new Date()): Promise<QuietCheckResult> {
  const rule = await getRule(orgId, channel);
  if (!rule || !rule.enabled) return { inQuietHours: false };

  const localHour = hourInZone(at, rule.timezone);
  // Quiet window may wrap midnight (e.g. 21 → 8).
  const inQuiet = rule.startHour <= rule.endHour
    ? localHour >= rule.startHour && localHour < rule.endHour
    : localHour >= rule.startHour || localHour < rule.endHour;

  if (!inQuiet) return { inQuietHours: false };

  // Compute next allowed send time = the next occurrence of `endHour` in the rule's tz.
  const minutesPastHour = at.getUTCMinutes();
  const utcHourNow = at.getUTCHours();
  const offsetHours = ((localHour - utcHourNow) + 24) % 24;
  const targetUtcHour = ((rule.endHour - offsetHours) + 24) % 24;
  const candidate = new Date(at);
  candidate.setUTCMinutes(0, 0, 0);
  candidate.setUTCHours(targetUtcHour);
  if (candidate.getTime() <= at.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  void minutesPastHour;
  return { inQuietHours: true, nextSendAt: candidate };
}
