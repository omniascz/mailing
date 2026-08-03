/**
 * Org billing currency helper.
 *
 * `organizations.settings.billingCurrency` is the authoritative override —
 * a CZ-based org served from EU data region might still want USD billing
 * when they bill a US parent company. When not set, we derive a sensible
 * default from `organizations.dataRegion` so a freshly-bootstrapped org
 * doesn't see USD prices in a CZ-region setup.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/index.js';
import type { Currency } from './plans.js';

const REGION_DEFAULTS: Record<string, Currency> = {
  eu: 'eur',
  us: 'usd',
  ap: 'usd',
};

/**
 * Looks at the override on `settings.billingCurrency`; falls back to the
 * region default; final fallback is EUR (most common for our launch market).
 * Returns the lower-cased currency code used in the rest of plans.ts.
 */
export async function getOrgBillingCurrency(orgId: string): Promise<Currency> {
  const [org] = await db
    .select({ settings: organizations.settings, dataRegion: organizations.dataRegion })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) return 'eur';
  const settings = (org.settings ?? {}) as { billingCurrency?: unknown };
  const override =
    typeof settings.billingCurrency === 'string'
      ? (settings.billingCurrency.toLowerCase() as Currency)
      : null;
  if (override && isCurrency(override)) return override;

  const region = (org.dataRegion ?? 'us').toLowerCase();
  return REGION_DEFAULTS[region] ?? 'eur';
}

function isCurrency(value: string): value is Currency {
  return value === 'czk' || value === 'eur' || value === 'usd' || value === 'gbp';
}

/** Validation helper for the PATCH route. */
export function validateBillingCurrency(value: unknown): Currency | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return isCurrency(lower) ? (lower as Currency) : null;
}
