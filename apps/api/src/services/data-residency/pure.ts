/**
 * Data residency pure helpers (#410).
 *
 * `organizations.data_region` (us/eu/ap) is the canonical tenant residency
 * marker set at signup. This module provides the resolution rules every
 * caller should route through when picking DB/S3/Redis endpoints + when
 * validating that a requested resource lives in the allowed region.
 *
 * The enum is defined in `enums.ts::dataRegionEnum`. Sandboxes inherit
 * `dataRegion` from their parent org (see `services/sandboxes/index.ts`).
 */

export type DataRegion = 'us' | 'eu' | 'ap';

export const DATA_REGIONS: readonly DataRegion[] = ['us', 'eu', 'ap'];

export function isDataRegion(value: unknown): value is DataRegion {
  return typeof value === 'string' && (DATA_REGIONS as readonly string[]).includes(value);
}

// ─── Endpoint resolution ────────────────────────────────────────────────────

export interface RegionEndpoints {
  postgresHost: string;
  clickhouseHost: string;
  s3Endpoint: string;
  s3Bucket: string;
  redisHost: string;
  /** AWS-style region code, e.g. "eu-central-1". Emitted in resource ARNs. */
  awsRegion: string;
}

/** Default endpoint bindings per region. Overridable via the `overrides` map. */
export const DEFAULT_ENDPOINTS: Record<DataRegion, RegionEndpoints> = {
  us: {
    postgresHost: 'pg.us.forgemsg.internal',
    clickhouseHost: 'ch.us.forgemsg.internal',
    s3Endpoint: 'https://s3.us-east-1.amazonaws.com',
    s3Bucket: 'forgemsg-us',
    redisHost: 'redis.us.forgemsg.internal',
    awsRegion: 'us-east-1',
  },
  eu: {
    postgresHost: 'pg.eu.forgemsg.internal',
    clickhouseHost: 'ch.eu.forgemsg.internal',
    s3Endpoint: 'https://s3.eu-central-1.amazonaws.com',
    s3Bucket: 'forgemsg-eu',
    redisHost: 'redis.eu.forgemsg.internal',
    awsRegion: 'eu-central-1',
  },
  ap: {
    postgresHost: 'pg.ap.forgemsg.internal',
    clickhouseHost: 'ch.ap.forgemsg.internal',
    s3Endpoint: 'https://s3.ap-southeast-1.amazonaws.com',
    s3Bucket: 'forgemsg-ap',
    redisHost: 'redis.ap.forgemsg.internal',
    awsRegion: 'ap-southeast-1',
  },
};

/**
 * Resolve the set of endpoints that serve the given region. Overrides let
 * env-specific deployments (dev/staging/EU-only-cluster) plug in custom
 * hosts without rewriting the defaults table.
 */
export function resolveRegionEndpoints(
  region: DataRegion,
  overrides: Partial<Record<DataRegion, Partial<RegionEndpoints>>> = {},
): RegionEndpoints {
  return { ...DEFAULT_ENDPOINTS[region], ...(overrides[region] ?? {}) };
}

// ─── Cross-region guard ─────────────────────────────────────────────────────

export interface CrossRegionGuardInput {
  orgRegion: DataRegion;
  resourceRegion: DataRegion | null;
  /** Resource descriptor, used in the error message (e.g. "s3 bucket forgemsg-eu-exports"). */
  resource: string;
}

export interface CrossRegionGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Ensure a resource the caller wants to read/write lives in the same region
 * as the org. Returns `allowed: false` with a human-readable reason on
 * mismatch; caller is responsible for throwing / logging.
 */
export function guardCrossRegion(input: CrossRegionGuardInput): CrossRegionGuardResult {
  if (input.resourceRegion === null) {
    return {
      allowed: false,
      reason: `Resource ${input.resource} has no region tag — cannot verify residency`,
    };
  }
  if (input.resourceRegion !== input.orgRegion) {
    return {
      allowed: false,
      reason: `Cross-region access denied: org is in ${input.orgRegion.toUpperCase()} but ${input.resource} is in ${input.resourceRegion.toUpperCase()}`,
    };
  }
  return { allowed: true };
}

// ─── Derive region from user signals ───────────────────────────────────────

/** CZ + typical EU member-state codes. */
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
  // EEA + tightly aligned
  'NO', 'IS', 'LI', 'CH',
]);

const APAC_COUNTRIES = new Set([
  'AU', 'NZ', 'JP', 'SG', 'HK', 'TW', 'KR', 'IN', 'ID', 'MY', 'TH', 'VN', 'PH',
]);

/**
 * Best-effort default data region for a brand-new signup. GDPR-heavy
 * countries route to EU; APAC routes to AP; everything else to US. The
 * caller can override before persisting; we never automatically move
 * existing tenants.
 */
export function suggestRegionForCountry(countryCode: string): DataRegion {
  const cc = countryCode.trim().toUpperCase();
  if (EU_COUNTRIES.has(cc)) return 'eu';
  if (APAC_COUNTRIES.has(cc)) return 'ap';
  return 'us';
}
