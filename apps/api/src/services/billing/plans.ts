/**
 * Billing plans service.
 *
 * ForgeMsg supports three billing models:
 *   contact_based — monthly flat fee based on contact list size (Mailchimp-style)
 *   send_based    — charged per X emails/SMS/messages sent (Resend-style)
 *   payg          — prepaid credit wallet, deducted per send
 *
 * Each tier carries:
 *   • per-currency monthly prices (CZK, EUR, USD, GBP)
 *   • annual cycle at -20% so we can render the monthly-equivalent next to
 *     the monthly cycle in pricing tables
 *   • daily AI generation quota — protects against runaway Anthropic API
 *     cost from a single power-user on a cheap plan
 *
 * `priceUsd` / `overageUsd` are kept for backwards compat with the existing
 * Stripe webhook + billing code; new code should use the typed price
 * matrices via getPriceFor() / getOverageFor() / getAiQuotaPerDay().
 */

export type BillingType = 'contact_based' | 'send_based' | 'payg';

export type Currency = 'czk' | 'eur' | 'usd' | 'gbp';
export type BillingCycle = 'monthly' | 'annual';

/** -20% off when paying annually. Matches the marketing landing claim. */
export const ANNUAL_DISCOUNT_PCT = 20;

/** Per-currency price matrix. Values in display units (e.g. €49.00 → 49). */
export interface CurrencyMatrix {
  czk: number;
  eur: number;
  usd: number;
  gbp: number;
}

// ─── Contact-based plans (marketing automation tier) ─────────────────────────
//
// CZK is PPP-adjusted (~15% lower than straight FX conversion) so a CZ buyer
// doesn't see sticker shock. USD and GBP track EUR within ±10% then rounded
// to traditional psychological price points.

