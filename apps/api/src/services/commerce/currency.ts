/**
 * Multi-currency billing helpers (#409).
 *
 * Pure FX conversion + display-formatting utilities. Live rates come from a
 * daily-refreshed cache (service-level concern, not in scope here); this
 * module only handles math + formatting + currency metadata.
 *
 * Supported display currencies: CZK (home), EUR, USD, GBP. Additional
 * ISO-4217 codes can be plugged in by the caller — the conversion math is
 * currency-agnostic.
 */

export type Currency = 'CZK' | 'EUR' | 'USD' | 'GBP';

export const SUPPORTED_CURRENCIES: readonly Currency[] = ['CZK', 'EUR', 'USD', 'GBP'];

export interface CurrencyInfo {
  code: Currency;
  symbol: string;
  decimals: number;
  /** Unicode locale tag used for Intl formatting. */
  locale: string;
}

export const CURRENCY_INFO: Record<Currency, CurrencyInfo> = {
  CZK: { code: 'CZK', symbol: 'Kč', decimals: 2, locale: 'cs-CZ' },
  EUR: { code: 'EUR', symbol: '€', decimals: 2, locale: 'en-IE' },
  USD: { code: 'USD', symbol: '$', decimals: 2, locale: 'en-US' },
  GBP: { code: 'GBP', symbol: '£', decimals: 2, locale: 'en-GB' },
};

export function isSupportedCurrency(code: string): code is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

// ─── FX rate table ──────────────────────────────────────────────────────────

/**
 * A rate table expressed as units-per-USD. We pivot all conversions through
 * USD so rate updates are compact (N keys per day, not N×N). Callers pass
 * the table in; it typically comes from a daily ECB/fixer pull cached in
 * Redis for the API layer.
 */
export interface FxRateTable {
  /** ISO date this table was fetched, e.g. "2026-04-24". */
  asOf: string;
  /** Rates: CZK 23.5 means 1 USD = 23.5 CZK. */
  ratesPerUsd: Partial<Record<Currency, number>>;
}

/**
 * Convert `amount` from `fromCurrency` to `toCurrency` via USD. Throws when
 * either currency has no rate in the table. Rounds to the target currency's
 * decimals.
 */
export function convertAmount(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  table: FxRateTable,
): number {
  if (fromCurrency === toCurrency) return roundForCurrency(amount, toCurrency);

  const fromRate = fromCurrency === 'USD' ? 1 : table.ratesPerUsd[fromCurrency];
  const toRate = toCurrency === 'USD' ? 1 : table.ratesPerUsd[toCurrency];
  if (!fromRate) {
    throw new Error(`Missing FX rate for ${fromCurrency}`);
  }
  if (!toRate) {
    throw new Error(`Missing FX rate for ${toCurrency}`);
  }

  const inUsd = amount / fromRate;
  const inTarget = inUsd * toRate;
  return roundForCurrency(inTarget, toCurrency);
}

/** Round an amount to the currency's standard decimal precision. */
export function roundForCurrency(amount: number, currency: Currency): number {
  const decimals = CURRENCY_INFO[currency].decimals;
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/** Format a numeric amount using the currency's locale + symbol. */
export function formatCurrency(amount: number, currency: Currency): string {
  const info = CURRENCY_INFO[currency];
  return new Intl.NumberFormat(info.locale, {
    style: 'currency',
    currency: info.code,
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  }).format(amount);
}

// ─── Multi-currency invoice totals ─────────────────────────────────────────

export interface MultiCurrencyInvoiceLine {
  currency: Currency;
  amount: number;
}

/**
 * Convert every line to a target currency and sum them. Useful for
 * dashboards that display portfolio totals across mixed-currency invoices.
 */
export function sumInTargetCurrency(
  lines: MultiCurrencyInvoiceLine[],
  target: Currency,
  table: FxRateTable,
): number {
  let total = 0;
  for (const line of lines) {
    total += convertAmount(line.amount, line.currency, target, table);
  }
  return roundForCurrency(total, target);
}
