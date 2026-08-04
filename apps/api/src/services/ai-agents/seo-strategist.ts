/**
 * Content Strategy AI Agent (#290).
 *
 * Input: seed topic
 * Output: pillar page + spoke blog titles with suggested keywords and outlines.
 *
 * Uses Claude Opus for strategy (requires structured reasoning over SERP
 * intent + topic coverage). Results are cached for 24 h.
 */

import { callClaude, cacheKey } from '../../lib/ai-client.js';
import { redis } from '@forgemsg/shared/redis';

const CACHE_TTL = 86_400; // 24 h

export interface SeoStrategyInput {
  seedTopic: string;
  industry?: string;
  audience?: string;
  /** Existing pillar titles so we don't propose duplicates. */
  existingClusters?: string[];
  language?: string; // default 'cs'
  /** Target country for SERP context (ISO-3166). */
  country?: string; // default 'CZ'
  spokeCount?: number; // default 8
}

export interface SeoSpokeSuggestion {
  title: string;
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  outline: string[]; // H2 headings
  estimatedWordCount: number;
  internalLinkingTargets: string[]; // titles of other spokes / pillar
}

export interface SeoStrategyResult {
  pillarTitle: string;
  pillarSlug: string;
  pillarOutline: string[];
  primaryKeyword: string;
  secondaryKeywords: string[];
  spokes: SeoSpokeSuggestion[];
  rationale: string;
  tokensUsed: number;
}

const SYSTEM_PROMPT = `You are a senior SEO content strategist. You design topic cluster architectures (pillar + spoke) that rank well in Google.

Rules:
- Pillar = broad authoritative guide (2500-4000 words), covers the entire topic.
- Spokes = specific articles (800-1500 words) that each target ONE long-tail query and internally link back to the pillar.
- Spokes MUST cover distinct intents — no two spokes targeting the same primary keyword.
- Primary keyword for each spoke MUST be a query people actually type into Google.
- For Czech market: prefer Czech-language keywords with natural word order and diacritics.
- Output strictly valid JSON matching the schema. No markdown fences, no prose.`;

function buildPrompt(input: SeoStrategyInput): string {
  const lang = input.language ?? 'cs';
  const country = input.country ?? 'CZ';
  const spokes = input.spokeCount ?? 8;
  const existing = input.existingClusters?.length
    ? `\nAvoid overlap with existing pillars: ${input.existingClusters.join(', ')}`
    : '';

  return `Design a topic cluster for:
Seed topic: "${input.seedTopic}"
Industry: ${input.industry ?? 'general'}
Audience: ${input.audience ?? 'professionals'}
Language: ${lang}
Country: ${country}
Spoke count: ${spokes}${existing}

Output JSON:
{
  "pillarTitle": "string (60-70 chars, includes primary keyword)",
  "pillarSlug": "kebab-case",
  "pillarOutline": ["H2 heading 1", "H2 heading 2", ...],
  "primaryKeyword": "main head term the pillar targets",
  "secondaryKeywords": ["supporting keyword 1", "..."],
  "spokes": [
    {
      "title": "string (50-65 chars)",
      "slug": "kebab-case",
      "primaryKeyword": "long-tail query",
      "secondaryKeywords": ["related phrase 1", "..."],
      "searchIntent": "informational" | "commercial" | "transactional" | "navigational",
      "outline": ["H2 heading 1", "..."],
      "estimatedWordCount": 1200,
      "internalLinkingTargets": ["pillar title", "other spoke title"]
    }
  ],
  "rationale": "1-2 paragraph explanation of the cluster strategy"
}`;
}

export async function generateSeoStrategy(
  orgId: string,
  input: SeoStrategyInput,
): Promise<SeoStrategyResult> {
  const key = cacheKey('seo_strategist', `${orgId}:${JSON.stringify(input)}`);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as SeoStrategyResult;

  const result = await callClaude({
    tenantId: orgId,
    model: 'claude-opus-4-6',
    feature: 'seo_strategist',
    system: SYSTEM_PROMPT,
    user: buildPrompt(input),
    maxTokens: 4096,
  });

  const parsed = JSON.parse(result.text) as Omit<SeoStrategyResult, 'tokensUsed'>;
  const output: SeoStrategyResult = {
    ...parsed,
    tokensUsed: result.inputTokens + result.outputTokens,
  };

  await redis.set(key, JSON.stringify(output), 'EX', CACHE_TTL);
  return output;
}
