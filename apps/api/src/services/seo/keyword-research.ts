/**
 * Keyword research service (#288).
 * Primary provider: DataForSEO Labs API.
 * Claude enrichment: classify intent, suggest clusters, generate variants.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { seoKeywords } from '../../db/schema/index.js';
import { callClaude } from '../../lib/ai-client.js';
import { AppError } from '../../lib/app-error.js';

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

interface DataForSeoOptions {
  login: string;
  password: string;
}

function dfsCreds(): DataForSeoOptions {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw AppError.badRequest('DataForSEO credentials not configured');
  return { login, password };
}

function dfsAuth(creds: DataForSeoOptions) {
  return 'Basic ' + Buffer.from(`${creds.login}:${creds.password}`).toString('base64');
}

// ── Fetch keyword data from DataForSEO ────────────────────────────────────────

async function fetchKeywordMetrics(keywords: string[], language: string, country: string) {
  const creds = dfsCreds();
  const res = await fetch(`${DATAFORSEO_BASE}/keywords_data/google_ads/search_volume/live`, {
    method: 'POST',
    headers: { 'Authorization': dfsAuth(creds), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keywords, language_code: language, location_code: countryToLocation(country) }]),
  });
  if (!res.ok) throw AppError.badRequest(`DataForSEO error: ${res.status}`);
  const json = await res.json() as { tasks: Array<{ result: Array<{ keyword: string; search_volume: number; competition: number; cpc: number }> }> };
  return json.tasks[0]?.result ?? [];
}

async function fetchKeywordDifficulty(keywords: string[], language: string, country: string) {
  const creds = dfsCreds();
  const res = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/bulk_keyword_difficulty/live`, {
    method: 'POST',
    headers: { 'Authorization': dfsAuth(creds), 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keywords, language_code: language, location_code: countryToLocation(country) }]),
  });
  if (!res.ok) return [];
  const json = await res.json() as { tasks: Array<{ result: Array<{ keyword: string; keyword_difficulty: number }> }> };
  return json.tasks[0]?.result ?? [];
}

function countryToLocation(country: string): number {
  const map: Record<string, number> = { US: 2840, GB: 2826, DE: 2276, CZ: 2203, SK: 2703 };
  return map[country.toUpperCase()] ?? 2840;
}

// ── Claude enrichment ─────────────────────────────────────────────────────────

async function enrichWithClaude(orgId: string, keywords: string[]) {
  const { text: content } = await callClaude({
    tenantId: orgId,
    feature: 'seo_keyword_enrichment',
    model: 'haiku',
    system: `You are an SEO expert. For each keyword provided, classify:
- intent: one of "informational" | "navigational" | "transactional" | "commercial"
Respond with a JSON array of objects: [{"keyword":"...","intent":"..."}]
Output ONLY the JSON array, no markdown.`,
    user: `Classify intent for these keywords:\n${keywords.map(k => `- ${k}`).join('\n')}`,
    maxTokens: 1024,
  });

  try {
    const parsed = JSON.parse(content) as Array<{ keyword: string; intent: string }>;
    return Object.fromEntries(parsed.map(p => [p.keyword, p.intent]));
  } catch {
    return {} as Record<string, string>;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function researchKeywords(orgId: string, input: {
  keywords: string[];
  language?: string;
  country?: string;
  enrichWithAi?: boolean;
}) {
  const language = input.language ?? 'en';
  const country = input.country ?? 'US';

  const [volumeData, diffData] = await Promise.all([
    fetchKeywordMetrics(input.keywords, language, country),
    fetchKeywordDifficulty(input.keywords, language, country),
  ]);

  const diffMap = Object.fromEntries(diffData.map(d => [d.keyword, d.keyword_difficulty]));
  const intentMap = input.enrichWithAi !== false
    ? await enrichWithClaude(orgId, input.keywords)
    : {} as Record<string, string>;

  const results = input.keywords.map(kw => {
    const vol = volumeData.find(v => v.keyword === kw);
    return {
      keyword: kw,
      searchVolume: vol?.search_volume ?? null,
      difficulty: diffMap[kw] ?? null,
      cpc: vol?.cpc != null ? String(vol.cpc) : null,
      intent: intentMap[kw] ?? null,
    };
  });

  // Upsert into DB
  for (const r of results) {
    await db
      .insert(seoKeywords)
      .values({
        orgId,
        keyword: r.keyword,
        language,
        country,
        searchVolume: r.searchVolume ?? undefined,
        difficulty: r.difficulty ?? undefined,
        cpc: r.cpc ?? undefined,
        intent: r.intent ?? undefined,
        enrichedAt: new Date(),
        rawData: { volumeData: volumeData.find(v => v.keyword === r.keyword) ?? {} },
      })
      .onConflictDoUpdate({
        target: [seoKeywords.orgId, seoKeywords.keyword, seoKeywords.language, seoKeywords.country],
        set: {
          searchVolume: r.searchVolume ?? undefined,
          difficulty: r.difficulty ?? undefined,
          cpc: r.cpc ?? undefined,
          intent: r.intent ?? undefined,
          enrichedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  return results;
}

export async function listKeywords(orgId: string, opts?: { limit?: number; offset?: number }) {
  return db
    .select()
    .from(seoKeywords)
    .where(eq(seoKeywords.orgId, orgId))
    .limit(opts?.limit ?? 100)
    .offset(opts?.offset ?? 0);
}

export async function getSuggestedKeywords(_orgId: string, seedKeyword: string, language = 'en', country = 'US') {
  const creds = dfsCreds();
  const res = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/related_keywords/live`, {
    method: 'POST',
    headers: { 'Authorization': dfsAuth(creds), 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keyword: seedKeyword,
      language_code: language,
      location_code: countryToLocation(country),
      limit: 30,
    }]),
  });
  if (!res.ok) throw AppError.badRequest(`DataForSEO error: ${res.status}`);
  const json = await res.json() as { tasks: Array<{ result: Array<{ keyword: string; keyword_info: { search_volume: number; competition: number; cpc: number } }> }> };
  return (json.tasks[0]?.result ?? []).map(r => ({
    keyword: r.keyword,
    searchVolume: r.keyword_info?.search_volume ?? null,
    cpc: r.keyword_info?.cpc ?? null,
  }));
}
