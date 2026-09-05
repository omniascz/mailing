import { and, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { redis as defaultRedis } from '@forgemsg/shared/redis';
import { db } from '../../db/client.js';
import {
  frequencySuppressions,
  orgFrequencyRules,
  type OrgFrequencyRule,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import {
  filterApplicableRules,
  type EngagementBand,
  type MessagePriority,
  type SuppressionReason,
} from './pure.js';
import { isQuiet } from '../quiet-hours/index.js';

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
  /**
   * When the quiet window ends, for `reason: 'quiet_hours'` only.
   *
   * The caller needs it to park the send until morning instead of dropping it,
   * and computing it a second time at the call site would be the
   * two-implementations mistake #135 removed.
   */
  nextSendAt?: Date;
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
  // 1. Quiet hours, from `quiet_hours` — the ONE authority.
  //
  // This used to read `org_frequency_rules.quiet_hours_start/_end`, and those
  // columns could not be set by anyone: the Zod schema on
  // PUT /api/v1/frequency-rules accepts { channel, maxCount, periodHours } and
  // nothing else. Meanwhile `quiet_hours` — which HAS a PUT route and is what
  // the dashboard's /quiet-hours page displays — was read by no one on the
  // send path. The enforced setting was unreachable and the reachable setting
  // was unenforced, in the same product, for the same rule.
  //
  // It also runs BEFORE the rules are loaded, and that is a behaviour change
  // worth naming: the old check sat inside the per-rule loop, after an early
  // `rules.length === 0 → allowed`, so a quiet window only applied to an org
  // that had also configured a frequency cap. Nothing about "don't message my
  // customers at night" implies "and cap my volume".
  //
  // TRANSACTIONAL IS EXEMPT, and this line is a fix rather than a refinement.
  // #135 moved the quiet check above the rules, which also moved it above
  // `filterApplicableRules` — the function that applies `priorityFloor`. From
  // that commit until now a transactional message was held by quiet hours,
  // and `services/ticketing/seed-workflows.ts` ships send_sms nodes with
  // `priority: 'transactional'`, so verification codes and order
  // confirmations were being dropped overnight. A code that arrives eight
  // hours late is not a late message, it is a broken login.
  //
  // Same rule the email path settled on in #136: the transactional stream is
  // never held, because the person receiving it asked for it moments ago.
  const quiet =
    priority === 'transactional'
      ? { inQuietHours: false as const, nextSendAt: undefined }
      : await isQuiet(input.orgId, input.channel, new Date(now));
  if (quiet.inQuietHours) {
    const result: FrequencyCheckResult = {
      allowed: false,
      blockedBy: null,
      currentCount: 0,
      reason: 'quiet_hours',
      nextSendAt: quiet.nextSendAt,
    };
    // `blockedBy` is null because no frequency rule did this — the suppression
    // log takes the reason without one rather than attributing it to a cap
    // that may not exist.
    if (input.logSuppression !== false) {
      await logSuppression(input, null, 'quiet_hours', priority).catch(() => {});
    }
    return result;
  }

  const allRules = await getRulesForChannel(input.orgId, input.channel, redis);
  const rules = filterApplicableRules(allRules, input.channel, priority, input.band ?? null);

  if (rules.length === 0) {
    return { allowed: true, blockedBy: null, currentCount: 0, reason: null };
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
  /** null for a quiet-hours block: no frequency rule caused it. */
  rule: OrgFrequencyRule | null,
  reason: SuppressionReason,
  priority: MessagePriority,
): Promise<void> {
  await db.insert(frequencySuppressions).values({
    orgId: input.orgId,
    contactId: input.contactId,
    channel: input.channel,
    reason,
    ruleId: rule?.id ?? null,
    priority,
    metadata: rule
      ? {
          ruleChannel: rule.channel,
          maxCount: rule.maxCount,
          periodHours: rule.periodHours,
          ...(rule.engagementBand ? { engagementBand: rule.engagementBand } : {}),
        }
      : // Quiet hours are org-wide, not a property of any cap.
        { quietHours: true },
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
    engagementBand?: EngagementBand | null;
    priorityFloor?: MessagePriority | null;
  },
) {
  if (input.maxCount <= 0 || input.periodHours <= 0) {
    throw AppError.badRequest('maxCount and periodHours must be positive');
  }
  const [row] = await db
    .insert(orgFrequencyRules)
    .values({ orgId, ...input })
    .onConflictDoUpdate({
      target: [orgFrequencyRules.orgId, orgFrequencyRules.channel],
      set: {
        maxCount: input.maxCount,
        periodHours: input.periodHours,
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
