/**
 * Google Ads Customer Match — pure helpers.
 *
 * Customer Match uploads PII as SHA-256 hashes via offlineUserDataJob.
 * Each user has a UserData[] of UserIdentifier entries (hashedEmail,
 * hashedPhoneNumber, addressInfo). Google deduplicates and matches
 * server-side.
 *
 * Spec: https://developers.google.com/google-ads/api/docs/remarketing/audience-types/customer-match
 */

import { createHash } from 'node:crypto';

/** Google Ads enforces 10k operations per AddOperations request. */
export const GOOGLE_BATCH_SIZE = 10_000;

export interface GoogleAudienceMember {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  countryCode?: string | null;
  zip?: string | null;
}

/**
 * Email normalisation per Google docs:
 *   • lowercase
 *   • trim
 *   • for gmail.com / googlemail.com — remove dots from local part
 */
export function normaliseEmailForGoogle(email: string): string {
  let v = email.trim().toLowerCase();
  const [local, domain] = v.split('@');
  if (!domain || !local) return '';
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    v = `${local.replace(/\./g, '')}@${domain}`;
  }
  return v;
}

export function hashEmailForGoogle(email: string): string {
  const v = normaliseEmailForGoogle(email);
  if (!v) return '';
  return createHash('sha256').update(v).digest('hex');
}

/** Phone: E.164 with leading +, then hash. Reject anything shorter than 8 digits. */
export function hashPhoneForGoogle(phone: string): string {
  let s = phone.replace(/[\s\-()._]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    // No country code → can't normalise safely; reject.
    if (!/^\d{8,15}$/.test(s)) return '';
    s = `+${s}`;
  }
  if (!/^\+\d{8,15}$/.test(s)) return '';
  return createHash('sha256').update(s).digest('hex');
}

/** Names: lowercase, strip whitespace + punctuation, then hash. */
export function hashNameForGoogle(name: string): string {
  const v = name
    .trim()
    .toLowerCase()
    .replace(/[^a-záčďéěíňóřšťúůýž]/giu, '');
  if (!v) return '';
  return createHash('sha256').update(v).digest('hex');
}

export interface GoogleUserIdentifier {
  hashedEmail?: string;
  hashedPhoneNumber?: string;
  addressInfo?: {
    hashedFirstName: string;
    hashedLastName: string;
    countryCode: string;
    postalCode: string;
  };
}

/**
 * Build the UserIdentifier list per member. A single member may emit
 * multiple identifiers (email + phone + address), each a separate
 * matching signal.
 */
export function buildGoogleUserIdentifiers(member: GoogleAudienceMember): GoogleUserIdentifier[] {
  const out: GoogleUserIdentifier[] = [];
  if (member.email) {
    const h = hashEmailForGoogle(member.email);
    if (h) out.push({ hashedEmail: h });
  }
  if (member.phone) {
    const h = hashPhoneForGoogle(member.phone);
    if (h) out.push({ hashedPhoneNumber: h });
  }
  if (member.firstName && member.lastName && member.countryCode && member.zip) {
    const country = member.countryCode.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(country)) {
      out.push({
        addressInfo: {
          hashedFirstName: hashNameForGoogle(member.firstName),
          hashedLastName: hashNameForGoogle(member.lastName),
          countryCode: country,
          postalCode: member.zip.trim(),
        },
      });
    }
  }
  return out;
}

export interface GoogleOperation {
  create: { userIdentifiers: GoogleUserIdentifier[] };
}

/** Build addOperations payload for a member batch. */
export function buildGoogleOperations(members: GoogleAudienceMember[]): GoogleOperation[] {
  const ops: GoogleOperation[] = [];
  for (const m of members) {
    const idents = buildGoogleUserIdentifiers(m);
    if (idents.length === 0) continue;
    ops.push({ create: { userIdentifiers: idents } });
  }
  return ops;
}

export function chunkGoogle<T>(arr: readonly T[], size: number = GOOGLE_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive');
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface GoogleSyncStats {
  totalMembers: number;
  operations: number;
  batches: number;
}

export function computeGoogleStats(members: GoogleAudienceMember[]): GoogleSyncStats {
  const ops = buildGoogleOperations(members);
  return {
    totalMembers: members.length,
    operations: ops.length,
    batches: Math.ceil(ops.length / GOOGLE_BATCH_SIZE) || (ops.length > 0 ? 1 : 0),
  };
}
