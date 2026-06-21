/**
 * Sender reputation monitoring — #354, #372.
 *
 * Aggregates reputation signals from:
 *   - SenderScore (ReturnPath / Validity)       — score 0–100
 *   - Google Postmaster Tools API               — spam rate, domain reputation
 *   - Microsoft SNDS                            — trap hits, complaint rate
 *   - Seznam.cz Postmaster (CZ-unique — #372)  — feedback / reputation tier
 *
 * All adapters return the shared `ReputationResult` shape. Call
 * `fetchAllReputation(orgId, domain)` to fan-out in parallel and merge.
 *
 * Redis caches individual provider responses for 4 hours to respect rate
 * limits and avoid excessive external calls.
 */

import { redis } from '../../lib/redis.js';

const CACHE_TTL = 4 * 3600; // 4 hours

// ─── Shared output type ───────────────────────────────────────────────────────

export type ReputationTier = 'high' | 'medium' | 'low' | 'unknown';

export interface ProviderReputation {
  provider: 'senderscore' | 'google_postmaster' | 'microsoft_snds' | 'seznam_postmaster';
  domain: string;
  score?: number; // 0–100 where available
  tier: ReputationTier;
  spamRate?: number; // 0–1
  trapHits?: number;
  complaintRate?: number; // 0–1
  details: Record<string, unknown>;
  fetchedAt: string; // ISO
  error?: string;
}

export interface AggregatedReputation {
  domain: string;
  overallTier: ReputationTier;
  overallScore: number | null; // weighted average 0–100 when available
  providers: ProviderReputation[];
  checkedAt: string;
}

// ─── SenderScore (Validity) ───────────────────────────────────────────────────
// Public lookup: https://www.senderscore.org/lookup.php?lookup=<ip or domain>
// There is no public JSON API; we use their DNS-based lookup (RBL-style query).
// For a proper integration, the Validity / Return Path enterprise API is used.

