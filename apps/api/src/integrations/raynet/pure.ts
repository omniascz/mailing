/**
 * Raynet pure helpers (#370/#391).
 *
 * No DB / no HTTP — normalization, URL construction, auth-header building.
 * Tested independently of the schema barrel.
 *
 * Raynet REST API reference:
 *   https://app.raynet.cz/api/v2/doc/
 * Each tenant's API lives at `https://app.raynet.cz/api/v2/company/{instance}/…`
 * and is authenticated with Basic-auth: `{username}:{apiKey}` + a global
 * `X-Instance-Name` header.
 */

export interface RaynetNormalizedContact {
  externalId: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyExternalId: number | null;
  updatedAt: Date | null;
}

export interface RaynetNormalizedCompany {
  externalId: number;
  name: string;
  ico: string | null;
  dic: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  updatedAt: Date | null;
}

export interface RaynetNormalizedDeal {
  externalId: number;
  name: string;
  amount: number | null;
  currency: string;
  stage: string | null;
  companyExternalId: number | null;
  primaryContactExternalId: number | null;
  closeDate: Date | null;
  updatedAt: Date | null;
}

// ─── URL / auth helpers ──────────────────────────────────────────────────────

const RAYNET_BASE = 'https://app.raynet.cz/api/v2';

/** Build the full endpoint URL for a Raynet resource path. */
export function buildRaynetUrl(instanceName: string, path: string): string {
  const cleanInstance = instanceName.trim().toLowerCase();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${RAYNET_BASE}/company/${encodeURIComponent(cleanInstance)}${cleanPath}`;
}

/** Build the Basic auth header value for Raynet API calls. */
export function buildRaynetAuthHeader(username: string, apiKey: string): string {
  const token = Buffer.from(`${username}:${apiKey}`).toString('base64');
  return `Basic ${token}`;
}

/** Validate a Raynet instance slug (lowercase letters, numbers, hyphens). */
export function isValidRaynetInstance(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/i.test(name.trim());
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Flatten a Raynet /contacts/{id} payload. Raynet uses camelCase properties
 * under a top-level `data` or directly on the object depending on endpoint.
 */
export function normalizeRaynetContact(raw: Record<string, unknown>): RaynetNormalizedContact {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const primaryEmail = resolvePrimary(data.contactInfo, 'email');
  const primaryPhone = resolvePrimary(data.contactInfo, 'tel');
  const company = (data.primaryAddress as Record<string, unknown>)?.company as
    | Record<string, unknown>
    | undefined;
  return {
    externalId: Number(data.id),
    email: primaryEmail,
    firstName: asStringOrNull(data.firstName),
    lastName: asStringOrNull(data.lastName),
    phone: primaryPhone,
    companyExternalId: company?.id != null ? Number(company.id) : null,
    updatedAt: toDate(data.lastActivity ?? data.updatedAt),
  };
}

/** Flatten a Raynet /companies/{id} payload. */
export function normalizeRaynetCompany(raw: Record<string, unknown>): RaynetNormalizedCompany {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const addr = (data.primaryAddress as Record<string, unknown>) ?? {};
  return {
    externalId: Number(data.id),
    name: String(data.name ?? ''),
    ico: asStringOrNull(data.regNumber),
    dic: asStringOrNull(data.taxNumber),
    street: asStringOrNull(addr.street),
    city: asStringOrNull(addr.city),
    zip: asStringOrNull(addr.zipCode),
    country: asStringOrNull(addr.state),
    updatedAt: toDate(data.lastActivity ?? data.updatedAt),
  };
}

/** Flatten a Raynet /businessCases/{id} (deal) payload. */
export function normalizeRaynetDeal(raw: Record<string, unknown>): RaynetNormalizedDeal {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const price = data.priceMain as Record<string, unknown> | undefined;
  const company = data.company as Record<string, unknown> | undefined;
  const primaryContact = data.primaryContactPerson as Record<string, unknown> | undefined;
  return {
    externalId: Number(data.id),
    name: String(data.name ?? ''),
    amount: price?.priceWithoutVat != null ? Number(price.priceWithoutVat) : null,
    currency: String(price?.currency ?? 'CZK'),
    stage: asStringOrNull(data.state),
    companyExternalId: company?.id != null ? Number(company.id) : null,
    primaryContactExternalId: primaryContact?.id != null ? Number(primaryContact.id) : null,
    closeDate: toDate(data.closeDate),
    updatedAt: toDate(data.lastActivity ?? data.updatedAt),
  };
}

// ─── Internals ───────────────────────────────────────────────────────────────

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Raynet contactInfo is an array of `{ contactInfoType, contactInfo, primary }`
 * entries. Pick the value flagged primary, otherwise the first of the type.
 */
function resolvePrimary(list: unknown, type: string): string | null {
  if (!Array.isArray(list)) return null;
  const ofType = list.filter(
    (e): e is Record<string, unknown> =>
      typeof e === 'object' &&
      e !== null &&
      (e as Record<string, unknown>).contactInfoType === type,
  );
  if (ofType.length === 0) return null;
  const primary = ofType.find((e) => e.primary === true);
  const chosen = primary ?? ofType[0];
  if (!chosen) return null;
  const value = chosen.contactInfo;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
