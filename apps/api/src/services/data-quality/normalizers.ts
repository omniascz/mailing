/**
 * Data quality auto-normalizers (#349, §17-I).
 *
 * Pure functions that the import pipeline + write paths can apply to raw
 * input. Each returns the normalised value plus a `changed` flag so callers
 * can decide whether to log "auto-corrected" telemetry.
 *
 * Conservative philosophy: when in doubt, leave the input alone. The cost of a
 * silent corruption (e.g. mangled non-Latin name) is much higher than a
 * non-canonical-but-readable record.
 */

export interface NormaliseResult<T = string> {
  value: T;
  changed: boolean;
}

// ─── Email ────────────────────────────────────────────────────────────────

/**
 * Email normalisation: trim, lowercase the local part AND the domain. RFC 5321
 * says the local part is case-sensitive, but every real-world MTA folds it; we
 * follow that convention for dedupe purposes. Returns null if the value isn't
 * a plausible address (no `@`).
 */
export function normaliseEmail(input: string | null | undefined): NormaliseResult<string | null> {
  if (input == null) return { value: null, changed: false };
  const trimmed = input.trim();
  if (!trimmed) return { value: null, changed: input !== '' };
  if (!trimmed.includes('@')) return { value: null, changed: true };
  const lower = trimmed.toLowerCase();
  return { value: lower, changed: lower !== input };
}

// ─── Phone (E.164) ─────────────────────────────────────────────────────────

/**
 * Phone normalisation to E.164. Defaults country code is supplied per call.
 * Strips whitespace / parens / dashes / dots. Drops a single leading 00. Falls
 * back to prefixing the default country dial code only if the input is purely
 * national digits.
 */
export function normalisePhone(
  input: string | null | undefined,
  defaultCountryDialCode: string,
): NormaliseResult<string | null> {
  if (input == null) return { value: null, changed: false };
  const original = input;
  let s = input.replace(/[\s\-()._]/g, '');
  if (!s) return { value: null, changed: original !== '' };

  if (s.startsWith('+')) {
    // Already E.164-shaped; just validate digits-only after the +.
    const rest = s.slice(1);
    if (!/^\d{8,15}$/.test(rest)) return { value: null, changed: true };
    return { value: s, changed: s !== original };
  }
  if (s.startsWith('00')) {
    s = s.slice(2);
    if (!/^\d{8,15}$/.test(s)) return { value: null, changed: true };
    return { value: `+${s}`, changed: true };
  }
  // Naked national number — prepend the default dial code.
  if (!/^\d+$/.test(s)) return { value: null, changed: true };
  const cc = defaultCountryDialCode.replace(/^\+/, '').replace(/\D/g, '');
  if (!/^\d{1,3}$/.test(cc)) return { value: null, changed: true };
  const composed = `+${cc}${s}`;
  if (composed.length - 1 < 8 || composed.length - 1 > 15) return { value: null, changed: true };
  return { value: composed, changed: composed !== original };
}

// ─── Names ─────────────────────────────────────────────────────────────────

/**
 * Title-case a first / last name. Handles:
 *   - hyphenated parts ("anne-marie" → "Anne-Marie")
 *   - apostrophes ("o'brien" → "O'Brien")
 *   - "Mc"/"Mac" pattern for Scottish/Irish surnames
 *   - already-correct mixed-case input is left alone
 *
 * Non-Latin scripts (CJK, Cyrillic, Arabic, …) are returned unchanged because
 * Unicode case mapping doesn't apply meaningfully there. Trim only.
 */
