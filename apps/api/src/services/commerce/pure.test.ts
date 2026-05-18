import { describe, it, expect } from 'vitest';
import {
  computeMrr,
  addInterval,
  computeProration,
  computeQuoteTotals,
  type SubscriptionLineItem,
  type QuoteLineItem,
} from './pure.js';

const basic: SubscriptionLineItem[] = [
  { name: 'Pro seat', quantity: 3, unitPrice: 990 },
];

describe('computeMrr', () => {
  it('returns per-month revenue for annual plans', () => {
    expect(computeMrr(basic, 'year', 1)).toBeCloseTo(990 * 3 / 12, 2);
  });

  it('returns per-month revenue for monthly plans', () => {
    expect(computeMrr(basic, 'month', 1)).toBe(990 * 3);
  });

  it('handles quarterly cadence', () => {
    expect(computeMrr(basic, 'quarter', 1)).toBeCloseTo(990 * 3 / 3, 2);
  });

  it('accounts for intervalCount > 1', () => {
    // Every 2 months: total revenue / 2
    expect(computeMrr(basic, 'month', 2)).toBe(990 * 3 / 2);
  });

  it('returns 0 for zero-length periods', () => {
    expect(computeMrr(basic, 'month', 0)).toBe(0);
  });
});

describe('addInterval', () => {
  const base = new Date(Date.UTC(2026, 0, 15));

  it('adds days', () => {
    expect(addInterval(base, 'day', 10).toISOString().slice(0, 10)).toBe('2026-01-25');
  });

  it('adds weeks', () => {
    expect(addInterval(base, 'week', 2).toISOString().slice(0, 10)).toBe('2026-01-29');
  });

  it('adds months', () => {
    expect(addInterval(base, 'month', 2).toISOString().slice(0, 10)).toBe('2026-03-15');
  });

  it('adds quarters (3 months)', () => {
    expect(addInterval(base, 'quarter', 1).toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('adds years', () => {
    expect(addInterval(base, 'year', 1).toISOString().slice(0, 10)).toBe('2027-01-15');
  });

  it('does not mutate the input', () => {
    const original = new Date(base);
    addInterval(base, 'month', 5);
    expect(base.getTime()).toBe(original.getTime());
  });
});

describe('computeProration', () => {
  const periodStart = new Date(Date.UTC(2026, 3, 1));
  const periodEnd = new Date(Date.UTC(2026, 4, 1)); // 30 days

  it('returns 0 for unchanged plan', () => {
    const items: SubscriptionLineItem[] = [{ name: 'seat', quantity: 1, unitPrice: 100 }];
    const mid = new Date(Date.UTC(2026, 3, 15));
    expect(computeProration(items, items, periodStart, periodEnd, mid)).toBe(0);
  });

  it('prorates upgrade by remaining fraction', () => {
    const oldItems: SubscriptionLineItem[] = [{ name: 'seat', quantity: 1, unitPrice: 100 }];
    const newItems: SubscriptionLineItem[] = [{ name: 'seat', quantity: 1, unitPrice: 300 }];
    const midPeriod = new Date(Date.UTC(2026, 3, 16)); // ~halfway
    const delta = computeProration(oldItems, newItems, periodStart, periodEnd, midPeriod);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(200); // less than a full period upgrade
  });

  it('returns negative for downgrade', () => {
    const oldItems: SubscriptionLineItem[] = [{ name: 'seat', quantity: 2, unitPrice: 100 }];
    const newItems: SubscriptionLineItem[] = [{ name: 'seat', quantity: 1, unitPrice: 100 }];
    const mid = new Date(Date.UTC(2026, 3, 16));
    expect(computeProration(oldItems, newItems, periodStart, periodEnd, mid)).toBeLessThan(0);
  });

  it('returns 0 when change occurs at period end', () => {
    const items: SubscriptionLineItem[] = [{ name: 'seat', quantity: 1, unitPrice: 100 }];
    const bump: SubscriptionLineItem[] = [{ name: 'seat', quantity: 1, unitPrice: 200 }];
    expect(computeProration(items, bump, periodStart, periodEnd, periodEnd)).toBe(0);
  });
});

describe('computeQuoteTotals', () => {
  it('sums simple items without discount/tax', () => {
    const items: QuoteLineItem[] = [
      { quantity: 2, unitPrice: 500 },
      { quantity: 1, unitPrice: 250 },
    ];
    expect(computeQuoteTotals(items)).toEqual({
      subtotal: 1250,
      discountTotal: 0,
      taxTotal: 0,
      total: 1250,
    });
  });

  it('applies line-level discount before tax', () => {
    const items: QuoteLineItem[] = [
      { quantity: 1, unitPrice: 1000, discount: 10, taxRate: 21 },
    ];
    const totals = computeQuoteTotals(items);
    expect(totals.discountTotal).toBe(100);
    expect(totals.subtotal).toBe(900);
    expect(totals.taxTotal).toBeCloseTo(189, 2);
    expect(totals.total).toBeCloseTo(1089, 2);
  });

  it('handles multiple mixed items', () => {
    const items: QuoteLineItem[] = [
      { quantity: 3, unitPrice: 500, taxRate: 21 },
      { quantity: 1, unitPrice: 200, taxRate: 12 },
    ];
    const totals = computeQuoteTotals(items);
    expect(totals.subtotal).toBe(1700);
    expect(totals.taxTotal).toBeCloseTo(1500 * 0.21 + 200 * 0.12, 2);
  });
});
