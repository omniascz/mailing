/**
 * Billing plans service (#281) — per-send pricing tier.
 *
 * ForgeMsg supports two billing models:
 *   contact_based — monthly flat fee based on contact list size (existing model)
 *   send_based    — charged per X emails/SMS/messages sent, regardless of list size
 *   payg          — prepaid credit wallet, deducted per send (#282)
 *
 * Plans here cover the send_based model. The billingType is stored in
 * billing_subscriptions.billing_type (column added in migration 0043).
 */

export type BillingType = 'contact_based' | 'send_based' | 'payg';

// ─── Contact-based plans (existing) ──────────────────────────────────────────

export const CONTACT_PLANS = {
  free:       { name: 'Free',       contacts: 500,       sends: 2_500,       priceUsd: 0 },
  starter:    { name: 'Starter',    contacts: 2_500,     sends: 12_500,      priceUsd: 15 },
  pro:        { name: 'Pro',        contacts: 10_000,    sends: 50_000,      priceUsd: 49 },
  business:   { name: 'Business',   contacts: 50_000,    sends: 250_000,     priceUsd: 149 },
  enterprise: { name: 'Enterprise', contacts: -1,        sends: -1,          priceUsd: -1 },
} as const;

// ─── Send-based plans (#281) ──────────────────────────────────────────────────

export const SEND_PLANS = {
  send_lite:    { name: 'Send Lite',    sendsPerMonth: 10_000,    priceUsd: 9,   overageUsd: 0.0009  },
  send_starter: { name: 'Send Starter', sendsPerMonth: 50_000,    priceUsd: 25,  overageUsd: 0.0008  },
  send_growth:  { name: 'Send Growth',  sendsPerMonth: 200_000,   priceUsd: 75,  overageUsd: 0.0006  },
  send_pro:     { name: 'Send Pro',     sendsPerMonth: 1_000_000, priceUsd: 250, overageUsd: 0.00045 },
  send_custom:  { name: 'Send Custom',  sendsPerMonth: -1,        priceUsd: -1,  overageUsd: -1      },
} as const;

export type ContactPlanTier = keyof typeof CONTACT_PLANS;
export type SendPlanTier = keyof typeof SEND_PLANS;
export type PlanTier = ContactPlanTier | SendPlanTier;

// ─── Plan helpers ─────────────────────────────────────────────────────────────

export function listAllPlans() {
  const contactBased = Object.entries(CONTACT_PLANS).map(([tier, info]) => ({
    tier, billingType: 'contact_based' as BillingType, ...info,
  }));
  const sendBased = Object.entries(SEND_PLANS).map(([tier, info]) => ({
    tier, billingType: 'send_based' as BillingType, ...info,
    contacts: -1,
    sends: info.sendsPerMonth,
  }));
  return [...contactBased, ...sendBased];
}

export function getSendPlan(tier: string) {
  return (SEND_PLANS as Record<string, typeof SEND_PLANS[keyof typeof SEND_PLANS]>)[tier] ?? null;
}

export function getContactPlan(tier: string) {
  return (CONTACT_PLANS as Record<string, typeof CONTACT_PLANS[keyof typeof CONTACT_PLANS]>)[tier] ?? null;
}

// ─── Overage cost calculation ─────────────────────────────────────────────────

export function calculateOverageCost(tier: string, sendsUsed: number): number {
  const plan = getSendPlan(tier);
  if (!plan || plan.sendsPerMonth < 0) return 0;

  const overage = Math.max(0, sendsUsed - plan.sendsPerMonth);
  if (overage === 0 || plan.overageUsd < 0) return 0;

  return Number((overage * plan.overageUsd).toFixed(4));
}

// ─── Sends-included check ─────────────────────────────────────────────────────

export function isSendAllowed(
  billingType: BillingType,
  tier: string,
  sendsThisPeriod: number,
): boolean {
  if (billingType === 'payg') return true; // credit-based — checked separately
  if (billingType === 'send_based') {
    const plan = getSendPlan(tier);
    if (!plan) return false;
    if (plan.sendsPerMonth < 0) return true; // unlimited (custom/enterprise)
    return sendsThisPeriod < plan.sendsPerMonth; // overage still allowed but billed extra
  }
  // contact_based — existing logic elsewhere
  return true;
}
