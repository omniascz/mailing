import { describe, it, expect } from 'vitest';
import {
  ANNUAL_DISCOUNT_PCT,
  CONTACT_PLANS,
  SEND_PLANS,
  calculateOverageCost,
  getAiQuotaPerDay,
  getContactPlan,
  getOverageRate,
  getPriceFor,
  getSendPlan,
  isSendAllowed,
  listAllPlans,
} from './plans.js';
import { validateBillingCurrency } from './currency.js';

describe('CONTACT_PLANS schema', () => {
  it('every tier has a complete CZK/EUR/USD/GBP matrix', () => {
    for (const [tier, info] of Object.entries(CONTACT_PLANS)) {
      const { prices } = info;
      expect(prices.czk, `${tier}.czk`).toBeTypeOf('number');
      expect(prices.eur, `${tier}.eur`).toBeTypeOf('number');
      expect(prices.usd, `${tier}.usd`).toBeTypeOf('number');
      expect(prices.gbp, `${tier}.gbp`).toBeTypeOf('number');
    }
  });

  it('every tier publishes an AI generation quota', () => {
    for (const [tier, info] of Object.entries(CONTACT_PLANS)) {
      expect(info.aiGenerationsPerDay, `${tier} aiGenerationsPerDay`).toBeTypeOf('number');
    }
  });

  it('AI quotas scale monotonically across paid tiers', () => {
    expect(CONTACT_PLANS.starter.aiGenerationsPerDay).toBeGreaterThan(
      CONTACT_PLANS.free.aiGenerationsPerDay,
    );
    expect(CONTACT_PLANS.pro.aiGenerationsPerDay).toBeGreaterThan(
      CONTACT_PLANS.starter.aiGenerationsPerDay,
    );
    expect(CONTACT_PLANS.business.aiGenerationsPerDay).toBeGreaterThan(
      CONTACT_PLANS.pro.aiGenerationsPerDay,
    );
  });

  it('Enterprise is custom-priced and unlimited AI', () => {
    expect(CONTACT_PLANS.enterprise.aiGenerationsPerDay).toBe(-1);
    expect(CONTACT_PLANS.enterprise.prices.eur).toBe(-1);
  });

  it('CZK is PPP-adjusted, not raw FX (under EUR × 25)', () => {
    // Sanity: 14 EUR × 25 = 350 CZK; we publish 349 (rounded clean).
    expect(CONTACT_PLANS.starter.prices.czk).toBeLessThan(
      CONTACT_PLANS.starter.prices.eur * 25,
    );
    // Pro: 49 × 25 = 1225, we publish 1190.
    expect(CONTACT_PLANS.pro.prices.czk).toBeLessThan(
      CONTACT_PLANS.pro.prices.eur * 25,
    );
  });
});

describe('SEND_PLANS schema', () => {
  it('Send Starter undercuts Resend Pro ($20) at 50K emails', () => {
    expect(SEND_PLANS.send_starter.prices.usd).toBeLessThan(20);
    expect(SEND_PLANS.send_starter.sendsPerMonth).toBe(50_000);
  });

  it('every tier carries an overage matrix per currency', () => {
    for (const [tier, info] of Object.entries(SEND_PLANS)) {
      expect(info.overage.czk, `${tier}.overage.czk`).toBeTypeOf('number');
      expect(info.overage.eur, `${tier}.overage.eur`).toBeTypeOf('number');
      expect(info.overage.usd, `${tier}.overage.usd`).toBeTypeOf('number');
      expect(info.overage.gbp, `${tier}.overage.gbp`).toBeTypeOf('number');
    }
  });
});

describe('getPriceFor', () => {
  it('returns the headline monthly price', () => {
    expect(getPriceFor('pro', 'eur', 'monthly')).toBe(49);
    expect(getPriceFor('pro', 'czk', 'monthly')).toBe(1_190);
  });

  it('applies the -20% annual discount to monthly-equivalent', () => {
    expect(getPriceFor('pro', 'eur', 'annual')).toBe(Math.round((49 * 80) / 100));
    expect(getPriceFor('business', 'eur', 'annual')).toBe(Math.round((129 * 80) / 100));
  });

  it('returns null for Enterprise / Send Custom (no headline price)', () => {
    expect(getPriceFor('enterprise', 'eur', 'monthly')).toBeNull();
    expect(getPriceFor('send_custom', 'eur', 'monthly')).toBeNull();
  });

  it('returns null for unknown tiers', () => {
    expect(getPriceFor('mystery_tier', 'eur', 'monthly')).toBeNull();
  });

  it('defaults to EUR + monthly when arguments omitted', () => {
    expect(getPriceFor('pro')).toBe(49);
  });

  it('Free is 0 across every currency + cycle', () => {
    expect(getPriceFor('free', 'eur', 'monthly')).toBe(0);
    expect(getPriceFor('free', 'czk', 'annual')).toBe(0);
    expect(getPriceFor('free', 'gbp', 'monthly')).toBe(0);
  });
});

