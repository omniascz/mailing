import { and, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { redis as defaultRedis } from '../../lib/redis.js';
import { db } from '../../db/client.js';
import {
  frequencySuppressions,
  orgFrequencyRules,
  type OrgFrequencyRule,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import {
  filterApplicableRules,
  isInQuietHours,
  type EngagementBand,
  type MessagePriority,
  type SuppressionReason,
} from './pure.js';

export type FrequencyChannel = 'email' | 'sms' | 'push' | 'whatsapp' | 'voice' | 'all';

export interface FrequencyCheckInput {
  orgId: string;
  contactId: string;
  channel: Exclude<FrequencyChannel, 'all'>;
  /** Marketing by default — pass 'transactional' for receipts so caps bypass when configured. */
  priority?: MessagePriority;
  /** Optional engagement band so band-scoped rules can apply. */
  band?: EngagementBand | null;
  now?: number; // ms epoch, override for tests
  /** When true (default), a denied result is logged to frequency_suppressions. */
  logSuppression?: boolean;
}

export interface FrequencyCheckResult {
  allowed: boolean;
  blockedBy: OrgFrequencyRule | null;
  currentCount: number;
  reason: SuppressionReason | null;
}

function freqKey(orgId: string, contactId: string, channel: FrequencyChannel): string {
  return `freq:${orgId}:${contactId}:${channel}`;
}

const RULE_TTL_SECONDS = 60;

async function getRulesForChannel(
  orgId: string,
  channel: Exclude<FrequencyChannel, 'all'>,
  redis: Redis,
): Promise<OrgFrequencyRule[]> {
  const cacheKey = `freq_rules:${orgId}`;
  const cached = await redis.get(cacheKey);
  let rules: OrgFrequencyRule[];
  if (cached) {
    rules = JSON.parse(cached) as OrgFrequencyRule[];
  } else {
    rules = (await db
      .select()
      .from(orgFrequencyRules)
      .where(eq(orgFrequencyRules.orgId, orgId))) as OrgFrequencyRule[];
    await redis.set(cacheKey, JSON.stringify(rules), 'EX', RULE_TTL_SECONDS);
  }
  return rules.filter((r) => r.channel === channel || r.channel === 'all');
}

/**
 * Check whether sending to a contact on a channel is allowed under the
 * org's frequency rules. Pure check — does NOT record the send.
 *
 * Uses a Redis sorted set per (org, contact, channel) keyed by send timestamp
 * so ZCOUNT(now - period, now) answers "how many sends in the window".
 */
export async function checkFrequencyCap(
  input: FrequencyCheckInput,
  redis: Redis = defaultRedis,
): Promise<FrequencyCheckResult> {
  const now = input.now ?? Date.now();
  const priority: MessagePriority = input.priority ?? 'marketing';
  const allRules = await getRulesForChannel(input.orgId, input.channel, redis);
  const rules = filterApplicableRules(allRules, input.channel, priority, input.band ?? null);

  if (rules.length === 0) {
    return { allowed: true, blockedBy: null, currentCount: 0, reason: null };
  }

  // 1. Quiet hours — any matching rule that is currently in its quiet
  //    window blocks the send, regardless of count. Suppression reason
  //    captures the distinction so reports can split "we hit the cap" vs
  //    "we waited politely".
  for (const rule of rules) {
    if (
      isInQuietHours({
        start: rule.quietHoursStart ?? null,
        end: rule.quietHoursEnd ?? null,
        timezone: rule.timezone ?? null,
        now: new Date(now),
      })
    ) {
      const result: FrequencyCheckResult = {
        allowed: false,
        blockedBy: rule,
        currentCount: 0,
        reason: 'quiet_hours',
      };
      if (input.logSuppression !== false) {
        await logSuppression(input, rule, 'quiet_hours', priority).catch(() => {});
      }
      return result;
    }
  }

  // 2. Count-based cap — check each rule against the window.
  for (const rule of rules) {
    const windowMs = rule.periodHours * 3600 * 1000;
    const min = now - windowMs;
    // Check both the channel-specific and the 'all' key.
    const channelsToCheck: FrequencyChannel[] = rule.channel === 'all' ? ['all'] : [input.channel];
    let count = 0;
    for (const ch of channelsToCheck) {
      const key = freqKey(input.orgId, input.contactId, ch);
      count += await redis.zcount(key, min, now);
    }
    if (count >= rule.maxCount) {
      const reason: SuppressionReason = rule.engagementBand ? 'band_locked' : 'cap_exceeded';
      const result: FrequencyCheckResult = {
        allowed: false,
        blockedBy: rule,
        currentCount: count,
        reason,
      };
      if (input.logSuppression !== false) {
        await logSuppression(input, rule, reason, priority).catch(() => {});
      }
      return result;
    }
  }

  return { allowed: true, blockedBy: null, currentCount: 0, reason: null };
}

async function logSuppression(
  input: FrequencyCheckInput,
  rule: OrgFrequencyRule,
  reason: SuppressionReason,
  priority: MessagePriority,
): Promise<void> {
  await db.insert(frequencySuppressions).values({
    orgId: input.orgId,
    contactId: input.contactId,
    channel: input.channel,
    reason,
    ruleId: rule.id,
    priority,
    metadata: {
      ruleChannel: rule.channel,
      maxCount: rule.maxCount,
      periodHours: rule.periodHours,
      ...(rule.engagementBand ? { engagementBand: rule.engagementBand } : {}),
    },
  });
}

/**
 * Record a send event against the sorted set. Call this AFTER a successful send
 * (or at least a successful hand-off to the MTA). Trims entries older than the
 * longest active rule to keep keys bounded.
 */
export async function recordSend(
  input: FrequencyCheckInput,
  redis: Redis = defaultRedis,
): Promise<void> {
  const now = input.now ?? Date.now();
  const channelKey = freqKey(input.orgId, input.contactId, input.channel);
  const allKey = freqKey(input.orgId, input.contactId, 'all');

  // Member must be unique per send; timestamp alone collides if two sends land
  // in the same ms. Append a short random suffix.
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  const rules = await getRulesForChannel(input.orgId, input.channel, redis);
  const maxWindowHours = rules.reduce((acc, r) => Math.max(acc, r.periodHours), 24);
  const cutoff = now - maxWindowHours * 3600 * 1000;
  const ttlSeconds = Math.max(maxWindowHours * 3600, 3600);

  const pipeline = redis.multi();
  pipeline.zadd(channelKey, now, member);
  pipeline.zremrangebyscore(channelKey, 0, cutoff);
  pipeline.expire(channelKey, ttlSeconds);
  pipeline.zadd(allKey, now, member);
  pipeline.zremrangebyscore(allKey, 0, cutoff);
  pipeline.expire(allKey, ttlSeconds);
  await pipeline.exec();
}

export async function invalidateRuleCache(orgId: string, redis: Redis = defaultRedis) {
  await redis.del(`freq_rules:${orgId}`);
}

// CRUD helpers

export async function listRules(orgId: string) {
  return db.select().from(orgFrequencyRules).where(eq(orgFrequencyRules.orgId, orgId));
}

export async function upsertRule(
  orgId: string,
  input: {
    channel: FrequencyChannel;
    maxCount: number;
    periodHours: number;
    quietHoursStart?: number | null;
    quietHoursEnd?: number | null;
    timezone?: string | null;
    engagementBand?: EngagementBand | null;
    priorityFloor?: MessagePriority | null;
  },
) {
  if (input.maxCount <= 0 || input.periodHours <= 0) {
    throw AppError.badRequest('maxCount and periodHours must be positive');
  }
  if (
    input.quietHoursStart !== null &&
    input.quietHoursStart !== undefined &&
    (input.quietHoursStart < 0 || input.quietHoursStart > 23)
  ) {
    throw AppError.badRequest('quietHoursStart must be 0..23');
  }
  if (
    input.quietHoursEnd !== null &&
    input.quietHoursEnd !== undefined &&
    (input.quietHoursEnd < 0 || input.quietHoursEnd > 23)
  ) {
    throw AppError.badRequest('quietHoursEnd must be 0..23');
  }
  const [row] = await db
    .insert(orgFrequencyRules)
    .values({ orgId, ...input })
    .onConflictDoUpdate({
      target: [orgFrequencyRules.orgId, orgFrequencyRules.channel],
      set: {
        maxCount: input.maxCount,
        periodHours: input.periodHours,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        timezone: input.timezone,
        engagementBand: input.engagementBand,
        priorityFloor: input.priorityFloor,
        updatedAt: new Date(),
      },
    })
    .returning();
  await invalidateRuleCache(orgId);
  return row;
}

export async function deleteRule(orgId: string, channel: FrequencyChannel) {
  const [row] = await db
    .delete(orgFrequencyRules)
    .where(and(eq(orgFrequencyRules.orgId, orgId), eq(orgFrequencyRules.channel, channel)))
    .returning();
  if (!row) throw AppError.notFound('Frequency rule');
  await invalidateRuleCache(orgId);
}
