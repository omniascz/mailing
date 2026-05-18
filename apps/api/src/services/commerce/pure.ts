/**
 * Commerce Hub pure helpers (#313/#399).
 *
 * Subscription math (MRR normalization, period rollover, proration) and
 * quote totals — extracted into a schema-independent module so they can be
 * unit-tested without loading the Drizzle barrel.
 */

export interface SubscriptionLineItem {
  productId?: string;
  sku?: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export type BillingInterval = 'day' | 'week' | 'month' | 'quarter' | 'year';

// ─── MRR normalization ──────────────────────────────────────────────────────

/**
 * Convert any billing cadence to monthly recurring revenue. Day/week/
 * quarter/year all fold down to a per-month figure so dashboards can compare
 * plans on equal footing.
 */
export function computeMrr(
  lineItems: SubscriptionLineItem[],
  interval: BillingInterval,
  intervalCount: number,
): number {
  const periodTotal = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const monthsPerPeriod: Record<BillingInterval, number> = {
    day: 1 / 30,
    week: 7 / 30,
    month: 1,
    quarter: 3,
    year: 12,
  };
  const totalMonths = monthsPerPeriod[interval] * intervalCount;
  if (totalMonths <= 0) return 0;
  return Math.round((periodTotal / totalMonths) * 100) / 100;
}

// ─── Period advancement ─────────────────────────────────────────────────────

/**
 * Advance a date by N billing intervals. Mutates a copy, returns new Date.
 */
export function addInterval(
  base: Date,
  interval: BillingInterval,
  count: number,
): Date {
  const d = new Date(base);
  switch (interval) {
    case 'day':
      d.setUTCDate(d.getUTCDate() + count);
      break;
    case 'week':
      d.setUTCDate(d.getUTCDate() + 7 * count);
      break;
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + count);
      break;
    case 'quarter':
      d.setUTCMonth(d.getUTCMonth() + 3 * count);
      break;
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + count);
      break;
  }
  return d;
}

// ─── Proration ──────────────────────────────────────────────────────────────

/**
 * Straight-line day-prorate when switching plans mid-cycle.
 *   positive → customer owes (upgrade)
 *   negative → credit/refund owed (downgrade)
 *   0        → plan unchanged or change at period boundary
 */
export function computeProration(
  oldItems: SubscriptionLineItem[],
  newItems: SubscriptionLineItem[],
  periodStart: Date,
  periodEnd: Date,
  changeAt: Date,
): number {
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  if (periodMs <= 0) return 0;
  const remainingMs = Math.max(0, periodEnd.getTime() - changeAt.getTime());
  const fraction = remainingMs / periodMs;

  const oldTotal = oldItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const newTotal = newItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
  const delta = (newTotal - oldTotal) * fraction;
  return Math.round(delta * 100) / 100;
}

// ─── Quote totals ───────────────────────────────────────────────────────────

export interface QuoteLineItem {
  quantity: number;
  unitPrice: number;
  /** 0-100 percentage */
  discount?: number;
  /** 0-100 percentage */
  taxRate?: number;
}

export interface QuoteTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
}

/**
 * Line-item totals for quotes/orders/invoices. Discount applies to unit price
 * before tax; tax is added on top of the discounted base.
 */
export function computeQuoteTotals(items: QuoteLineItem[]): QuoteTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  for (const item of items) {
    const gross = item.quantity * item.unitPrice;
    const discount = item.discount ? gross * (item.discount / 100) : 0;
    const base = gross - discount;
    const tax = item.taxRate ? base * (item.taxRate / 100) : 0;
    subtotal += base;
    discountTotal += discount;
    taxTotal += tax;
  }
  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    taxTotal: round2(taxTotal),
    total: round2(subtotal + taxTotal),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
