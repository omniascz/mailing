import { callClaude, cacheKey } from '../../lib/ai-client.js';
import { redis } from '@forgemsg/shared/redis';

const CACHE_TTL = 3600; // 1h

export interface CampaignBuildInput {
  goal: string; // e.g. "Promote summer sale to VIP customers"
  audienceDescription: string;
  brandVoice?: string;
  productContext?: string;
  channelPreference?: 'email' | 'sms' | 'whatsapp' | 'viber';
  language?: string; // default 'cs' for CZ market
}

export interface CampaignBuildResult {
  campaignName: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  suggestedSendTime: string; // ISO datetime recommendation
  suggestedSegmentConditions: Record<string, unknown>[];
  followUpWorkflow?: {
    description: string;
    triggers: string[];
    actions: string[];
  };
  tokensUsed: number;
}

const SYSTEM_PROMPT = `You are an expert email marketing campaign strategist and copywriter for the Czech market.
You create complete, high-converting campaigns based on business goals and audience descriptions.
Always output valid JSON matching the specified schema. No markdown, no explanation.
For Czech market campaigns: use formal Czech language (Vykání) unless instructed otherwise.
Subject lines: max 60 chars. Preheader: max 90 chars.`;

export async function buildCampaign(
  tenantId: string,
  input: CampaignBuildInput,
  model: 'claude-opus-4-6' | 'claude-sonnet-4-6' = 'claude-sonnet-4-6',
): Promise<CampaignBuildResult> {
  const key = cacheKey('campaign_builder', `${tenantId}:${JSON.stringify(input)}`);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as CampaignBuildResult;

  const userPrompt = `Build a complete marketing campaign for:
Goal: ${input.goal}
Audience: ${input.audienceDescription}
Brand voice: ${input.brandVoice ?? 'professional and friendly'}
${input.productContext ? `Product context: ${input.productContext}` : ''}
Channel: ${input.channelPreference ?? 'email'}
Language: ${input.language ?? 'cs'}

Output JSON:
{
  "campaignName": "...",
  "subject": "...",
  "preheader": "...",
  "bodyHtml": "<html>...</html>",
  "bodyText": "...",
  "ctaText": "...",
  "ctaUrl": "https://example.com",
  "suggestedSendTime": "ISO datetime with reasoning as comment",
  "suggestedSegmentConditions": [],
  "followUpWorkflow": { "description": "...", "triggers": [], "actions": [] }
}`;

  const result = await callClaude({
    tenantId,
    model,
    feature: 'campaign_builder',
    system: SYSTEM_PROMPT,
    user: userPrompt,
  });

  const parsed = JSON.parse(result.text) as Omit<CampaignBuildResult, 'tokensUsed'>;
  const output: CampaignBuildResult = {
    ...parsed,
    tokensUsed: result.inputTokens + result.outputTokens,
  };

  await redis.set(key, JSON.stringify(output), 'EX', CACHE_TTL);
  return output;
}
