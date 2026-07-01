/**
 * GeoIP resolution for open/click enrichment.
 *
 * Provider-agnostic: when `GEOIP_API_URL` is set (e.g. an ip-api.com-style
 * endpoint with `{ip}` placeholder), `resolveGeo` fetches + parses it; without
 * config it's a no-op so the tracking hot-path is never slowed by default.
 * Resolution is always called fire-and-forget after the event row is written.
 *
 * The pure helpers (`isPublicIp`, `parseGeoResponse`) are unit-tested.
 */

export interface GeoLocation {
  /** ISO-3166 alpha-2, uppercased. */
  country: string | null;
  city: string | null;
}

/** Skip private / loopback / link-local / unspecified addresses. */
export function isPublicIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const s = ip.trim();
  if (!s || s === '::1' || s === '::' || s.startsWith('fe80:') || s.startsWith('fc') || s.startsWith('fd')) {
    return false;
  }
  // IPv4 private ranges
  if (/^10\./.test(s)) return false;
  if (/^192\.168\./.test(s)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return false;
  if (/^127\./.test(s)) return false;
  if (/^169\.254\./.test(s)) return false;
  if (s === '0.0.0.0') return false;
  return true;
}

/**
 * Parse a provider response into a normalized location. Handles the common
 * ip-api.com shape (`countryCode`/`city`/`status`) and generic
 * `country_code`/`country`/`city` fields.
 */
export function parseGeoResponse(raw: unknown): GeoLocation {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.status === 'string' && r.status !== 'success') {
    return { country: null, city: null };
  }
  const countryRaw =
    (r.countryCode as string) ?? (r.country_code as string) ?? (r.country as string) ?? null;
  const country =
    typeof countryRaw === 'string' && countryRaw.length >= 2
      ? countryRaw.slice(0, 2).toUpperCase()
      : null;
  const cityRaw = (r.city as string) ?? null;
  const city = typeof cityRaw === 'string' && cityRaw ? cityRaw.slice(0, 120) : null;
  return { country, city };
}

/**
 * Resolve an IP to a location. Returns null when GeoIP is unconfigured, the IP
 * is private, or the lookup fails. Never throws.
 */
export async function resolveGeo(ip: string | null | undefined): Promise<GeoLocation | null> {
  const template = process.env.GEOIP_API_URL;
  if (!template || !isPublicIp(ip)) return null;
  const url = template.includes('{ip}')
    ? template.replace('{ip}', encodeURIComponent(ip!))
    : `${template}${encodeURIComponent(ip!)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const loc = parseGeoResponse(await res.json());
    return loc.country || loc.city ? loc : null;
  } catch {
    return null;
  }
}
