/**
 * TikTok Business Custom Audience — pure helpers.
 *
 * TikTok accepts SHA-256 hashes of normalised PII and matches against
 * its user graph. Schema is row-oriented like Meta: one or more columns
 * per row, with EMAIL_SHA256 + PHONE_E164_SHA256 the common pair.
 *
 * Spec: https://business-api.tiktok.com/portal/docs?id=1740058709041666
 */

import { createHash } from 'node:crypto';

/** TikTok caps individual file uploads to 1M rows; we batch at 100K per request to stay safe. */
export const TIKTOK_BATCH_SIZE = 100_000;
export const TIKTOK_AUDIENCE_NAME_MAX = 100;

export interface TikTokAudienceMember {
  email?: string | null;
  phone?: string | null;
}

/** Lowercase + trim + hash. */
export function hashEmailForTikTok(email: string): string {
  const v = email.trim().toLowerCase();
  if (!v) return '';
  return createHash('sha256').update(v).digest('hex');
}

/** TikTok wants phone in E.164 *with* the leading +. */
export function hashPhoneForTikTok(phone: string): string {
  let s = phone.replace(/[\s\-()._]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    if (!/^\d{8,15}$/.test(s)) return '';
    s = `+${s}`;
  }
  if (!/^\+\d{8,15}$/.test(s)) return '';
  return createHash('sha256').update(s).digest('hex');
}

/**
 * TikTok payload shape — list of rows, each row a `[idType, idValue]`
 * tuple. They accept multiple identifiers per audience but want them
 * in separate rows, not multi-column rows.
 */
export interface TikTokAudienceRow {
  id_type: 'EMAIL_SHA256' | 'PHONE_SHA256';
  id_value: string;
}

export interface TikTokAudiencePayload {
  custom_audience_name: string;
  data: TikTokAudienceRow[];
}

export function validateTikTokAudienceName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('TikTok audience name is required');
  if (trimmed.length > TIKTOK_AUDIENCE_NAME_MAX) {
    throw new Error(`TikTok audience name must be ≤ ${TIKTOK_AUDIENCE_NAME_MAX} chars`);
  }
  return trimmed;
}

export function buildTikTokRows(members: TikTokAudienceMember[]): TikTokAudienceRow[] {
  const rows: TikTokAudienceRow[] = [];
  for (const m of members) {
    if (m.email) {
      const h = hashEmailForTikTok(m.email);
      if (h) rows.push({ id_type: 'EMAIL_SHA256', id_value: h });
    }
    if (m.phone) {
      const h = hashPhoneForTikTok(m.phone);
      if (h) rows.push({ id_type: 'PHONE_SHA256', id_value: h });
    }
  }
  return rows;
}

export function buildTikTokPayload(
  audienceName: string,
  members: TikTokAudienceMember[],
): TikTokAudiencePayload {
  return {
    custom_audience_name: validateTikTokAudienceName(audienceName),
    data: buildTikTokRows(members),
  };
}

export function chunkTikTok<T>(arr: readonly T[], size: number = TIKTOK_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive');
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface TikTokSyncStats {
  totalMembers: number;
  hashedRows: number;
  batches: number;
}

export function computeTikTokStats(members: TikTokAudienceMember[]): TikTokSyncStats {
  const rows = buildTikTokRows(members);
  return {
    totalMembers: members.length,
    hashedRows: rows.length,
    batches: Math.ceil(rows.length / TIKTOK_BATCH_SIZE) || (rows.length > 0 ? 1 : 0),
  };
}