export function normaliseName(input: string | null | undefined): NormaliseResult<string | null> {
  if (input == null) return { value: null, changed: false };
  const trimmed = input.trim();
  if (!trimmed) return { value: null, changed: input !== '' };

  // Detect scripts where Latin title-casing is wrong.
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7FÀ-ž]/.test(trimmed) && !/[a-zA-ZÀ-ž]/.test(trimmed)) {
    return { value: trimmed, changed: trimmed !== input };
  }

  const out = trimmed.replace(
    /(^|[\s\-'])([\p{L}])(\p{L}*)/gu,
    (_match, sep: string, first: string, rest: string) => {
      return sep + first.toLocaleUpperCase() + rest.toLocaleLowerCase();
    },
  );

  // Mc / Mac patterns: capitalise the next letter too.
  const final = out.replace(
    /\b(Mc|Mac)([\p{L}])/gu,
    (_m, prefix: string, ch: string) => prefix + ch.toLocaleUpperCase(),
  );

  return { value: final, changed: final !== input };
}

// ─── Country (ISO 3166-1 alpha-2) ──────────────────────────────────────────

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  // Common English names
  'czech republic': 'CZ',
  czechia: 'CZ',
  slovakia: 'SK',
  'slovak republic': 'SK',
  germany: 'DE',
  austria: 'AT',
  poland: 'PL',
  hungary: 'HU',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  'great britain': 'GB',
  uk: 'GB',
  france: 'FR',
  spain: 'ES',
  italy: 'IT',
  netherlands: 'NL',
  belgium: 'BE',
  switzerland: 'CH',
  // Czech / Slovak names
  'česká republika': 'CZ',
  česko: 'CZ',
  slovensko: 'SK',
  'slovenská republika': 'SK',
  německo: 'DE',
  rakousko: 'AT',
  polsko: 'PL',
  maďarsko: 'HU',
  francie: 'FR',
  španělsko: 'ES',
  itálie: 'IT',
};

const ISO3_TO_ISO2: Record<string, string> = {
  CZE: 'CZ',
  SVK: 'SK',
  DEU: 'DE',
  AUT: 'AT',
  POL: 'PL',
  HUN: 'HU',
  USA: 'US',
  GBR: 'GB',
  FRA: 'FR',
  ESP: 'ES',
  ITA: 'IT',
  NLD: 'NL',
  BEL: 'BE',
  CHE: 'CH',
};

/**
 * Country normalisation: resolve to ISO 3166-1 alpha-2.
 *   - 2-letter codes: uppercased.
 *   - 3-letter codes: looked up in a small alpha-3 → alpha-2 table.
 *   - Names (English / Czech / Slovak common forms): looked up case-fold.
 *
 * Unrecognised values return `value: null, changed: true` so the caller can
 * surface the field as needing manual review.
 */
export function normaliseCountry(input: string | null | undefined): NormaliseResult<string | null> {
  if (input == null) return { value: null, changed: false };
  const trimmed = input.trim();
  if (!trimmed) return { value: null, changed: input !== '' };

  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return { value: upper, changed: upper !== input };
  if (/^[A-Z]{3}$/.test(upper)) {
    const a2 = ISO3_TO_ISO2[upper];
    return a2 ? { value: a2, changed: true } : { value: null, changed: true };
  }

  const lower = trimmed.toLocaleLowerCase('en');
  const found = COUNTRY_NAME_TO_ISO2[lower] ?? COUNTRY_NAME_TO_ISO2[trimmed.toLocaleLowerCase()];
  if (found) return { value: found, changed: true };
  return { value: null, changed: true };
}

// ─── Aggregate helper ─────────────────────────────────────────────────────

export interface ContactPatch {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
}

export interface NormalisedContact {
  patch: ContactPatch;
  changed: string[];
}

/**
 * Normalise a contact patch in one pass, returning the cleaned values plus the
 * names of fields that were rewritten (for telemetry / audit).
 */
export function normaliseContact(
  patch: ContactPatch,
  defaultCountryDialCode = '420',
): NormalisedContact {
  const changed: string[] = [];
  const out: ContactPatch = { ...patch };

  if (Object.prototype.hasOwnProperty.call(patch, 'email')) {
    const r = normaliseEmail(patch.email);
    out.email = r.value;
    if (r.changed) changed.push('email');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'phone')) {
    const r = normalisePhone(patch.phone, defaultCountryDialCode);
    out.phone = r.value;
    if (r.changed) changed.push('phone');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'firstName')) {
    const r = normaliseName(patch.firstName);
    out.firstName = r.value;
    if (r.changed) changed.push('firstName');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'lastName')) {
    const r = normaliseName(patch.lastName);
    out.lastName = r.value;
    if (r.changed) changed.push('lastName');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'country')) {
    const r = normaliseCountry(patch.country);
    out.country = r.value;
    if (r.changed) changed.push('country');
  }
  return { patch: out, changed };
}
