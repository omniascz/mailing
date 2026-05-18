/**
 * Smart channel selector (task 5.6).
 *
 * Analyzes a contact's engagement history across channels and picks the
 * channel most likely to produce a positive outcome.
 *
 * Decision logic (rules-based, fast path):
 *   1. email open-rate > 30 % → email
 *   2. sms open-rate  > 80 % → sms
 *   3. has push token         → push
 *   4. fallback               → email
 *
 * Optional enhancement: when `useAi` is true, Claude Haiku supplements
 * the rules with a one-sentence reasoning string.
 */

import { and, eq, count, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/index.js';
import { redis } from '../../lib/redis.js';

export type Channel = 'email' | 'sms' | 'push' | 'whatsapp' | 'in_app';

export interface ChannelStats {
  emailSends: number;
  emailOpens: number;
  emailOpenRate: number;
  smsSends: number;
  smsReplies: number;
  smsOpenRate: number;
  hasPushToken: boolean;
}

export interface SmartChannelResult {
  channel: Channel;
  confidence: number;   // 0-1
  reason: string;
  stats: ChannelStats;
}

// ─── Stats gathering ──────────────────────────────────────────────────────────

async function getContactChannelStats(
  contactId: string,
  orgId: string,
  withinDays = 90,
): Promise<ChannelStats> {
  const since = new Date(Date.now() - withinDays * 86_400_000);

  // Email sends + opens (from email_events table)
  const emailRows = await db
    .select({
      eventType: emailEvents.eventType,
      cnt: count(),
    })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.contactId, contactId),
        eq(emailEvents.orgId, orgId),
        sql`${emailEvents.createdAt} >= ${since}`,
      ),
    )
    .groupBy(emailEvents.eventType);

  const emailSends = emailRows.find((r) => r.eventType === 'send')?.cnt ?? 0;
  const emailOpens = emailRows.find((r) => r.eventType === 'open')?.cnt ?? 0;
  const emailOpenRate = emailSends > 0 ? (Number(emailOpens) / Number(emailSends)) : 0;

  // Push token presence: check Redis key set by push adapter
  const pushKey = `push:token:${contactId}`;
  const hasPushToken = !!(await redis.get(pushKey));

  // SMS stats: placeholder — real impl would query sms_events table
  const smsSends = 0;
  const smsReplies = 0;
  const smsOpenRate = 0;

  return {
    emailSends: Number(emailSends),
    emailOpens: Number(emailOpens),
    emailOpenRate,
    smsSends,
    smsReplies,
    smsOpenRate,
    hasPushToken,
  };
}

// ─── Rules-based selector ─────────────────────────────────────────────────────

function rulesBasedSelect(stats: ChannelStats, preferred?: Channel): SmartChannelResult {
  // Explicit preference overrides if confidence is high enough
  if (preferred === 'email' && stats.emailOpenRate > 0.1) {
    return {
      channel: 'email',
      confidence: stats.emailOpenRate,
      reason: 'Preferred channel with acceptable open rate',
      stats,
    };
  }

  if (stats.emailOpenRate > 0.3) {
    return {
      channel: 'email',
      confidence: Math.min(stats.emailOpenRate, 1),
      reason: `Email open rate ${(stats.emailOpenRate * 100).toFixed(0)}% exceeds 30% threshold`,
      stats,
    };
  }

  if (stats.smsOpenRate > 0.8) {
    return {
      channel: 'sms',
      confidence: stats.smsOpenRate,
      reason: `SMS open rate ${(stats.smsOpenRate * 100).toFixed(0)}% exceeds 80% threshold`,
      stats,
    };
  }

  if (stats.hasPushToken) {
    return {
      channel: 'push',
      confidence: 0.5,
      reason: 'Contact has push notification token and email engagement is low',
      stats,
    };
  }

  // Fallback: email is universally available
  return {
    channel: 'email',
    confidence: 0.3,
    reason: 'Default fallback — no strong channel preference detected',
    stats,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Selects the best sending channel for a contact.
 *
 * @param contactId  Target contact UUID
 * @param orgId      Organization UUID
 * @param preferred  Optional caller preference (overridden by strong data)
 * @param useAi      When true, augment decision with Claude Haiku explanation
 */
export async function selectBestChannel(
  contactId: string,
  orgId: string,
  preferred?: Channel,
  useAi = false,
): Promise<SmartChannelResult> {
  const cacheKey = `smart-channel:${contactId}:${orgId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as SmartChannelResult;
    } catch {
      // ignore malformed cache
    }
  }

  const stats = await getContactChannelStats(contactId, orgId);
  const result = rulesBasedSelect(stats, preferred);

  if (useAi) {
    try {
      const { callClaude } = await import('../../lib/ai-client.js');
      const aiResult = await callClaude({
        tenantId: orgId,
        feature: 'other',
        model: 'claude-haiku-4-5-20251001',
        system: 'You are a marketing channel optimization expert. Respond with JSON only.',
        user: `Select the best marketing channel for this contact. Stats: ${JSON.stringify(stats)}. Current selection: ${result.channel}.
Respond with: {"channel": "email|sms|push|whatsapp", "confidence": 0.0-1.0, "reason": "one sentence"}`,
        maxTokens: 150,
      });

      const parsed = JSON.parse(aiResult.text.replace(/```json\n?|\n?```/g, '').trim()) as {
        channel?: Channel;
        confidence?: number;
        reason?: string;
      };

      if (parsed.channel) {
        result.channel = parsed.channel;
        result.confidence = parsed.confidence ?? result.confidence;
        result.reason = parsed.reason ?? result.reason;
      }
    } catch {
      // AI enhancement is optional — keep rules-based result on failure
    }
  }

  // Cache for 15 minutes (engagement data changes slowly)
  await redis.setex(cacheKey, 900, JSON.stringify(result));

  return result;
}
