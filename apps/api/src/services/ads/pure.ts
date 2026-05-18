/**
 * Ads Management pure helpers (#301-#307/L4-2).
 *
 * Audience email hashing (SHA-256 per Facebook/Google Custom Audience spec),
 * UTM builder, and cost-per-conversion math. Pure: the sync service wraps
 * these + actually hits the ad platform API.
 */

import { createHash } from 'node:crypto';

export type AdPlatform = 'facebook' | 'google' | 'linkedin' | 'tiktok';

// ─── Audience hashing ──────────────────────────────────────────────────────

/**
 * Hash an email for Custom Audience upload. Both Facebook and Google require:
 *   - lowercased
 *   - trimmed
 *   - SHA-256 hex-encoded
 */
export function hashEmailForAudience(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Hash a phone number. E.164-style digits-only, then SHA-256.
 * Caller is responsible for E.164 normalisation upstream.
 */
export function hashPhoneForAudience(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return createHash('sha256').update(digits).digest('hex');
}

/**
 * Produce the multi-field audience record format Facebook expects:
 *   [ email_sha256, phone_sha256, firstname_sha256, lastname_sha256 ]
 * Empty fields are emitted as empty strings so column count is stable.
 */
export function formatAudienceRow(input: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}): string[] {
  const hash = (s: string | undefined) =>
    s ? createHash('sha256').update(s.trim().toLowerCase()).digest('hex') : '';
  return [
    input.email ? hashEmailForAudience(input.email) : '',
    input.phone ? hashPhoneForAudience(input.phone) : '',
    hash(input.firstName),
    hash(input.lastName),
  ];
}

// ─── UTM builder ───────────────────────────────────────────────────────────

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
}

/**
 * Append UTM parameters to a URL. Preserves existing query params; overwrites
 * any existing utm_* keys. Returns the URL unchanged (but returns null) when
 * the base is malformed.
 */
export function buildUtmUrl(base: string, utm: UtmParams): string | null {
  try {
    const u = new URL(base);
    u.searchParams.set('utm_source', utm.source);
    u.searchParams.set('utm_medium', utm.medium);
    u.searchParams.set('utm_campaign', utm.campaign);
    if (utm.term) u.searchParams.set('utm_term', utm.term);
    if (utm.content) u.searchParams.set('utm_content', utm.content);
    return u.toString();
  } catch {
    return null;
  }
}

// ─── Ad performance math ──────────────────────────────────────────────────

export interface AdPerformanceInput {
  impressions: number;
  clicks: number;
  conversions: number;
  /** Spend in the campaign's currency. */
  cost: number;
  /** Revenue attributed to the campaign in the same currency. */
  revenue: number;
}

export interface AdPerformanceMetrics {
  ctr: number;               // clicks / impressions
  cvr: number;               // conversions / clicks
  cpc: number;               // cost per click
  cpa: number;               // cost per acquisition (conversion)
  roas: number;              // revenue / cost
  profit: number;            // revenue - cost
}

export function computeAdPerformance(input: AdPerformanceInput): AdPerformanceMetrics {
  const ctr = safe(input.clicks, input.impressions);
  const cvr = safe(input.conversions, input.clicks);
  const cpc = safe(input.cost, input.clicks);
  const cpa = safe(input.cost, input.conversions);
  const roas = safe(input.revenue, input.cost);
  const profit = round2(input.revenue - input.cost);
  return {
    ctr: round4(ctr),
    cvr: round4(cvr),
    cpc: round2(cpc),
    cpa: round2(cpa),
    roas: round4(roas),
    profit,
  };
}

// ─── Attribution window ───────────────────────────────────────────────────

export interface ClickEvent {
  ts: Date;
  source: string;      // e.g. 'google', 'facebook'
  campaign: string;
}

export interface ConversionEvent {
  ts: Date;
  value: number;
}

/**
 * Pick the click that should receive credit for a conversion under a
 * "last non-direct click" model with a configurable lookback window.
 * Returns null when no click falls inside the window.
 */
export function attributeConversion(
  conversion: ConversionEvent,
  clicks: ClickEvent[],
  windowDays = 30,
): ClickEvent | null {
  const windowMs = windowDays * 86_400_000;
  const eligible = clicks
    .filter(
      (c) =>
        c.ts.getTime() <= conversion.ts.getTime() &&
        conversion.ts.getTime() - c.ts.getTime() <= windowMs &&
        c.source !== 'direct',
    )
    .sort((a, b) => b.ts.getTime() - a.ts.getTime());
  return eligible[0] ?? null;
}

// ─── Internals ─────────────────────────────────────────────────────────────

function safe(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
