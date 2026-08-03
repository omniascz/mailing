/**
 * Breeze Social Agent (#299).
 *
 * Input: trending topic / brand context
 * Output: ready-to-publish draft posts for each selected platform with
 * platform-optimised copy, hashtags and CTA variants.
 *
 * Platform constraints applied per channel:
 *   - twitter:    280 chars max, 1-2 hashtags
 *   - linkedin:   1300 chars optimal (max 3000), 3-5 hashtags, professional tone
 *   - facebook:   40-80 chars ideal, 1-2 hashtags, engagement hook
 *   - instagram:  125 chars hook + full caption (up to 2200), 15-25 hashtags
 *   - tiktok:     100 chars caption + 3-5 hashtags, hook-driven
 */

import { callClaude, cacheKey } from '../../lib/ai-client.js';
import { redis } from '@forgemsg/shared/redis';

const CACHE_TTL = 3600;

export type SocialPlatform = 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok';

export interface SocialDraftInput {
  topic: string;
  brandVoice?: string;
  callToAction?: string;
  language?: string; // 'cs' default
  platforms: SocialPlatform[];
  /** Optional link to include (will be placed in CTA). */
  linkUrl?: string;
  /** Trending context (e.g. Seznam/Google Trends keywords). */
  trendingKeywords?: string[];
}

export interface SocialDraftPerPlatform {
  platform: SocialPlatform;
  body: string;
  hashtags: string[];
  suggestedMediaPrompt: string; // for image/video generation
  bestPostTime: string; // e.g. "Tue 10:00 local time"
  hook: string; // first-line attention grabber
  characterCount: number;
}

export interface SocialDraftResult {
  topic: string;
  drafts: SocialDraftPerPlatform[];
  tokensUsed: number;
}

const SYSTEM_PROMPT = `You are a senior social media content creator who writes scroll-stopping posts.

Platform rules (STRICT):
- twitter:   ≤280 chars including hashtags, 1-2 hashtags, conversational
- linkedin:  800-1300 chars ideal, 3-5 hashtags at end, professional thought-leadership
- facebook:  40-80 chars ideal, friendly tone, 1-2 hashtags, engagement question
- instagram: first sentence must hook in ≤125 chars, 15-25 hashtags in first comment placement (but include in hashtags array), emoji friendly
- tiktok:    ≤100 chars, high-energy, 3-5 trending hashtags

For Czech market: use Czech with natural diacritics, avoid direct translations.
Output valid JSON only. No markdown fences.`;

function buildPrompt(input: SocialDraftInput): string {
  const lang = input.language ?? 'cs';
  const trending = input.trendingKeywords?.length
    ? `\nTrending right now: ${input.trendingKeywords.join(', ')}`
    : '';
  const link = input.linkUrl ? `\nLink to include: ${input.linkUrl}` : '';

  return `Create platform-specific social posts.
Topic: "${input.topic}"
Brand voice: ${input.brandVoice ?? 'friendly & helpful'}
CTA: ${input.callToAction ?? 'learn more'}
Language: ${lang}
Platforms: ${input.platforms.join(', ')}${trending}${link}

Output JSON:
{
  "topic": "${input.topic}",
  "drafts": [
    {
      "platform": "twitter|linkedin|facebook|instagram|tiktok",
      "body": "post text without hashtags",
      "hashtags": ["#example"],
      "suggestedMediaPrompt": "image prompt for the post visual",
      "bestPostTime": "Tue 10:00 local time",
      "hook": "first-line attention grabber",
      "characterCount": 123
    }
  ]
}`;
}

export async function generateSocialDrafts(
  orgId: string,
  input: SocialDraftInput,
): Promise<SocialDraftResult> {
  const key = cacheKey('social_agent', `${orgId}:${JSON.stringify(input)}`);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as SocialDraftResult;

  const result = await callClaude({
    tenantId: orgId,
    model: 'claude-opus-4-6',
    feature: 'social_agent',
    system: SYSTEM_PROMPT,
    user: buildPrompt(input),
    maxTokens: 3000,
  });

  const parsed = JSON.parse(result.text) as Omit<SocialDraftResult, 'tokensUsed'>;

  // Enforce platform constraints defensively
  for (const draft of parsed.drafts) {
    const total = `${draft.body}\n${draft.hashtags.join(' ')}`.length;
    draft.characterCount = total;
    if (draft.platform === 'twitter' && total > 280) {
      draft.body = draft.body.slice(0, 280 - draft.hashtags.join(' ').length - 2);
    }
  }

  const output: SocialDraftResult = {
    ...parsed,
    tokensUsed: result.inputTokens + result.outputTokens,
  };
  await redis.set(key, JSON.stringify(output), 'EX', CACHE_TTL);
  return output;
}
