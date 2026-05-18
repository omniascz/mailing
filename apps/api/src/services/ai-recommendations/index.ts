import { callClaude, cacheKey } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';

const CACHE_TTL = 300; // 5 min

export interface RecommendationContext {
  currentPage: string; // e.g. 'campaigns/list', 'contacts/detail', 'segments/builder'
  entityId?: string;
  entityType?: 'campaign' | 'contact' | 'segment' | 'workflow';
  entityData?: Record<string, unknown>; // snapshot of current entity
  recentActions?: string[];
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  actionType: 'navigate' | 'create' | 'optimize' | 'info';
  actionLabel: string;
  actionPayload?: Record<string, unknown>;
  priority: 'high' | 'medium' | 'low';
  icon?: string;
}

const SYSTEM_PROMPT = `You are an AI marketing assistant helping users of a B2C email/SMS marketing platform.
Based on what the user is currently viewing, suggest 3-5 helpful next actions or insights.
Output JSON only. Be specific and actionable. In Czech language.`;

export async function getRecommendations(
  orgId: string,
  context: RecommendationContext,
  model: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' = 'claude-haiku-4-5-20251001',
): Promise<Recommendation[]> {
  const key = cacheKey('recommendations', `${orgId}:${context.currentPage}:${context.entityId ?? ''}`);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as Recommendation[];

  const result = await callClaude({
    tenantId: orgId,
    model,
    feature: 'recommendations',
    system: SYSTEM_PROMPT,
    user: `Current context:
Page: ${context.currentPage}
${context.entityType ? `Entity: ${context.entityType} (${context.entityId})` : ''}
${context.entityData ? `Data snapshot: ${JSON.stringify(context.entityData).slice(0, 500)}` : ''}
${context.recentActions?.length ? `Recent actions: ${context.recentActions.join(', ')}` : ''}

Output:
[
  {
    "id": "unique-id",
    "title": "...",
    "description": "...",
    "actionType": "navigate|create|optimize|info",
    "actionLabel": "...",
    "actionPayload": {},
    "priority": "high|medium|low",
    "icon": "sparkles"
  }
]`,
  });

  const recommendations = JSON.parse(result.text) as Recommendation[];
  await redis.set(key, JSON.stringify(recommendations), 'EX', CACHE_TTL);
  return recommendations;
}
