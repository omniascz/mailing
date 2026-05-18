/**
 * Sklik (Seznam.cz Business API) OAuth pure-logic helpers (#420).
 *
 * Sklik OAuth follows the standard auth-code flow on Seznam's identity gate
 * (login.szn.cz). The pure parts — authorize URL construction, token-expiry
 * arithmetic, and response normalisation — live here so they get unit-tested
 * without any HTTP calls.
 */

export const SKLIK_OAUTH_AUTHORIZE_URL = 'https://login.szn.cz/api/v1/oauth/auth';
export const SKLIK_OAUTH_TOKEN_URL = 'https://login.szn.cz/api/v1/oauth/token';
export const SKLIK_API_BASE = 'https://api.sklik.cz/drak/json';

/** Default scopes — Sklik separates read & write per resource. */
export const DEFAULT_SCOPES = ['user.read', 'campaign.read', 'campaign.write'] as const;

export interface AuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}

export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  if (!input.clientId) throw new Error('Sklik OAuth: clientId is required');
  if (!input.redirectUri) throw new Error('Sklik OAuth: redirectUri is required');
  if (!input.state) throw new Error('Sklik OAuth: state is required');
  const url = new URL(SKLIK_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', (input.scopes ?? DEFAULT_SCOPES).join(' '));
  url.searchParams.set('state', input.state);
  return url.toString();
}

export interface SklikTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface NormalisedToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

/**
 * Normalise the raw token response into the shape we persist on `ad_accounts`.
 * `now` is injected for deterministic tests; defaults to the current wall clock.
 */
export function normaliseTokenResponse(
  raw: unknown,
  now: Date = new Date(),
): NormalisedToken {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Sklik token response is not an object');
  }
  const r = raw as Partial<SklikTokenResponse>;
  if (typeof r.access_token !== 'string' || !r.access_token) {
    throw new Error('Sklik token response missing access_token');
  }
  const expiresAt =
    typeof r.expires_in === 'number' && r.expires_in > 0
      ? new Date(now.getTime() + r.expires_in * 1000)
      : null;
  const scopes =
    typeof r.scope === 'string' && r.scope.length > 0 ? r.scope.split(/\s+/).filter(Boolean) : [];
  return {
    accessToken: r.access_token,
    refreshToken: typeof r.refresh_token === 'string' ? r.refresh_token : null,
    expiresAt,
    scopes,
  };
}

/**
 * Should we refresh the token before its next use? We refresh when the token
 * either has no expiry (defensive) or is within `skewSeconds` of expiry.
 */
export function shouldRefresh(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
  skewSeconds = 60,
): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - now.getTime() < skewSeconds * 1000;
}

/** Encode form-urlencoded body for token endpoints. */
export function encodeForm(params: Record<string, string>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) usp.set(k, v);
  return usp.toString();
}

/**
 * Validate a redirect URI: must be absolute https (or http://localhost for
 * dev). Sklik's auth gate rejects mismatches, but we fail fast before issuing.
 */
export function isValidRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol === 'https:') return true;
    if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true;
    return false;
  } catch {
    return false;
  }
}
