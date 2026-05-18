/**
 * Sklik audience-sync pure helpers (#421).
 *
 * Sklik's Custom Audience API expects SHA-256 hashes of normalised
 * email / phone strings. Normalisation is identical to the FB/Google
 * convention (trim + lowercase) so we get cross-platform dedupe for free.
 */

import { createHash } from 'node:crypto';

export const SKLIK_BATCH_SIZE = 50_000; // Sklik docs cap individual batch uploads
export const SKLIK_AUDIENCE_NAME_MAX = 64;

/** Lower-case, strip whitespace, hash with SHA-256 (hex). */
export function hashEmailForSklik(email: string): string {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return '';
  return createHash('sha256').update(normalised).digest('hex');
}

/**
 * Strip whitespace + every non-digit, drop a leading 00, then hash. The
 * result is always SHA-256(E.164 digits without leading `+`).
 */
export function hashPhoneForSklik(phone: string): string {
  let s = phone.replace(/[\s\-()._]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  if (!/^\d{8,15}$/.test(s)) return '';
  return createHash('sha256').update(s).digest('hex');
}

export interface AudienceMember {
  email?: string | null;
  phone?: string | null;
}

export interface SklikAudiencePayload {
  name: string;
  customer_data: Array<{ email_sha256?: string; phone_sha256?: string }>;
}

/**
 * Build the request body to upload a single batch to Sklik. Members with no
 * usable email or phone are filtered out — Sklik rejects empty rows.
 */
export function buildAudiencePayload(audienceName: string, members: AudienceMember[]): SklikAudiencePayload {
  const trimmedName = audienceName.trim();
  if (!trimmedName) throw new Error('Sklik audience name is required');
  if (trimmedName.length > SKLIK_AUDIENCE_NAME_MAX) {
    throw new Error(`Sklik audience name must be ≤ ${SKLIK_AUDIENCE_NAME_MAX} chars`);
  }

  const customer_data: SklikAudiencePayload['customer_data'] = [];
  for (const m of members) {
    const row: { email_sha256?: string; phone_sha256?: string } = {};
    if (m.email) {
      const h = hashEmailForSklik(m.email);
      if (h) row.email_sha256 = h;
    }
    if (m.phone) {
      const h = hashPhoneForSklik(m.phone);
      if (h) row.phone_sha256 = h;
    }
    if (row.email_sha256 || row.phone_sha256) customer_data.push(row);
  }

  return { name: trimmedName, customer_data };
}

/** Split a list into chunks of size at most `size`. */
export function chunk<T>(arr: readonly T[], size: number = SKLIK_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive');
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Per-batch summary for the audience sync record. */
export interface SyncStats {
  totalMembers: number;
  hashedRows: number;
  batches: number;
}

export function computeStats(members: AudienceMember[]): SyncStats {
  let hashedRows = 0;
  for (const m of members) {
    const e = m.email ? hashEmailForSklik(m.email) : '';
    const p = m.phone ? hashPhoneForSklik(m.phone) : '';
    if (e || p) hashedRows++;
  }
  const batches = Math.ceil(hashedRows / SKLIK_BATCH_SIZE);
  return { totalMembers: members.length, hashedRows, batches };
}
