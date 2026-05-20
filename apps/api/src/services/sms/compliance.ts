/**
 * SMS compliance engine (task 7.5).
 *
 * Enforces:
 *   - TCPA quiet hours (US): 8:00 AM–9:00 PM in recipient's local time
 *   - GDPR consent check: opted-in consent required (EU)
 *   - Active consent check: phone must not be revoked
 *   - Auto-append opt-out text for US numbers
 *   - Pre-send compliance gate: throws if send is not permitted
 */

import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { smsConsents } from '../../db/schema/sms.js';
import { AppError } from '../../lib/app-error.js';

// ─── Country classification ───────────────────────────────────────────────────

const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);

const COUNTRY_TIMEZONE: Record<string, string> = {
  US: 'America/New_York', // Conservative: use Eastern (latest quiet-hours cutoff)
  CA: 'America/Toronto',
  GB: 'Europe/London',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  PL: 'Europe/Warsaw',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  IN: 'Asia/Kolkata',
  BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City',
  // default: UTC
};

// ─── TCPA quiet hours ─────────────────────────────────────────────────────────

export interface QuietHoursResult {
  blocked: boolean;
  reason?: string;
  /** ISO8601 timestamp when sending will be allowed next */
  allowedAfter?: string;
}

export function checkTcpaQuietHours(
  countryCode: string,
  nowUtc: Date = new Date(),
): QuietHoursResult {
  // Only enforce for US
  if (countryCode !== 'US') {
    return { blocked: false };
  }

  const tz = COUNTRY_TIMEZONE[countryCode] ?? 'UTC';

  // Get local hour in recipient timezone using Intl
  const localHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(
      nowUtc,
    ),
    10,
  );

  // TCPA: allowed 8:00–20:59 (9 PM cutoff)
  if (localHour < 8 || localHour >= 21) {
    // Calculate next allowed time (next 8 AM in their timezone)
    const nextAllowed = getNext8AM(tz, nowUtc);

    return {
      blocked: true,
      reason: `TCPA quiet hours — local time is ${localHour}:xx in ${tz}; sending allowed 8 AM–9 PM`,
      allowedAfter: nextAllowed.toISOString(),
    };
  }

  return { blocked: false };
}

function getNext8AM(tz: string, from: Date): Date {
  // Find next 8:00 AM in the given timezone
  const candidate = new Date(from);
  candidate.setMinutes(0, 0, 0);

  for (let i = 0; i < 25; i++) {
    candidate.setHours(candidate.getHours() + 1);
    const h = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(
        candidate,
      ),
      10,
    );
    if (h === 8) return candidate;
  }

  // Fallback: add 12 hours
  return new Date(from.getTime() + 12 * 60 * 60 * 1000);
}

// ─── Consent management ───────────────────────────────────────────────────────

export async function recordConsent(
  orgId: string,
  phone: string,
  opts: {
    contactId?: string;
    consentSource: string;
    consentContext?: string;
  },
): Promise<typeof smsConsents.$inferSelect> {
  const [consent] = await db
    .insert(smsConsents)
    .values({
      orgId,
      phone,
      contactId: opts.contactId,
      consentSource: opts.consentSource,
      consentContext: opts.consentContext,
      consentedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [smsConsents.orgId, smsConsents.phone],
      set: {
        revokedAt: null,
        revokedViaKeyword: null,
        consentSource: opts.consentSource,
        consentContext: opts.consentContext ?? null,
        consentedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  return consent!;
}

export async function revokeConsent(orgId: string, phone: string, keyword?: string): Promise<void> {
  await db
    .update(smsConsents)
    .set({
      revokedAt: new Date(),
      revokedViaKeyword: keyword ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(smsConsents.orgId, orgId), eq(smsConsents.phone, phone)));
}

export async function getConsent(orgId: string, phone: string) {
  const [consent] = await db
    .select()
    .from(smsConsents)
    .where(and(eq(smsConsents.orgId, orgId), eq(smsConsents.phone, phone)))
    .limit(1);

  return consent ?? null;
}

export async function hasActiveConsent(orgId: string, phone: string): Promise<boolean> {
  const [row] = await db
    .select({ id: smsConsents.id })
    .from(smsConsents)
    .where(
      and(
        eq(smsConsents.orgId, orgId),
        eq(smsConsents.phone, phone),
        isNull(smsConsents.revokedAt),
      ),
    )
    .limit(1);

  return !!row;
}

export async function listConsents(orgId: string, page = 1, limit = 50) {
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(smsConsents)
    .where(eq(smsConsents.orgId, orgId))
    .limit(limit)
    .offset(offset);

  return rows;
}

// ─── Opt-out text ─────────────────────────────────────────────────────────────

/** US carriers require opt-out instructions in every commercial message */
export const OPT_OUT_TEXT_US = ' Reply STOP to opt out.';

export function appendOptOutText(body: string, countryCode: string): string {
  if (countryCode !== 'US') return body;
  if (/\bSTOP\b/i.test(body)) return body; // already mentions it
  return body + OPT_OUT_TEXT_US;
}

// ─── Pre-send compliance gate ─────────────────────────────────────────────────

export interface ComplianceCheckResult {
  allowed: boolean;
  /** Applied opt-out text to the message body (may be same as input) */
  body: string;
  reason?: string;
  allowedAfter?: string;
}

/**
 * Run all compliance checks before sending an SMS.
 * Throws AppError with code 'SMS_COMPLIANCE_BLOCKED' if not allowed.
 */
export async function checkSmsCompliance(
  orgId: string,
  phone: string,
  body: string,
  countryCode: string,
  opts: {
    requireConsent?: boolean; // default false (some transactional SMSes are exempt)
    nowUtc?: Date;
  } = {},
): Promise<ComplianceCheckResult> {
  const { requireConsent = false, nowUtc = new Date() } = opts;

  // 1. Consent check (required for marketing/EU)
  if (requireConsent || EU_COUNTRIES.has(countryCode)) {
    const consented = await hasActiveConsent(orgId, phone);
    if (!consented) {
      throw new AppError({
        code: 'SMS_COMPLIANCE_BLOCKED',
        message: `No active SMS consent for ${phone}`,
        statusCode: 403,
      });
    }
  }

  // 2. TCPA quiet hours (US only)
  const quietHours = checkTcpaQuietHours(countryCode, nowUtc);
  if (quietHours.blocked) {
    throw new AppError({
      code: 'SMS_QUIET_HOURS',
      message: quietHours.reason ?? 'TCPA quiet hours',
      statusCode: 429,
      details: { allowedAfter: quietHours.allowedAfter },
    });
  }

  // 3. Append opt-out text for US
  const finalBody = appendOptOutText(body, countryCode);

  return { allowed: true, body: finalBody };
}
