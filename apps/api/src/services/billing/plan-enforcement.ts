/**
 * Plan-tier enforcement helpers.
 *
 * Each function returns capacity info — caller decides whether to throw,
 * warn in response, or silently accept. We keep "soft enforcement"
 * (let the send happen but flag overage) separate from "hard enforcement"
 * (refuse to enqueue). Free plan is the only hard-stop tier; paid plans
 * accept overage and bill afterwards via Stripe metered usage.
 */
import { eq, sql, and, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  organizations,
  contacts,
  emailEvents,
  aiUsage,
  billingSubscriptions,
} from '../../db/schema/index.js';
import { SEND_PLANS, type SendPlanTier } from './plans.js';
import { CONTACT_PLANS, getAiQuotaPerDay, type ContactPlanTier } from './plans.js';
import { AppError } from '../../lib/app-error.js';

export interface PlanCapacity {
  plan: ContactPlanTier;
  /** Suspended via /superadmin/orgs/:id/suspend? */
  suspended: boolean;
  contacts: { current: number; limit: number; remaining: number; pctUsed: number };
  sends: { current: number; limit: number; remaining: number; pctUsed: number };
}

/**
 * Read current usage + plan limits for an org. Called by enforcement
 * functions and surfaced in UI banners ("you have 12% of contacts left").
 */
export async function getPlanCapacity(orgId: string): Promise<PlanCapacity> {
  const [org] = await db
    .select({
      plan: organizations.plan,
      billingType: organizations.billingType,
      monthlySendQuota: organizations.monthlySendQuota,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const plan = (org?.plan ?? 'free') as ContactPlanTier;
  const billingType = org?.billingType ?? 'contact_based';
  const planConfig = CONTACT_PLANS[plan] ?? CONTACT_PLANS.free;

  // Send-based plans override the send limit from the plan config
  let effectiveSendLimit: number = planConfig.sends;
  if (billingType === 'send_based') {
    effectiveSendLimit = org?.monthlySendQuota
      ?? (SEND_PLANS[plan as SendPlanTier]?.sendsPerMonth ?? planConfig.sends);
  }
  const suspended = (org?.settings as { suspended?: boolean })?.suspended === true;

  // Active contacts (not soft-deleted, not unsubscribed/bounced/complained).
  const [contactRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)));
  const contactCount = contactRow?.n ?? 0;

  // Sends in the current billing period.
  // Prefer Stripe's actual period start (billing_subscriptions); fall back to
  // calendar month start when no subscription exists (free plan / pre-Stripe).
  const [sub] = await db
    .select({ periodStart: billingSubscriptions.currentPeriodStart })
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.orgId, orgId))
    .limit(1);
  const periodStart: Date = sub?.periodStart ?? new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);

  const [sendRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.eventType, 'send'),
        sql`${emailEvents.createdAt} >= ${periodStart}`,
      ),
    );
  const sendCount = sendRow?.n ?? 0;

  const contactLimit = planConfig.contacts;
  const sendLimit = effectiveSendLimit;

  return {
    plan,
    suspended,
    contacts: {
      current: contactCount,
      limit: contactLimit,
      remaining: contactLimit < 0 ? Infinity : Math.max(0, contactLimit - contactCount),
      pctUsed: contactLimit > 0 ? (contactCount / contactLimit) * 100 : 0,
    },
    sends: {
      current: sendCount,
      limit: sendLimit,
      remaining: sendLimit < 0 ? Infinity : Math.max(0, sendLimit - sendCount),
      pctUsed: sendLimit > 0 ? (sendCount / sendLimit) * 100 : 0,
    },
  };
}

/**
 * Hard-stop check before adding new contacts. Throws on free plan when
 * the addition would exceed the cap. Paid plans get overage billing
 * (no throw), but we still surface the count back so the route can
 * include it in the response for UI banners.
 *
 * @param adding — how many contacts the caller wants to add (1 for single
 *   create, batch size for CSV import).
 */
