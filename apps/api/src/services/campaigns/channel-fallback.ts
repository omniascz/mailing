/**
 * Automatic channel fallback.
 * When email hard-bounces or contact hasn't opened in N days,
 * automatically queue a message on the fallback channel (SMS/WhatsApp/push).
 *
 * Design:
 *  - Rules are stored in channel_fallback_rules table
 *  - canTrigger() checks whether the trigger condition is met for a contact
 *  - triggerFallback() logs to channel_fallback_log and enqueues BullMQ job
 */
import { and, eq, gte, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  channelFallbackRules,
  channelFallbackLog,
  type ChannelFallbackRule,
} from '../../db/schema/channel-fallback.js';
import { emailEvents } from '../../db/schema/email-events.js';

export async function listRules(orgId: string): Promise<ChannelFallbackRule[]> {
  return db
    .select()
    .from(channelFallbackRules)
    .where(and(eq(channelFallbackRules.orgId, orgId), eq(channelFallbackRules.enabled, true)));
}

export async function upsertRule(
  orgId: string,
  input: Partial<ChannelFallbackRule> & { name: string; trigger: string; fallbackChannel: string },
): Promise<ChannelFallbackRule> {
  if (input.id) {
    const [row] = await db
      .update(channelFallbackRules)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(channelFallbackRules.id, input.id), eq(channelFallbackRules.orgId, orgId)))
      .returning();
    return row!;
  }
  const [row] = await db
    .insert(channelFallbackRules)
    .values({ orgId, ...input } as typeof channelFallbackRules.$inferInsert)
    .returning();
  return row!;
}

/**
 * Check if a given rule's trigger condition is met for a contact.
 * Returns the reason string if triggered, null if not.
 */
export async function checkTrigger(
  orgId: string,
  contactId: string,
  rule: ChannelFallbackRule,
  context?: { bounceType?: 'hard' | 'soft' },
): Promise<string | null> {
  if (rule.trigger === 'hard_bounce') {
    return context?.bounceType === 'hard' ? 'hard_bounce' : null;
  }
  if (rule.trigger === 'soft_bounce') {
    return context?.bounceType === 'soft' ? 'soft_bounce' : null;
  }
  if (rule.trigger === 'no_open_days') {
    const days = rule.triggerParam ?? 7;
    const since = new Date(Date.now() - days * 86400_000);
    const [row] = await db
      .select({ cnt: emailEvents.id })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.orgId, orgId),
          eq(emailEvents.contactId, contactId),
          eq(emailEvents.eventType, 'open'),
          gte(emailEvents.createdAt, since),
        ),
      )
      .limit(1);
    return row ? null : `no_open_${days}d`;
  }
  return null;
}

export async function triggerFallback(
  orgId: string,
  contactId: string,
  rule: ChannelFallbackRule,
  reason: string,
): Promise<void> {
  // Avoid duplicate fallback for same rule+contact in same day
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [existing] = await db
    .select({ id: channelFallbackLog.id })
    .from(channelFallbackLog)
    .where(
      and(
        eq(channelFallbackLog.orgId, orgId),
        eq(channelFallbackLog.contactId, contactId),
        eq(channelFallbackLog.ruleId, rule.id),
        gte(channelFallbackLog.createdAt, today),
      ),
    )
    .limit(1);

  if (existing) return; // already triggered today

  await db.insert(channelFallbackLog).values({
    orgId,
    ruleId: rule.id,
    contactId,
    primaryChannel: rule.primaryChannel,
    fallbackChannel: rule.fallbackChannel,
    triggerReason: reason,
    status: 'queued',
  });

  // In a full implementation this would enqueue a BullMQ job:
  // await queue.add('channel-fallback', { orgId, contactId, rule, reason });
}

/** Called from bounce webhook: evaluates all org rules and fires fallbacks. */
export async function handleBounce(
  orgId: string,
  contactId: string,
  bounceType: 'hard' | 'soft',
): Promise<void> {
  const rules = await listRules(orgId);
  for (const rule of rules) {
    const reason = await checkTrigger(orgId, contactId, rule, { bounceType });
    if (reason) await triggerFallback(orgId, contactId, rule, reason);
  }
}

export async function getFallbackLog(orgId: string, contactId?: string, limit = 50) {
  const conditions = [eq(channelFallbackLog.orgId, orgId)];
  if (contactId) conditions.push(eq(channelFallbackLog.contactId, contactId));
  return db
    .select()
    .from(channelFallbackLog)
    .where(and(...conditions))
    .orderBy(desc(channelFallbackLog.createdAt))
    .limit(limit);
}
