import { describe, it, expect } from 'vitest';
import {
  CZ_VAT_RATES,
  isValidCzVatRate,
  computeVatBreakdown,
  formatCzInvoiceNumber,
  isValidIco,
  isValidDic,
  isValidPsc,
  formatCzk,
} from './invoicing-cz.js';
import type { LineItem } from './products.js';

describe('CZ_VAT_RATES', () => {
  it('exposes the current Czech VAT rates', () => {
    expect(CZ_VAT_RATES.standard).toBe(21);
    expect(CZ_VAT_RATES.reduced).toBe(12);
    expect(CZ_VAT_RATES.zero).toBe(0);
  });

  it('isValidCzVatRate accepts all canonical rates', () => {
    expect(isValidCzVatRate(21)).toBe(true);
    expect(isValidCzVatRate(12)).toBe(true);
    expect(isValidCzVatRate(0)).toBe(true);
    expect(isValidCzVatRate(19)).toBe(false);
  });
});

describe('computeVatBreakdown', () => {
  const mk = (name: string, unitPrice: number, qty: number, taxRate: number): LineItem => ({
    sku: name,
    name,
    qty,
    unitPrice,
    total: unitPrice * qty,
    taxRate,
  });

  it('groups items by VAT rate and computes base+tax+total', () => {
    const items: LineItem[] = [
      mk('Licence', 1000, 1, 21),
      mk('Implementace', 500, 2, 21),
      mk('Kniha', 200, 3, 12),
    ];
    const { buckets, subtotal, vatTotal, grandTotal } = computeVatBreakdown(items);

    expect(buckets).toHaveLength(2);
    const b21 = buckets.find((b) => b.rate === 21)!;
    const b12 = buckets.find((b) => b.rate === 12)!;

    expect(b21.base).toBeCloseTo(2000, 2);
    expect(b21.tax).toBeCloseTo(420, 2);
    expect(b12.base).toBeCloseTo(600, 2);
    expect(b12.tax).toBeCloseTo(72, 2);

    expect(subtotal).toBeCloseTo(2600, 2);
    expect(vatTotal).toBeCloseTo(492, 2);
    expect(grandTotal).toBeCloseTo(3092, 2);
  });

  it('defaults missing taxRate to 21%', () => {
    const items: LineItem[] = [{ sku: 'x', name: 'x', qty: 1, unitPrice: 100, total: 100 }];
    const { buckets } = computeVatBreakdown(items);
    expect(buckets[0]?.rate).toBe(21);
  });
});

describe('formatCzInvoiceNumber', () => {
  it('zero-pads the sequence to 4 digits and prefixes the year', () => {
    expect(formatCzInvoiceNumber(2026, 1)).toBe('20260001');
    expect(formatCzInvoiceNumber(2026, 42)).toBe('20260042');
    expect(formatCzInvoiceNumber(2026, 9999)).toBe('20269999');
  });

  it('rejects non-positive sequences', () => {
    expect(() => formatCzInvoiceNumber(2026, 0)).toThrow();
    expect(() => formatCzInvoiceNumber(2026, -1)).toThrow();
  });
});

describe('isValidIco', () => {
  it('accepts valid IČOs', () => {
    // Known valid Czech IČO checksums
    expect(isValidIco('25596641')).toBe(true); // Seznam.cz a.s.
    expect(isValidIco('00006947')).toBe(true); // Ministerstvo financí ČR
  });

  it('rejects invalid checksums', () => {
    expect(isValidIco('25596640')).toBe(false);
    expect(isValidIco('12345678')).toBe(false);
    expect(isValidIco('abcdefgh')).toBe(false);
    expect(isValidIco('')).toBe(false);
  });
});

describe('isValidDic', () => {
  it('accepts "CZ" + 8-10 digits', () => {
    expect(isValidDic('CZ25596641')).toBe(true);
    expect(isValidDic('CZ0123456789')).toBe(true);
  });

  it('rejects wrong prefixes/lengths', () => {
    expect(isValidDic('SK25596641')).toBe(false);
    expect(isValidDic('CZ1234567')).toBe(false); // 7 digits
    expect(isValidDic('CZ12345678901')).toBe(false); // 11 digits
  });
});

describe('isValidPsc', () => {
  it('accepts 5-digit CZ postal codes with optional space', () => {
    expect(isValidPsc('11000')).toBe(true);
    expect(isValidPsc('110 00')).toBe(true);
  });

  it('rejects other shapes', () => {
    expect(isValidPsc('1234')).toBe(false);
    expect(isValidPsc('110000')).toBe(false);
    expect(isValidPsc('ABCDE')).toBe(false);
  });
});

describe('formatCzk', () => {
  it('renders amounts with CZK/Kč suffix and cs-CZ separators', () => {
    const out = formatCzk(1234.5);
    expect(out).toContain('Kč');
    // cs-CZ uses `,` as decimal separator
    expect(out).toMatch(/1\s?234,50/);
  });
});
