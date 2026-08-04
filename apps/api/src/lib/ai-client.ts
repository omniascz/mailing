/**
 * Mailforge AI client — wraps @shared/ai-provider with project-specific
 * Redis cache, Drizzle usage tracking, and plan-based rate limiting.
 */

import { eq } from 'drizzle-orm';
import {
  createAiClient,
  createRateLimiter,
  cacheKey,
  parseJsonSafe,
  calculateCost,
  MODEL_COSTS,
  type CallClaudeOptions,
  type CallClaudeResult,
  type AiUsageRecord,
} from '@shared/ai-provider';
import { db } from '../db/client.js';
import { aiUsage, organizations } from '../db/schema/index.js';
import { redis } from '@forgemsg/shared/redis';
import { AppError } from './app-error.js';
import { CONTACT_PLANS, getAiQuotaPerDay } from '../services/billing/plans.js';

// ─── Re-exports for convenience ──────────────────────────────────────────────

export { cacheKey, parseJsonSafe, calculateCost, MODEL_COSTS };
export type { CallClaudeOptions, CallClaudeResult };

export const CACHE_TTL = 60 * 60 * 24; // 24h

export type AiFeature =
  | 'segment_from_description'
  | 'generate_email'
  | 'subject_lines'
  | 'brand_voice'
  | 'campaign_summary'
  | 'translate'
  | 'html_to_blocks'
  | 'product_scraper'
  | 'accessibility_check'
  | 'campaign_builder'
  | 'agent_run'
  | 'recommendations'
  | 'other';

// ─── Plan limits ─────────────────────────────────────────────────────────────
//
// Single source of truth lives in `services/billing/plans.ts` so the pricing
// page, dashboard quota banner, and rate-limiter never drift. -1 (Enterprise)
// becomes Infinity at the helper layer; rate-limiter expects a finite int so
// we clamp to a very large value that effectively never trips.

const PLAN_LIMITS: Record<string, number> = Object.fromEntries(
  Object.keys(CONTACT_PLANS).map((tier) => {
    const q = getAiQuotaPerDay(tier);
    return [tier, Number.isFinite(q) ? q : 1_000_000];
  }),
);

// ─── Usage tracker (Drizzle → ai_usage table) ───────────────────────────────

async function trackUsage(record: AiUsageRecord): Promise<void> {
  await db
    .insert(aiUsage)
    .values({
      orgId: record.tenantId,
      model: record.model,
      feature: record.feature as (typeof aiUsage.$inferInsert)['feature'],
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      costUsd: record.costUsd.toFixed(6),
      cached: record.cached ? 'true' : 'false',
    })
    .catch(() => {}); // fire-and-forget
}

// ─── Rate limiter ────────────────────────────────────────────────────────────

const rateLimiter = createRateLimiter({
  planLimits: PLAN_LIMITS,
  defaultLimit: PLAN_LIMITS.free ?? 5,
  cache: redis,
  async getPlan(tenantId: string): Promise<string> {
    const [org] = await db
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);
    return org?.plan ?? 'free';
  },
  createError({ feature, plan, limit, used }) {
    return new AppError({
      code: 'AI_RATE_LIMIT',
      message:
        `AI rate limit exceeded for ${feature}. Plan '${plan}' allows ${limit} calls/day. ` +
        `Used: ${used}/${limit}. Upgrade your plan for higher limits.`,
      statusCode: 429,
    });
  },
});

// ─── Configured client ───────────────────────────────────────────────────────

const { callClaude } = createAiClient({
  cache: redis,
  cacheTtlSec: CACHE_TTL,
  usageTracker: trackUsage,
  rateLimiter,
  maxRetries: 3,
});

export { callClaude };
