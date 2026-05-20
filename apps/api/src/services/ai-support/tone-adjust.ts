/**
 * Aura Support Agent — tone adjustment (#248).
 *
 * Rewrites a draft agent message to the requested tone:
 *   formal | friendly | empathetic | concise | professional
 *
 * Preserves factual content; only changes register/style.
 */

import { callClaude, cacheKey, CACHE_TTL } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';

export type Tone = 'formal' | 'friendly' | 'empathetic' | 'concise' | 'professional';

export interface ToneAdjustResult {
  original: string;
  adjusted: string;
  tone: Tone;
  tokensUsed: number;
}

const SYSTEM_PROMPT = `You are Aura, a customer support writing assistant.
Rewrite the provided message in the requested tone while preserving all factual information.
Output ONLY the rewritten message text — no explanation, no quotes, no markdown.`;

export async function adjustTone(
  orgId: string,
  text: string,
  tone: Tone,
): Promise<ToneAdjustResult> {
  const cKey = cacheKey('aura_tone', `${orgId}:${tone}:${text.slice(0, 120)}`);
  const cached = await redis.get(cKey);
  if (cached) return JSON.parse(cached) as ToneAdjustResult;

  const userPrompt = `Rewrite the following message in a ${tone} tone:\n\n${text}`;

  const result = await callClaude({
    tenantId: orgId,
    system: SYSTEM_PROMPT,
    user: userPrompt,
    model: 'claude-haiku-4-5-20251001',
    feature: 'other',
    maxTokens: 512,
  });

  const out: ToneAdjustResult = {
    original: text,
    adjusted: result.text.trim(),
    tone,
    tokensUsed: result.inputTokens + result.outputTokens,
  };

  await redis.setex(cKey, CACHE_TTL, JSON.stringify(out));
  return out;
}
