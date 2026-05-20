/**
 * Aura Support Agent — conversation summarizer (#248).
 *
 * Given a helpdesk ticket with its messages, produces a structured summary:
 *   - Issue description
 *   - Key actions taken
 *   - Current status / next steps
 *   - Sentiment (positive / neutral / negative)
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { helpdeskTickets, ticketMessages } from '../../db/schema/helpdesk.js';
import { callClaude, cacheKey, CACHE_TTL } from '../../lib/ai-client.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/app-error.js';

export interface ConversationSummary {
  issue: string;
  actionsTaken: string[];
  nextSteps: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  suggestedTags: string[];
  tokensUsed: number;
}

const SYSTEM_PROMPT = `You are Aura, an intelligent customer support assistant.
Summarize the provided customer support conversation into structured JSON.
Output ONLY valid JSON, no markdown, no explanation.
Schema: { "issue": string, "actionsTaken": string[], "nextSteps": string[], "sentiment": "positive"|"neutral"|"negative", "suggestedTags": string[] }`;

export async function summarizeConversation(
  orgId: string,
  ticketId: string,
): Promise<ConversationSummary> {
  const [ticket] = await db
    .select()
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)))
    .limit(1);
  if (!ticket) throw AppError.notFound('Ticket');

  const messages = await db
    .select()
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(ticketMessages.createdAt);

  const transcript = messages
    .map((m) => `[${m.direction === 'inbound' ? 'Customer' : 'Agent'}]: ${m.body}`)
    .join('\n');

  const cKey = cacheKey('aura_summarize', `${orgId}:${ticketId}:${messages.length}`);
  const cached = await redis.get(cKey);
  if (cached) return JSON.parse(cached) as ConversationSummary;

  const userPrompt = `Ticket subject: ${ticket.subject}\n\nConversation:\n${transcript}`;

  const result = await callClaude({
    tenantId: orgId,
    system: SYSTEM_PROMPT,
    user: userPrompt,
    model: 'claude-haiku-4-5-20251001',
    feature: 'other',
    maxTokens: 512,
  });

  let parsed: Omit<ConversationSummary, 'tokensUsed'>;
  try {
    parsed = JSON.parse(result.text) as Omit<ConversationSummary, 'tokensUsed'>;
  } catch {
    parsed = {
      issue: ticket.subject,
      actionsTaken: [],
      nextSteps: [],
      sentiment: 'neutral',
      suggestedTags: [],
    };
  }

  const summary: ConversationSummary = {
    ...parsed,
    tokensUsed: result.inputTokens + result.outputTokens,
  };
  await redis.setex(cKey, CACHE_TTL, JSON.stringify(summary));
  return summary;
}
