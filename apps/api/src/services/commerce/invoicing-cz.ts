/**
 * Czech invoicing helpers (#364/#388).
 *
 * Adds CZ-specific invoicing conventions on top of the generic invoicing
 * module:
 *   - VAT rates: 21% (standard), 12% (reduced as of 2024 consolidated rate),
 *     0% (zero-rated)
 *   - Sequential invoice numbering per calendar year (YYYY + running counter)
 *   - Party metadata: IČO (company ID), DIČ (VAT number), address
 *   - CZK-formatted totals with 0.01 Kč rounding
 *
 * Pair with `isdoc-export.ts` to produce the ISDOC XML invoice that Czech
 * accounting software (Pohoda, Money S3, Stormware, ABRA) expects.
 */

import type { LineItem } from './products.js';

// ─── VAT rates ───────────────────────────────────────────────────────────────

/**
 * CZ VAT rates. As of 2024 the legislature consolidated the two reduced rates
 * (15% + 10%) into a single 12% band; we keep the legacy rates so archived
 * invoices still round-trip through the export.
 */
export const CZ_VAT_RATES = {
  standard: 21,
  reduced: 12,
  /** @deprecated merged into `reduced` from 2024-01-01 */
  reducedLegacyFood: 15,
  /** @deprecated merged into `reduced` from 2024-01-01 */
  reducedLegacyBooks: 10,
  zero: 0,
} as const;

export type CzVatRate = (typeof CZ_VAT_RATES)[keyof typeof CZ_VAT_RATES];

export function isValidCzVatRate(rate: number): rate is CzVatRate {
  return (Object.values(CZ_VAT_RATES) as number[]).includes(rate);
}

// ─── Parties (seller + buyer) ────────────────────────────────────────────────

export interface CzParty {
  /** Legal / trading name */
  name: string;
  /** IČO — 8-digit Czech company registration number */
  ico?: string;
  /** DIČ — VAT number, usually "CZ" + IČO but can differ */
  dic?: string;
  /** Street + number (e.g. "Vinohradská 1512/19") */
  street: string;
  /** City */
  city: string;
  /** PSČ — 5-digit Czech postal code */
  zip: string;
  country: string;
  email?: string;
  phone?: string;
}

// ─── VAT breakdown ───────────────────────────────────────────────────────────

export interface VatBucket {
  /** VAT rate in percent */
  rate: number;
  /** Sum of line-item taxable bases at this rate */
  base: number;
  /** Sum of VAT amount at this rate */
  tax: number;
  /** base + tax */
  total: number;
}

/**
 * Group line items by VAT rate and compute the DPH breakdown required by
 * Czech VAT law (§28 zákona o DPH). `line.taxRate` is the per-line VAT rate
 * (21 / 12 / 0); unit prices are treated as NET (without VAT).
 */
export function computeVatBreakdown(lineItems: LineItem[]): {
  buckets: VatBucket[];
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
} {
  const byRate = new Map<number, VatBucket>();

  for (const item of lineItems) {
    const rate = item.taxRate ?? CZ_VAT_RATES.standard;
    const base = item.total; // net
    const tax = round2(base * (rate / 100));
    const bucket = byRate.get(rate) ?? { rate, base: 0, tax: 0, total: 0 };
    bucket.base = round2(bucket.base + base);
    bucket.tax = round2(bucket.tax + tax);
    bucket.total = round2(bucket.base + bucket.tax);
    byRate.set(rate, bucket);
  }

  const buckets = [...byRate.values()].sort((a, b) => b.rate - a.rate);
  const subtotal = round2(buckets.reduce((s, b) => s + b.base, 0));
  const vatTotal = round2(buckets.reduce((s, b) => s + b.tax, 0));
  const grandTotal = round2(subtotal + vatTotal);
  return { buckets, subtotal, vatTotal, grandTotal };
}

// ─── Invoice numbering ───────────────────────────────────────────────────────

/**
 * Format a CZ-style sequential invoice number: `YYYY0001`, `YYYY0002`, …
 * 8-digit year-scoped counter meets the "unambiguous, unbroken series"
 * requirement of §29 odst. 1 písm. a) zákona o DPH.
 */
export function formatCzInvoiceNumber(year: number, sequence: number): string {
  if (sequence < 1) throw new Error('Invoice sequence must be >= 1');
  return `${year}${String(sequence).padStart(4, '0')}`;
}

// ─── Validation helpers ──────────────────────────────────────────────────────

/**
 * Validate a Czech IČO using the official modulo-11 checksum.
 * Accepts 8-digit strings; shorter IČOs are zero-padded.
 */
export function isValidIco(ico: string): boolean {
  const digits = ico.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 8) return false;
  const padded = digits.padStart(8, '0');
  const chars = [...padded];
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += Number(chars[i]) * (8 - i);
  }
  const mod = sum % 11;
  let check: number;
  if (mod === 0) check = 1;
  else if (mod === 1) check = 0;
  else check = 11 - mod;
  return check === Number(chars[7]);
}

/** Validate a Czech DIČ: "CZ" prefix + 8-10 digits. */
export function isValidDic(dic: string): boolean {
  return /^CZ\d{8,10}$/.test(dic.trim().toUpperCase());
}

/** Validate a Czech PSČ: 5 digits, optionally split as "XXX XX". */
export function isValidPsc(psc: string): boolean {
  return /^\d{3}\s?\d{2}$/.test(psc.trim());
}

// ─── CZK formatting ──────────────────────────────────────────────────────────

/** Format a numeric amount as CZK with a non-breaking space and `,` decimal. */
export function formatCzk(amount: number): string {
  const rounded = round2(amount);
  const formatter = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(rounded);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
