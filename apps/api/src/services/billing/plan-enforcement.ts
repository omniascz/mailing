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
import { organizations, contacts, emailEvents } from '../../db/schema/index.js';
import { CONTACT_PLANS, type ContactPlanTier } from './plans.js';
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
    .select({ plan: organizations.plan, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const plan = (org?.plan ?? 'free') as ContactPlanTier;
  const planConfig = CONTACT_PLANS[plan] ?? CONTACT_PLANS.free;
  const suspended = (org?.settings as { suspended?: boolean })?.suspended === true;

  // Active contacts (not soft-deleted, not unsubscribed/bounced/complained).
  const [contactRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)));
  const contactCount = contactRow?.n ?? 0;

  // Sends in the current billing month (calendar month for now; tie to
  // billing_subscriptions.current_period_start once Stripe is configured).
  const [sendRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.orgId, orgId),
        eq(emailEvents.eventType, 'send'),
        sql`${emailEvents.createdAt} >= DATE_TRUNC('month', NOW())`,
      ),
    );
  const sendCount = sendRow?.n ?? 0;

  const contactLimit = planConfig.contacts;
  const sendLimit = planConfig.sends;

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
  if (cap.plan === 'free' && cap.sends.limit > 0) {
    if (cap.sends.current + adding > cap.sends.limit) {
      throw AppError.forbidden(
        `Free plan send limit reached (${cap.sends.limit}/mo). Upgrade or wait until next month.`,
      );
    }
  }
  return cap;
}