export async function fetchSenderScore(
  domain: string,
  senderScoreApiKey?: string,
): Promise<ProviderReputation> {
  const cacheKey = `rep:senderscore:${domain}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as ProviderReputation;

  const fetchedAt = new Date().toISOString();

  try {
    if (!senderScoreApiKey) {
      // DNS-based heuristic: query MX + SPF + DMARC as proxy for reputation
      // Real integration would call Validity Sender Certification API
      const result: ProviderReputation = {
        provider: 'senderscore',
        domain,
        tier: 'unknown',
        details: { note: 'API key not configured — set SENDERSCORE_API_KEY' },
        fetchedAt,
      };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
      return result;
    }

    // Validity Sender Score API v2
    const url = `https://api.senderscore.org/v2/domain/${encodeURIComponent(domain)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${senderScoreApiKey}`, Accept: 'application/json' },
    });

    if (!res.ok) throw new Error(`SenderScore API ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;

    const score = typeof data['score'] === 'number' ? (data['score'] as number) : undefined;
    const tier = scoreToTier(score);

    const result: ProviderReputation = {
      provider: 'senderscore',
      domain,
      score,
      tier,
      spamRate: typeof data['complaint_rate'] === 'number'
        ? (data['complaint_rate'] as number) / 100
        : undefined,
      details: data,
      fetchedAt,
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  } catch (err) {
    const result: ProviderReputation = {
      provider: 'senderscore',
      domain,
      tier: 'unknown',
      details: {},
      fetchedAt,
      error: err instanceof Error ? err.message : String(err),
    };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 600);
    return result;
  }
}

// ─── Google Postmaster Tools ──────────────────────────────────────────────────
// OAuth 2.0 service account. Requires domain verified in Google Search Console.
// API: https://gmailpostmastertools.googleapis.com/v1/domains/{domain}/trafficStats

export async function fetchGooglePostmaster(
  domain: string,
  accessToken?: string,
): Promise<ProviderReputation> {
  const cacheKey = `rep:google_postmaster:${domain}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as ProviderReputation;

  const fetchedAt = new Date().toISOString();

  try {
    if (!accessToken) {
      const result: ProviderReputation = {
        provider: 'google_postmaster',
        domain,
        tier: 'unknown',
        details: { note: 'GOOGLE_POSTMASTER_TOKEN not configured' },
        fetchedAt,
      };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
      return result;
    }

    // Fetch last 7 days of traffic stats; use the most recent date
    const today = new Date();
    const endDate = formatGoogleDate(today);
    const startDate = formatGoogleDate(new Date(today.getTime() - 6 * 86400_000));

    const url = `https://gmailpostmastertools.googleapis.com/v1/domains/${encodeURIComponent(domain)}/trafficStats` +
      `?startDate.year=${startDate.year}&startDate.month=${startDate.month}&startDate.day=${startDate.day}` +
      `&endDate.year=${endDate.year}&endDate.month=${endDate.month}&endDate.day=${endDate.day}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    if (res.status === 404) {
      // Domain not registered in Postmaster
      const result: ProviderReputation = {
        provider: 'google_postmaster',
        domain,
        tier: 'unknown',
        details: { note: 'Domain not found in Google Postmaster — verify domain ownership first' },
        fetchedAt,
      };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
      return result;
    }
    if (!res.ok) throw new Error(`Google Postmaster API ${res.status}`);

    const data = (await res.json()) as { trafficStats?: Array<Record<string, unknown>> };
    const stats = data.trafficStats ?? [];
    const latest = stats[stats.length - 1] ?? {};

    // Google uses REPUTATION enum: HIGH / MEDIUM / LOW / BAD
    const domainReputation = (latest['domainReputation'] as string | undefined) ?? 'UNKNOWN';
    const tier = googleReputationToTier(domainReputation);

    const spamRate = typeof latest['spamRateRatio'] === 'number'
      ? (latest['spamRateRatio'] as number)
      : undefined;

    const result: ProviderReputation = {
      provider: 'google_postmaster',
      domain,
      tier,
      spamRate,
      score: tier === 'high' ? 90 : tier === 'medium' ? 65 : tier === 'low' ? 30 : undefined,
      details: { domainReputation, latestStats: latest },
      fetchedAt,
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  } catch (err) {
    const result: ProviderReputation = {
      provider: 'google_postmaster',
      domain,
      tier: 'unknown',
      details: {},
      fetchedAt,
      error: err instanceof Error ? err.message : String(err),
    };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 600);
    return result;
  }
}

// ─── Microsoft SNDS (Smart Network Data Services) ────────────────────────────
// Free service. IP-based. Requires registration at https://sendersupport.olc.protection.outlook.com/snds/
// CSV download: https://sendersupport.olc.protection.outlook.com/snds/data.aspx?key=<apiKey>

export async function fetchMicrosoftSNDS(
  domain: string,
  sndsApiKey?: string,
): Promise<ProviderReputation> {
  const cacheKey = `rep:microsoft_snds:${domain}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as ProviderReputation;

  const fetchedAt = new Date().toISOString();

  try {
    if (!sndsApiKey) {
      const result: ProviderReputation = {
        provider: 'microsoft_snds',
        domain,
        tier: 'unknown',
        details: { note: 'MICROSOFT_SNDS_API_KEY not configured' },
        fetchedAt,
      };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
      return result;
    }

    // SNDS returns CSV data for all IPs associated with the registered account
    const url = `https://sendersupport.olc.protection.outlook.com/snds/data.aspx?key=${sndsApiKey}`;
    const res = await fetch(url, { headers: { Accept: 'text/plain' } });
    if (!res.ok) throw new Error(`SNDS API ${res.status}`);

    const csv = await res.text();
    const parsed = parseSNDSCsv(csv);

    // Aggregate across all IPs: use worst-case signals
    const worstTrapRate = Math.max(0, ...parsed.map((r) => r.trapHitRate));
    const worstComplaint = Math.max(0, ...parsed.map((r) => r.complaintRate));
    const filterVerdict = parsed.find((r) => r.filterVerdict !== 'GREEN')?.filterVerdict ?? 'GREEN';

    const tier: ReputationTier =
      filterVerdict === 'RED' || worstTrapRate > 0.05
        ? 'low'
        : filterVerdict === 'YELLOW' || worstComplaint > 0.003
          ? 'medium'
          : 'high';

    const result: ProviderReputation = {
      provider: 'microsoft_snds',
      domain,
      tier,
      trapHits: parsed.reduce((s, r) => s + r.trapHitCount, 0),
      complaintRate: worstComplaint,
      details: { ipCount: parsed.length, filterVerdict, worstTrapRate },
      fetchedAt,
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  } catch (err) {
    const result: ProviderReputation = {
      provider: 'microsoft_snds',
      domain,
      tier: 'unknown',
      details: {},
      fetchedAt,
      error: err instanceof Error ? err.message : String(err),
    };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 600);
    return result;
  }
}

// ─── Seznam.cz Postmaster — CZ-unique (#372) ─────────────────────────────────
// Seznam's Postmaster portal: https://postmaster.seznam.cz
// They provide a JSON API for registered/verified domains with delivery stats.
// Authentication: API key obtained by verifying domain ownership at Seznam Postmaster.
// Base URL: https://postmaster.seznam.cz/api/v1/

export async function fetchSeznamPostmaster(
  domain: string,
  seznamApiKey?: string,
): Promise<ProviderReputation> {
  const cacheKey = `rep:seznam_postmaster:${domain}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as ProviderReputation;

  const fetchedAt = new Date().toISOString();

  try {
    if (!seznamApiKey) {
      const result: ProviderReputation = {
        provider: 'seznam_postmaster',
        domain,
        tier: 'unknown',
        details: { note: 'SEZNAM_POSTMASTER_API_KEY not configured' },
        fetchedAt,
      };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
      return result;
    }

    // Seznam Postmaster — stats endpoint
    const url = `https://postmaster.seznam.cz/api/v1/domains/${encodeURIComponent(domain)}/stats`;
    const res = await fetch(url, {
      headers: { 'X-API-Key': seznamApiKey, Accept: 'application/json' },
    });

    if (res.status === 404) {
      const result: ProviderReputation = {
        provider: 'seznam_postmaster',
        domain,
        tier: 'unknown',
        details: { note: 'Domain not verified in Seznam Postmaster' },
        fetchedAt,
      };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
      return result;
    }
    if (!res.ok) throw new Error(`Seznam Postmaster API ${res.status}`);

    const data = (await res.json()) as Record<string, unknown>;

    // Seznam returns: reputation_score (0-100), spam_rate, rejection_rate, reputation_label
    const score = typeof data['reputation_score'] === 'number'
      ? (data['reputation_score'] as number)
      : undefined;
    const reputationLabel = (data['reputation_label'] as string | undefined) ?? '';
    const tier: ReputationTier = seznamLabelToTier(reputationLabel, score);

    const spamRate = typeof data['spam_rate'] === 'number'
      ? (data['spam_rate'] as number)
      : undefined;

    const result: ProviderReputation = {
      provider: 'seznam_postmaster',
      domain,
      score,
      tier,
      spamRate,
      details: data,
      fetchedAt,
    };

    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  } catch (err) {
    const result: ProviderReputation = {
      provider: 'seznam_postmaster',
      domain,
      tier: 'unknown',
      details: {},
      fetchedAt,
      error: err instanceof Error ? err.message : String(err),
    };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 600);
    return result;
  }
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