describe('getAiQuotaPerDay', () => {
  it('Free tier publishes a small intentional limit', () => {
    expect(getAiQuotaPerDay('free')).toBeLessThanOrEqual(10);
  });

  it('Enterprise is Infinity', () => {
    expect(getAiQuotaPerDay('enterprise')).toBe(Number.POSITIVE_INFINITY);
  });

  it('Unknown plan returns 0 (most restrictive default)', () => {
    expect(getAiQuotaPerDay('made_up')).toBe(0);
  });
});

describe('getOverageRate', () => {
  it('returns the per-currency rate for the requested tier', () => {
    expect(getOverageRate('send_starter', 'eur')).toBe(0.0008);
    expect(getOverageRate('send_starter', 'czk')).toBe(0.02);
  });

  it('returns null for tiers without overage (Send Custom)', () => {
    expect(getOverageRate('send_custom', 'eur')).toBeNull();
  });

  it('returns null for contact-based plans', () => {
    expect(getOverageRate('pro', 'eur')).toBeNull();
  });
});

describe('calculateOverageCost', () => {
  it('zero overage when under cap', () => {
    expect(calculateOverageCost('send_starter', 49_999, 'eur')).toBe(0);
  });

  it('per-currency rate applied', () => {
    const eur = calculateOverageCost('send_starter', 60_000, 'eur');
    const czk = calculateOverageCost('send_starter', 60_000, 'czk');
    expect(eur).toBeGreaterThan(0);
    expect(czk).toBeGreaterThan(0);
    expect(czk).toBeGreaterThan(eur); // CZK rate is numerically larger
  });

  it('defaults to EUR currency', () => {
    expect(calculateOverageCost('send_starter', 60_000)).toBe(
      calculateOverageCost('send_starter', 60_000, 'eur'),
    );
  });
});

describe('isSendAllowed', () => {
  it('contact_based always returns true (enforced elsewhere)', () => {
    expect(isSendAllowed('contact_based', 'pro', 999_999)).toBe(true);
  });

  it('send_based allows overage but flips false at the cap', () => {
    expect(isSendAllowed('send_based', 'send_starter', 0)).toBe(true);
    expect(isSendAllowed('send_based', 'send_starter', 49_999)).toBe(true);
    expect(isSendAllowed('send_based', 'send_starter', 50_000)).toBe(false);
  });

  it('payg short-circuits to true (checked elsewhere)', () => {
    expect(isSendAllowed('payg', 'whatever', 1_000_000)).toBe(true);
  });
});

describe('listAllPlans', () => {
  it('returns every contact tier followed by every send tier', () => {
    const all = listAllPlans();
    expect(all.length).toBe(
      Object.keys(CONTACT_PLANS).length + Object.keys(SEND_PLANS).length,
    );
    expect(all[0]!.billingType).toBe('contact_based');
    expect(all[all.length - 1]!.billingType).toBe('send_based');
  });
});

describe('getContactPlan / getSendPlan', () => {
  it('look up by tier id', () => {
    expect(getContactPlan('pro')?.name).toBe('Pro');
    expect(getSendPlan('send_starter')?.name).toBe('Send Starter');
  });

  it('null for unknown ids', () => {
    expect(getContactPlan('unknown')).toBeNull();
    expect(getSendPlan('unknown')).toBeNull();
  });
});

describe('validateBillingCurrency', () => {
  it('accepts the four currencies regardless of case', () => {
    expect(validateBillingCurrency('eur')).toBe('eur');
    expect(validateBillingCurrency('EUR')).toBe('eur');
    expect(validateBillingCurrency('CZK')).toBe('czk');
    expect(validateBillingCurrency('usd')).toBe('usd');
    expect(validateBillingCurrency('gbp')).toBe('gbp');
  });

  it('rejects unknown currencies + non-strings', () => {
    expect(validateBillingCurrency('jpy')).toBeNull();
    expect(validateBillingCurrency('')).toBeNull();
    expect(validateBillingCurrency(null)).toBeNull();
    expect(validateBillingCurrency(123)).toBeNull();
  });
});

describe('ANNUAL_DISCOUNT_PCT', () => {
  it('is set to 20 for the public marketing claim', () => {
    expect(ANNUAL_DISCOUNT_PCT).toBe(20);
  });
});
