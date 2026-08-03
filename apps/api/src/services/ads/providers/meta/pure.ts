/**
 * Meta (Facebook + Instagram) Custom Audiences — pure helpers.
 *
 * Meta accepts SHA-256 hashes of normalised PII across a configurable
 * schema. Their docs specify multi-field rows so a single contact can
 * be matched on email OR phone OR (first+last+zip+country) combo. We
 * normalise + hash here; HTTP transport lives in `./audience-sync.ts`.
 *
 * Spec: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences
 */

import { createHash } from 'node:crypto';

/** Meta caps individual user upload batches at 10K rows. */
export const META_BATCH_SIZE = 10_000;
export const META_AUDIENCE_NAME_MAX = 50;

/** Lowercase + trim + SHA-256. */
export function hashEmailForMeta(email: string): string {
  const v = email.trim().toLowerCase();
  if (!v) return '';
  return createHash('sha256').update(v).digest('hex');
}

/**
 * Meta wants phone digits with country code, no `+`. Drop whitespace
 * and punctuation, drop a leading `00` or `+`, then validate 8-15
 * digits and hash.
 */
export function hashPhoneForMeta(phone: string): string {
  let s = phone.replace(/[\s\-()._]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  if (!/^\d{8,15}$/.test(s)) return '';
  return createHash('sha256').update(s).digest('hex');
}

/** Names: lowercase, strip non-letters, hash. */
export function hashNameForMeta(name: string): string {
  const v = name
    .trim()
    .toLowerCase()
    .replace(/[^a-záčďéěíňóřšťúůýž]/giu, '');
  if (!v) return '';
  return createHash('sha256').update(v).digest('hex');
}

/** Country: lowercase 2-letter ISO. */
export function normaliseCountryForMeta(country: string): string {
  const v = country.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(v)) return '';
  return v;
}

export interface MetaAudienceMember {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** ISO 3166-1 alpha-2 — required when name fields are present. */
  countryCode?: string | null;
  zip?: string | null;
}

/**
 * Meta payload shape:
 *   { schema: ['EMAIL_SHA256', 'PHONE_SHA256', ...],
 *     data:   [[hash1, hash2, ...], ...] }
 *
 * Each row in `data` aligns positionally with `schema`. We always emit
 * EMAIL + PHONE fields; name + country + zip are appended when at least
 * one member supplies them so we avoid sending empty columns for
 * email-only lists (which would lower Meta's match rate scoring).
 */
export interface MetaAudiencePayload {
  schema: string[];
  data: string[][];
}

export function buildMetaPayload(members: MetaAudienceMember[]): MetaAudiencePayload {
  const includeName = members.some((m) => m.firstName || m.lastName);
  const includeZip = members.some((m) => m.zip);
  const includeCountry = members.some((m) => m.countryCode);

  const schema: string[] = ['EMAIL_SHA256', 'PHONE_SHA256'];
  if (includeName) schema.push('FN_SHA256', 'LN_SHA256');
  if (includeZip) schema.push('ZIP_SHA256');
  if (includeCountry) schema.push('COUNTRY');

  const data: string[][] = [];
  for (const m of members) {
    const row: string[] = [
      m.email ? hashEmailForMeta(m.email) : '',
      m.phone ? hashPhoneForMeta(m.phone) : '',
    ];
    if (includeName) {
      row.push(m.firstName ? hashNameForMeta(m.firstName) : '');
      row.push(m.lastName ? hashNameForMeta(m.lastName) : '');
    }
    if (includeZip) {
      row.push(m.zip ? createHash('sha256').update(m.zip.trim().toLowerCase()).digest('hex') : '');
    }
    if (includeCountry) {
      row.push(m.countryCode ? normaliseCountryForMeta(m.countryCode) : '');
    }
    // Meta requires at least one populated cell per row.
    if (row.some((v) => v.length > 0)) data.push(row);
  }

  return { schema, data };
}

/** Audience name validation — 50 char Meta hard limit. */
export function validateMetaAudienceName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Meta audience name is required');
  if (trimmed.length > META_AUDIENCE_NAME_MAX) {
    throw new Error(`Meta audience name must be ≤ ${META_AUDIENCE_NAME_MAX} chars`);
  }
  return trimmed;
}

/** Split into ≤ 10K row batches. */
export function chunkMeta<T>(arr: readonly T[], size: number = META_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive');
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface MetaSyncStats {
  totalMembers: number;
  hashedRows: number;
  batches: number;
  fields: string[];
}

export function computeMetaStats(members: MetaAudienceMember[]): MetaSyncStats {
  const payload = buildMetaPayload(members);
  return {
    totalMembers: members.length,
    hashedRows: payload.data.length,
    batches: Math.ceil(payload.data.length / META_BATCH_SIZE) || (payload.data.length > 0 ? 1 : 0),
    fields: payload.schema,
  };
}