export async function fetchAllReputation(
  domain: string,
  options?: {
    senderScoreApiKey?: string;
    googleAccessToken?: string;
    sndsApiKey?: string;
    seznamApiKey?: string;
  },
): Promise<AggregatedReputation> {
  const opts = options ?? {};

  const [senderscore, google, snds, seznam] = await Promise.all([
    fetchSenderScore(domain, opts.senderScoreApiKey ?? process.env['SENDERSCORE_API_KEY']),
    fetchGooglePostmaster(domain, opts.googleAccessToken ?? process.env['GOOGLE_POSTMASTER_TOKEN']),
    fetchMicrosoftSNDS(domain, opts.sndsApiKey ?? process.env['MICROSOFT_SNDS_API_KEY']),
    fetchSeznamPostmaster(domain, opts.seznamApiKey ?? process.env['SEZNAM_POSTMASTER_API_KEY']),
  ]);

  const providers = [senderscore, google, snds, seznam];
  const knownTiers = providers
    .filter((p) => p.tier !== 'unknown')
    .map((p) => p.tier);

  const overallTier: ReputationTier =
    knownTiers.length === 0
      ? 'unknown'
      : knownTiers.includes('low')
        ? 'low'
        : knownTiers.includes('medium')
          ? 'medium'
          : 'high';

  const scores = providers.filter((p) => p.score !== undefined).map((p) => p.score as number);
  const overallScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return {
    domain,
    overallTier,
    overallScore,
    providers,
    checkedAt: new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreToTier(score: number | undefined): ReputationTier {
  if (score === undefined) return 'unknown';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function googleReputationToTier(label: string): ReputationTier {
  switch (label.toUpperCase()) {
    case 'HIGH': return 'high';
    case 'MEDIUM': return 'medium';
    case 'LOW':
    case 'BAD': return 'low';
    default: return 'unknown';
  }
}

function seznamLabelToTier(label: string, score?: number): ReputationTier {
  const l = label.toLowerCase();
  if (l === 'good' || l === 'dobrá' || l === 'výborná') return 'high';
  if (l === 'neutral' || l === 'průměrná' || l === 'střední') return 'medium';
  if (l === 'bad' || l === 'špatná' || l === 'problematická') return 'low';
  return scoreToTier(score);
}

interface SNDSRow {
  ip: string;
  filterVerdict: string;
  trapHitRate: number;
  trapHitCount: number;
  complaintRate: number;
}

function parseSNDSCsv(csv: string): SNDSRow[] {
  const rows: SNDSRow[] = [];
  for (const line of csv.split('\n')) {
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length < 5 || parts[0] === 'IP Range') continue;
    rows.push({
      ip: parts[0] ?? '',
      filterVerdict: (parts[4] ?? 'GREEN').toUpperCase(),
      trapHitRate: parseFloat(parts[2] ?? '0') / 100,
      trapHitCount: parseInt(parts[3] ?? '0', 10),
      complaintRate: parseFloat(parts[5] ?? '0') / 100,
    });
  }
  return rows;
}

function formatGoogleDate(d: Date): { year: number; month: number; day: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
