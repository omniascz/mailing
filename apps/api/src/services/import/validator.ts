import type { ContactField } from './column-detect.js';
import { parsePhonePrefix, type PrefixParseResult } from './phone-prefix.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface NormalizedRow {
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  source: string | null;
  customFields: Record<string, string>;
  phoneInfo: PrefixParseResult | null;
}

export interface RowValidationResult {
  ok: boolean;
  row: NormalizedRow | null;
  errors: string[];
}

/**
 * Normalize + validate a single CSV/XLSX row against a column mapping.
 * Unmapped columns with a non-'ignore' target are folded into customFields.
 */
export function validateRow(
  raw: Record<string, string>,
  mapping: Record<string, ContactField>,
  customFieldMap: Record<string, string> = {},
): RowValidationResult {
  const errors: string[] = [];
  const normalized: NormalizedRow = {
    email: null,
    phone: null,
    firstName: null,
    lastName: null,
    source: null,
    customFields: {},
    phoneInfo: null,
  };

  for (const [col, target] of Object.entries(mapping)) {
    const value = (raw[col] ?? '').trim();
    if (target === 'ignore' || !value) {
      if (target === 'ignore' && customFieldMap[col] && value) {
        normalized.customFields[customFieldMap[col]] = value;
      }
      continue;
    }
    switch (target) {
      case 'email':
        normalized.email = value.toLowerCase();
        break;
      case 'phone':
        normalized.phone = value;
        break;
      case 'first_name':
        normalized.firstName = value;
        break;
      case 'last_name':
        normalized.lastName = value;
        break;
      case 'source':
        normalized.source = value;
        break;
      case 'status':
        // Status is read-only on import; ignored silently.
        break;
    }
  }

  if (!normalized.email && !normalized.phone) {
    errors.push('row must contain at least one of email or phone');
  }

  if (normalized.email && !EMAIL_RE.test(normalized.email)) {
    errors.push(`invalid email: ${normalized.email}`);
    normalized.email = null;
  }

  if (normalized.phone) {
    const info = parsePhonePrefix(normalized.phone);
    normalized.phoneInfo = info;
    if (info.isValid) {
      normalized.phone = info.normalized;
    }
  }

  if (!normalized.email && !normalized.phone) {
    return { ok: false, row: null, errors };
  }

  return { ok: errors.length === 0, row: normalized, errors };
}