export async function checkContactCapacity(orgId: string, adding = 1): Promise<PlanCapacity> {
  const cap = await getPlanCapacity(orgId);
  if (cap.suspended) {
    throw AppError.forbidden('Organization suspended — contact platform admin');
  }
  // Free plan only: refuse if would exceed.
  if (cap.plan === 'free' && cap.contacts.limit > 0) {
    if (cap.contacts.current + adding > cap.contacts.limit) {
      throw AppError.forbidden(
        `Free plan limit reached (${cap.contacts.limit} contacts). Upgrade to add more.`,
      );
    }
  }
  return cap;
}

/**
 * Same idea for sends. Hard-stop on free plan, soft on paid plans
 * (overage billed via Stripe metered usage in a later phase).
 */
export async function checkSendCapacity(orgId: string, adding = 1): Promise<PlanCapacity> {
  const cap = await getPlanCapacity(orgId);
  if (cap.suspended) {
    throw AppError.forbidden('Organization suspended — contact platform admin');
  }
  // Hard-stop for free plan
  if (cap.plan === 'free' && cap.sends.limit > 0) {
    if (cap.sends.current + adding > cap.sends.limit) {
      throw AppError.forbidden(
        `Free plan send limit reached (${cap.sends.limit}/mo). Upgrade or wait until next month.`,
      );
    }
  }
  // Block at 120% of quota for send-based plans to prevent runaway overage
  if (cap.plan !== 'free' && cap.sends.limit > 0 && cap.sends.current + adding > cap.sends.limit * 1.2) {
    throw AppError.forbidden(
      `Monthly send quota exceeded (${cap.sends.current}/${cap.sends.limit}). Upgrade your plan.`,
    );
  }
  return cap;
}

// ─── AI quota enforcement ──────────────────────────────────────────────────

export interface AiQuotaStatus {
  plan: ContactPlanTier;
  limitPerDay: number;
  used24h: number;
  remaining: number;
  pctUsed: number;
}

/**
 * Return the org's daily AI generation cap + how many they've burned in the
 * last 24h. Pure read — never throws on its own. Used by the dashboard
 * banner ("you've used 78% of today's AI quota") and by the enforcement
 * helper below.
 */
export async function getAiQuotaStatus(orgId: string): Promise<AiQuotaStatus> {
  const [org] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const plan = (org?.plan ?? 'free') as ContactPlanTier;
  const limitPerDay = getAiQuotaPerDay(plan);

  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.orgId, orgId),
        sql`${aiUsage.createdAt} >= NOW() - INTERVAL '24 hours'`,
      ),
    );
  const used24h = row?.n ?? 0;

  const remaining = Number.isFinite(limitPerDay)
    ? Math.max(0, limitPerDay - used24h)
    : Number.POSITIVE_INFINITY;
  const pctUsed = Number.isFinite(limitPerDay) && limitPerDay > 0
    ? (used24h / limitPerDay) * 100
    : 0;

  return { plan, limitPerDay, used24h, remaining, pctUsed };
}

/**
 * Throw 429 when the org has exceeded its plan's daily AI generation quota.
 * Call this BEFORE invoking the Claude API so the cost is never incurred
 * for over-quota requests.
 *
 * Wired into shared-ai callClaude through the rateLimiter adapter (set up
 * in apps/api/src/lib/ai-client.ts).
 */
export async function checkAiQuota(orgId: string): Promise<AiQuotaStatus> {
  const status = await getAiQuotaStatus(orgId);
  if (Number.isFinite(status.limitPerDay) && status.used24h >= status.limitPerDay) {
    throw AppError.tooManyRequests(
      `AI quota exceeded for plan "${status.plan}" — used ${status.used24h}/${status.limitPerDay} generations in the last 24h. Upgrade or wait.`,
    );
  }
  return status;
}