export const CONTACT_PLANS = {
  free: {
    name: 'Free',
    contacts: 500,
    sends: 2_500,
    priceUsd: 0,
    prices: { czk: 0, eur: 0, usd: 0, gbp: 0 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: 5,
    positioning: 'Lead magnet. 500 contacts + 2 500 sends with full AI features unlocked.',
  },
  starter: {
    name: 'Starter',
    contacts: 2_500,
    sends: 12_500,
    priceUsd: 15,
    prices: { czk: 349, eur: 14, usd: 15, gbp: 12 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: 25,
    positioning: 'Solo founders + side projects. Matches MailerLite Growing on price.',
  },
  pro: {
    name: 'Pro',
    contacts: 10_000,
    sends: 50_000,
    priceUsd: 49,
    prices: { czk: 1_190, eur: 49, usd: 49, gbp: 42 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: 250,
    positioning: 'Sweet spot for CZ e-shops. Half the price of Klaviyo Email at 10K.',
  },
  business: {
    name: 'Business',
    contacts: 50_000,
    sends: 250_000,
    priceUsd: 139,
    prices: { czk: 3_290, eur: 129, usd: 139, gbp: 112 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: 2_500,
    positioning: 'Mid-market. Dedicated IP + Voice Agent included; 5× cheaper than Klaviyo at 50K.',
  },
  enterprise: {
    name: 'Enterprise',
    contacts: -1,
    sends: -1,
    priceUsd: -1,
    prices: { czk: -1, eur: -1, usd: -1, gbp: -1 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: -1,
    positioning: 'Multi-region, SSO, SOC 2 SoC, dedicated CSM. Custom contract.',
  },
} as const;

// ─── Send-based plans (#281) ──────────────────────────────────────────────────
//
// Pricing positioned against Resend (their Pro tier is $20/month for 50K
// transactional emails). Our Send Starter matches that at $19, with the
// same overage rate, and our lower / upper tiers fill out the curve more
// granularly than Resend does.

export const SEND_PLANS = {
  send_lite: {
    name: 'Send Lite',
    sendsPerMonth: 10_000,
    priceUsd: 9,
    overageUsd: 0.0009,
    prices: { czk: 219, eur: 9, usd: 9, gbp: 8 } satisfies CurrencyMatrix,
    overage: { czk: 0.022, eur: 0.0009, usd: 0.001, gbp: 0.0008 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: 25,
    positioning: 'Hobby projects, MVP transactional volumes.',
  },
  send_starter: {
    name: 'Send Starter',
    sendsPerMonth: 50_000,
    priceUsd: 19, // undercuts Resend Pro at $20
    overageUsd: 0.0008,
    prices: { czk: 459, eur: 19, usd: 19, gbp: 16 } satisfies CurrencyMatrix,
    overage: { czk: 0.02, eur: 0.0008, usd: 0.00088, gbp: 0.0007 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: 100,
    positioning: 'Drop-in for Resend Pro. Same transactional ergonomics, plus marketing.',
  },
  send_growth: {
    name: 'Send Growth',
    sendsPerMonth: 200_000,
    priceUsd: 59,
    overageUsd: 0.0006,
    prices: { czk: 1_390, eur: 59, usd: 59, gbp: 50 } satisfies CurrencyMatrix,
    overage: { czk: 0.015, eur: 0.0006, usd: 0.00065, gbp: 0.0005 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: 500,
    positioning: 'SaaS startups outgrowing Resend Pro before Resend Business kicks in.',
  },
  send_pro: {
    name: 'Send Pro',
    sendsPerMonth: 1_000_000,
    priceUsd: 189,
    overageUsd: 0.00045,
    prices: { czk: 4_490, eur: 189, usd: 189, gbp: 159 } satisfies CurrencyMatrix,
    overage: { czk: 0.012, eur: 0.00045, usd: 0.0005, gbp: 0.00038 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: 2_500,
    positioning: 'High-volume product email — matches Resend Scale at lower per-email cost.',
  },
  send_custom: {
    name: 'Send Custom',
    sendsPerMonth: -1,
    priceUsd: -1,
    overageUsd: -1,
    prices: { czk: -1, eur: -1, usd: -1, gbp: -1 } satisfies CurrencyMatrix,
    overage: { czk: -1, eur: -1, usd: -1, gbp: -1 } satisfies CurrencyMatrix,
    aiGenerationsPerDay: -1,
    positioning: 'Enterprise volume — talk to sales for committed-use pricing.',
  },
} as const;

export type ContactPlanTier = keyof typeof CONTACT_PLANS;
export type SendPlanTier = keyof typeof SEND_PLANS;
export type PlanTier = ContactPlanTier | SendPlanTier;

// ─── Plan helpers ─────────────────────────────────────────────────────────────

export function listAllPlans() {
  const contactBased = Object.entries(CONTACT_PLANS).map(([tier, info]) => ({
    tier,
    billingType: 'contact_based' as BillingType,
    ...info,
  }));
  const sendBased = Object.entries(SEND_PLANS).map(([tier, info]) => ({
    tier,
    billingType: 'send_based' as BillingType,
    ...info,
    contacts: -1,
    sends: info.sendsPerMonth,
  }));
  return [...contactBased, ...sendBased];
}

export function getSendPlan(tier: string) {
  return (SEND_PLANS as Record<string, (typeof SEND_PLANS)[keyof typeof SEND_PLANS]>)[tier] ?? null;
}

export function getContactPlan(tier: string) {
  return (
    (CONTACT_PLANS as Record<string, (typeof CONTACT_PLANS)[keyof typeof CONTACT_PLANS]>)[tier] ??
    null
  );
}

// ─── Overage cost calculation ─────────────────────────────────────────────────

export function calculateOverageCost(
  tier: string,
  sendsUsed: number,
  currency: Currency = 'eur',
): number {
  const plan = getSendPlan(tier);
  if (!plan || plan.sendsPerMonth < 0) return 0;

  const overage = Math.max(0, sendsUsed - plan.sendsPerMonth);
  const rate = plan.overage[currency];
  if (overage === 0 || rate < 0) return 0;

  // 6 decimals so a small CZK rate (~0.02) on a few sends doesn't truncate.
  return Number((overage * rate).toFixed(6));
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

// ─── Multi-currency + annual helpers ───────────────────────────────────────

/**
 * Headline price for a tier in a given currency and billing cycle. Returns
 * null for tiers without published pricing (Enterprise, Send Custom).
 *
 * Annual pricing shows the monthly-equivalent (charged yearly upfront) so
 * the pricing table can render "€39/mo billed annually" cleanly next to
 * "€49/mo billed monthly".
 */
export function getPriceFor(
  tier: string,
  currency: Currency = 'eur',
  cycle: BillingCycle = 'monthly',
): number | null {
  const plan =
    (CONTACT_PLANS as Record<string, (typeof CONTACT_PLANS)[ContactPlanTier]>)[tier] ??
    (SEND_PLANS as Record<string, (typeof SEND_PLANS)[SendPlanTier]>)[tier];
  if (!plan) return null;
  const monthly = plan.prices[currency];
  if (monthly < 0) return null;
  if (cycle === 'annual') {
    return Math.round((monthly * (100 - ANNUAL_DISCOUNT_PCT)) / 100);
  }
  return monthly;
}

/**
 * Per-tier daily AI generation cap. Infinity for Enterprise / Send Custom.
 * Used by services/billing/plan-enforcement.checkAiQuota to throw 429
 * before a Claude call is made.
 */
export function getAiQuotaPerDay(tier: string): number {
  const plan =
    (CONTACT_PLANS as Record<string, (typeof CONTACT_PLANS)[ContactPlanTier]>)[tier] ??
    (SEND_PLANS as Record<string, (typeof SEND_PLANS)[SendPlanTier]>)[tier];
  if (!plan) return 0;
  const q = plan.aiGenerationsPerDay;
  return q < 0 ? Number.POSITIVE_INFINITY : q;
}

/**
 * Per-currency overage rate for a send-based plan. Returns null for
 * non-send-based tiers and for custom-priced plans.
 */
export function getOverageRate(tier: string, currency: Currency = 'eur'): number | null {
  const plan = getSendPlan(tier);
  if (!plan) return null;
  const rate = plan.overage[currency];
  return rate < 0 ? null : rate;
}
