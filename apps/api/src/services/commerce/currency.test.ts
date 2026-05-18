import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_INFO,
  isSupportedCurrency,
  convertAmount,
  roundForCurrency,
  formatCurrency,
  sumInTargetCurrency,
  type FxRateTable,
} from './currency.js';

const table: FxRateTable = {
  asOf: '2026-04-24',
  ratesPerUsd: {
    CZK: 23.5,
    EUR: 0.92,
    GBP: 0.79,
  },
};

describe('SUPPORTED_CURRENCIES', () => {
  it('includes the 4 launch currencies', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['CZK', 'EUR', 'USD', 'GBP']);
  });

  it('has metadata for each', () => {
    for (const code of SUPPORTED_CURRENCIES) {
      expect(CURRENCY_INFO[code]).toBeDefined();
      expect(CURRENCY_INFO[code].decimals).toBe(2);
    }
  });
});

describe('isSupportedCurrency', () => {
  it('accepts supported codes', () => {
    expect(isSupportedCurrency('CZK')).toBe(true);
    expect(isSupportedCurrency('EUR')).toBe(true);
  });

  it('rejects unsupported codes', () => {
    expect(isSupportedCurrency('JPY')).toBe(false);
    expect(isSupportedCurrency('')).toBe(false);
  });
});

describe('convertAmount', () => {
  it('same-currency returns rounded amount', () => {
    expect(convertAmount(100.123, 'CZK', 'CZK', table)).toBe(100.12);
  });

  it('converts CZK → EUR through USD', () => {
    // 235 CZK / 23.5 CZK/USD = 10 USD; 10 USD * 0.92 EUR/USD = 9.20 EUR
    expect(convertAmount(235, 'CZK', 'EUR', table)).toBe(9.2);
  });

  it('converts USD → CZK', () => {
    expect(convertAmount(10, 'USD', 'CZK', table)).toBe(235);
  });

  it('converts EUR → GBP via USD', () => {
    // 9.2 EUR / 0.92 EUR/USD = 10 USD; 10 USD * 0.79 GBP/USD = 7.90 GBP
    expect(convertAmount(9.2, 'EUR', 'GBP', table)).toBe(7.9);
  });

  it('throws when from-rate missing', () => {
    const partial: FxRateTable = { asOf: '2026-04-24', ratesPerUsd: { EUR: 0.92 } };
    expect(() => convertAmount(100, 'CZK', 'EUR', partial)).toThrow(/CZK/);
  });

  it('throws when to-rate missing', () => {
    const partial: FxRateTable = { asOf: '2026-04-24', ratesPerUsd: { CZK: 23.5 } };
    expect(() => convertAmount(100, 'CZK', 'GBP', partial)).toThrow(/GBP/);
  });

  it('USD→USD passes through', () => {
    expect(convertAmount(42.123, 'USD', 'USD', table)).toBe(42.12);
  });
});

describe('roundForCurrency', () => {
  it('rounds to 2 decimals', () => {
    expect(roundForCurrency(1.236, 'CZK')).toBe(1.24);
    expect(roundForCurrency(1.234, 'CZK')).toBe(1.23);
  });
});

describe('formatCurrency', () => {
  it('renders CZK with Kč suffix', () => {
    const out = formatCurrency(1234.5, 'CZK');
    expect(out).toContain('Kč');
    expect(out).toMatch(/1\s?234,50/);
  });

  it('renders EUR with € symbol', () => {
    const out = formatCurrency(1234.5, 'EUR');
    expect(out).toContain('€');
  });

  it('renders USD with $ symbol', () => {
    const out = formatCurrency(1234.5, 'USD');
    expect(out).toMatch(/\$1,234\.50/);
  });

  it('renders GBP with £ symbol', () => {
    const out = formatCurrency(1234.5, 'GBP');
    expect(out).toContain('£');
  });
});

describe('sumInTargetCurrency', () => {
  it('sums mixed-currency lines to a target', () => {
    const total = sumInTargetCurrency(
      [
        { currency: 'CZK', amount: 2350 }, // 100 USD
        { currency: 'EUR', amount: 92 },   // 100 USD
        { currency: 'USD', amount: 100 },
      ],
      'USD',
      table,
    );
    expect(total).toBeCloseTo(300, 2);
  });

  it('returns 0 for empty list', () => {
    expect(sumInTargetCurrency([], 'USD', table)).toBe(0);
  });
});
