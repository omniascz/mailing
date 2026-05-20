/**
 * Smart Sending — frequency cap protecting contacts from message fatigue.
 *
 * Caller asks `canSend(orgId, contactId, channel)` before queuing each message.
 * If allowed, must call `recordSend(...)` after the actual send so the cap state stays current.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { smartSendingRules, contactSendLog, type SmartSendingRule } from '../../db/schema/index.js';

const DEFAULTS: Omit<SmartSendingRule, 'id' | 'orgId' | 'createdAt' | 'updatedAt'> = {
  channel: 'email',
  maxPerDay: 2,
  maxPerWeek: 7,
  cooldownHours: 16,
  enabled: true,
};

export async function getRule(orgId: string, channel: string): Promise<SmartSendingRule | null> {
  const [row] = await db
    .select()
    .from(smartSendingRules)
    .where(and(eq(smartSendingRules.orgId, orgId), eq(smartSendingRules.channel, channel)))
    .limit(1);
  return row ?? null;
}

export async function listRules(orgId: string): Promise<SmartSendingRule[]> {
  return db.select().from(smartSendingRules).where(eq(smartSendingRules.orgId, orgId));
}

export async function upsertRule(
  orgId: string,
  input: {
    channel: string;
    maxPerDay?: number;
    maxPerWeek?: number;
    cooldownHours?: number;
    enabled?: boolean;
  },
): Promise<SmartSendingRule> {
  const existing = await getRule(orgId, input.channel);
  if (existing) {
    const [row] = await db
      .update(smartSendingRules)
      .set({
        maxPerDay: input.maxPerDay ?? existing.maxPerDay,
        maxPerWeek: input.maxPerWeek ?? existing.maxPerWeek,
        cooldownHours: input.cooldownHours ?? existing.cooldownHours,
        enabled: input.enabled ?? existing.enabled,
        updatedAt: new Date(),
      })
      .where(eq(smartSendingRules.id, existing.id))
      .returning();
    return row!;
  }
  const [row] = await db
    .insert(smartSendingRules)
    .values({
      orgId,
      channel: input.channel,
      maxPerDay: input.maxPerDay ?? DEFAULTS.maxPerDay,
      maxPerWeek: input.maxPerWeek ?? DEFAULTS.maxPerWeek,
      cooldownHours: input.cooldownHours ?? DEFAULTS.cooldownHours,
      enabled: input.enabled ?? true,
    })
    .returning();
  return row!;
}

export interface CanSendResult {
  allowed: boolean;
  reason?: 'cooldown' | 'daily_cap' | 'weekly_cap';
  retryAfterMs?: number;
}

export async function canSend(
  orgId: string,
  contactId: string,
  channel: string,
): Promise<CanSendResult> {
  const rule = (await getRule(orgId, channel)) ?? { ...DEFAULTS, channel };
  if (!rule.enabled) return { allowed: true };

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const cooldownAgo = new Date(now.getTime() - rule.cooldownHours * 3_600_000);

  const [counts] = (await db.execute<{ day: string; week: string; last_sent: Date | null }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE sent_at >= ${dayAgo})::text  AS day,
      COUNT(*) FILTER (WHERE sent_at >= ${weekAgo})::text AS week,
      MAX(sent_at) FILTER (WHERE sent_at >= ${cooldownAgo}) AS last_sent
    FROM contact_send_log
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid AND channel = ${channel}
  `)) as unknown as Array<{ day: string; week: string; last_sent: Date | null }>;

  const dayCount = Number(counts?.day ?? 0);
  const weekCount = Number(counts?.week ?? 0);
  const lastSent = counts?.last_sent;

  if (lastSent) {
    const ms = rule.cooldownHours * 3_600_000 - (now.getTime() - new Date(lastSent).getTime());
    if (ms > 0) return { allowed: false, reason: 'cooldown', retryAfterMs: ms };
  }
  if (dayCount >= rule.maxPerDay)
    return { allowed: false, reason: 'daily_cap', retryAfterMs: 86_400_000 };
  if (weekCount >= rule.maxPerWeek)
    return { allowed: false, reason: 'weekly_cap', retryAfterMs: 7 * 86_400_000 };
  return { allowed: true };
}

export async function recordSend(orgId: string, contactId: string, channel: string): Promise<void> {
  await db.insert(contactSendLog).values({ orgId, contactId, channel });
}

/** Garbage-collect log rows older than 30 days. */
export async function pruneSendLog(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const res = await db.delete(contactSendLog).where(gte(contactSendLog.sentAt, cutoff));
  return { deleted: (res as unknown as { rowCount?: number }).rowCount ?? 0 };
}
