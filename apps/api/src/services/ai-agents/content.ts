/**
 * Breeze Content Agent (#331).
 *
 * Generalises the single-purpose email copywriter
 * (`POST /api/v1/ai/generate-email`) into a multi-format content generator:
 * blog article, landing-page copy, marketing email, or podcast script — all
 * driven by brand voice + product data.
 *
 * Sonnet-tier (creative long-form). Results cached 1 h per (org, input).
 */

import { callClaude, cacheKey } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';
import { finaliseContent, type ContentFormat, type ContentResult } from './pure.js';

const CACHE_TTL = 3600; // 1 h

export interface ProductData {
  name?: string;
  description?: string;
  features?: string[];
  price?: string;
  url?: string;
}

export interface ContentAgentInput {
  format: ContentFormat;
  topic: string;
  goal?: string;
  brandVoice?: string;
  audience?: string;
  product?: ProductData;
  keywords?: string[];
  language?: string; // 'cs' default
  tone?: string;
  length?: 'short' | 'medium' | 'long';
  callToAction?: string;
}

export interface ContentAgentResult extends ContentResult {
  tokensUsed: number;
}

const SYSTEM_PROMPT = `You are a senior content creator and copywriter. You produce publish-ready long-form content in a requested format, matching a brand voice and grounded in the provided product data.

Rules:
- Write in the requested language with natural phrasing. For Czech/Slovak use correct diacritics and word order — never translate literally.
- Ground every claim in the supplied product data. Do NOT invent features, prices, or statistics.
- Match the requested brand voice and tone consistently throughout.
- Weave the target keywords in naturally for SEO — never keyword-stuff.
- Output STRICTLY valid JSON matching the schema. No markdown fences, no commentary.`;

const FORMAT_GUIDE: Record<ContentFormat, string> = {
  blog: 'A structured blog article: compelling title, 4-7 H2 sections with 1-3 paragraphs each, closing with a CTA. Provide a meta description (≤155 chars) and a URL slug.',
  landing:
    'Landing-page copy: hero headline as the title; sections cover hero subheading, value propositions, key features, social proof, and a strong closing CTA. Conversion-focused and benefit-led.',
  email:
    'A marketing email: subject line as the title; sections cover preheader, hook, body, and CTA. Scannable, with one clear action.',
  podcast_script:
    'A podcast script: episode title, then ordered podcastSegments with a "speaker" (e.g. Host, Guest, Narrator) and "text". Conversational spoken rhythm; include an intro and an outro segment.',
};

const LENGTH_WORDS: Record<NonNullable<ContentAgentInput['length']>, string> = {
  short: '300-500',
  medium: '700-1000',
  long: '1500-2500',
};

function buildPrompt(input: ContentAgentInput): string {
  const lang = input.language ?? 'cs';
  const words = LENGTH_WORDS[input.length ?? 'medium'];
  const p = input.product;
  const productBlock = p
    ? `\nProduct data:\n- Name: ${p.name ?? '—'}\n- Description: ${p.description ?? '—'}\n- Features: ${p.features?.join('; ') ?? '—'}\n- Price: ${p.price ?? '—'}\n- URL: ${p.url ?? '—'}`
    : '';
  const kw = input.keywords?.length ? `\nTarget keywords: ${input.keywords.join(', ')}` : '';
  const cta = input.callToAction ? `\nDesired call-to-action: ${input.callToAction}` : '';

  const shape =
    input.format === 'podcast_script'
      ? '"podcastSegments": [{ "speaker": "Host|Guest|Narrator", "text": "spoken line" }]'
      : '"sections": [{ "heading": "section heading", "body": "markdown paragraphs" }]';

  return `Create ${input.format} content.
Format guide: ${FORMAT_GUIDE[input.format]}
Topic: "${input.topic}"
Goal: ${input.goal ?? 'inform & engage the reader'}
Audience: ${input.audience ?? 'general audience'}
Brand voice: ${input.brandVoice ?? 'friendly, clear, credible'}
Tone: ${input.tone ?? 'professional yet approachable'}
Language: ${lang}
Target length: ~${words} words${kw}${cta}${productBlock}

Output JSON:
{
  "title": "string",
  "slug": "kebab-case url slug",
  "metaDescription": "≤155 char summary for SEO / preview",
  ${shape},
  "callToAction": "single clear call-to-action line",
  "keywords": ["keyword actually used", "..."]
}`;
}

export async function generateContent(
  orgId: string,
  input: ContentAgentInput,
): Promise<ContentAgentResult> {
  const key = cacheKey('content_agent', `${orgId}:${JSON.stringify(input)}`);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as ContentAgentResult;

  const result = await callClaude({
    tenantId: orgId,
    model: 'claude-sonnet-4-6',
    feature: 'content_agent',
    system: SYSTEM_PROMPT,
    user: buildPrompt(input),
    maxTokens: 4096,
  });

  const raw = JSON.parse(result.text);
  const output: ContentAgentResult = {
    ...finaliseContent(input.format, raw),
    tokensUsed: result.inputTokens + result.outputTokens,
  };

  await redis.set(key, JSON.stringify(output), 'EX', CACHE_TTL);
  return output;
}
