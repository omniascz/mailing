/**
 * Sklik (Seznam.cz) lookalike audience creation (#636).
 *
 * Sklik uses the RTB platform audience API. Lookalike audiences
 * (Similar Audiences) are created from an existing RTB audience
 * by calling the audience/create endpoint with type=SIMILAR.
 *
 * API docs: https://api.sklik.cz/drak/json/
 * Auth: OAuth2 bearer token (same as audience-sync.ts)
 */

import { SKLIK_API_BASE } from '../../../../integrations/sklik/pure.js';

export interface SklikLookalikeResult {
  lookalikeAudienceId: string;
  name: string;
  sourceAudienceId: string;
  countryCode: string;
  estimatedSize?: number;
}

/**
 * Create a lookalike audience from an existing Sklik RTB audience.
 *
 * @param accessToken - OAuth2 access token
 * @param sourceAudienceId - RTB audience ID to seed from
 * @param name - name for the lookalike audience (max 64 chars)
 * @param countryCode - ISO 3166-1 alpha-2 (default: 'CZ')
 * @param ratio - expansion ratio 1-10 (1=narrow/high-quality, 10=broad)
 */
export async function createSklikLookalike(
  accessToken: string,
  sourceAudienceId: string,
  name: string,
  countryCode = 'CZ',
  ratio = 3,
  fetchImpl: typeof fetch = fetch,
): Promise<SklikLookalikeResult> {
  const url = `${SKLIK_API_BASE}/drak/json/rtb/audience/create`;

  const body = {
    audienceName: name.slice(0, 64),
    type: 'SIMILAR',
    sourceAudienceId,
    countryCode,
    expansionRatio: Math.max(1, Math.min(10, ratio)),
  };

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Sklik lookalike failed: HTTP ${res.status} — ${text}`);

  const json = JSON.parse(text) as {
    audienceId?: string;
    estimatedSize?: number;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) throw new Error(`Sklik lookalike error: ${json.errors[0]?.message}`);
  if (!json.audienceId) throw new Error('Sklik lookalike: no audienceId in response');

  return {
    lookalikeAudienceId: json.audienceId,
    name,
    sourceAudienceId,
    countryCode,
    estimatedSize: json.estimatedSize,
  };
}

// ─── Sklik conversion tracking ────────────────────────────────────────────────

export interface SklikConversionGoal {
  id: string;
  name: string;
  type: 'page_visit' | 'purchase' | 'lead' | 'custom';
  value?: number;
  currency?: string;
}

export interface SklikConversionEvent {
  goalId: string;
  orderId?: string;
  value?: number;
  currency?: string;
  timestamp?: Date;
}

/**
 * List conversion goals for an account.
 */
export async function listSklikConversionGoals(
  accessToken: string,
  accountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SklikConversionGoal[]> {
  const res = await fetchImpl(`${SKLIK_API_BASE}/drak/json/conversions/list?accountId=${encodeURIComponent(accountId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Sklik list conversions failed: HTTP ${res.status} — ${text}`);

  const json = JSON.parse(text) as {
    goals?: Array<{ id: string; name: string; type: string; value?: number; currency?: string }>;
  };

  return (json.goals ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type as SklikConversionGoal['type'],
    value: g.value,
    currency: g.currency,
  }));
}

/**
 * Report a conversion event to Sklik.
 * Used for server-side conversion tracking (no JS pixel required).
 */
export async function reportSklikConversion(
  accessToken: string,
  accountId: string,
  event: SklikConversionEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const body = {
    accountId,
    goalId: event.goalId,
    orderId: event.orderId ?? null,
    value: event.value ?? 0,
    currency: event.currency ?? 'CZK',
    timestamp: (event.timestamp ?? new Date()).toISOString(),
  };

  const res = await fetchImpl(`${SKLIK_API_BASE}/drak/json/conversions/report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sklik conversion report failed: HTTP ${res.status} — ${text}`);
  }
}
