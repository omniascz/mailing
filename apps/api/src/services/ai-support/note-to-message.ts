/**
 * Aura Support Agent — note-to-message (#248).
 *
 * Converts a rough agent note (bullet points, shorthand) into a polished
 * customer-facing message. Supports context from the ticket subject.
 */

import { callClaude, cacheKey, CACHE_TTL } from '../../lib/ai-client.js';
import { redis } from '@forgemsg/shared/redis';

export interface NoteToMessageResult {
  note: string;
  message: string;
  tokensUsed: number;
}

const SYSTEM_PROMPT = `You are Aura, a customer support writing assistant.
Convert the agent's internal note into a professional, customer-facing reply.
Keep it concise and friendly. Output ONLY the final message — no explanation.`;

export async function noteToMessage(
  orgId: string,
  note: string,
  context?: { ticketSubject?: string; tone?: string },
): Promise<NoteToMessageResult> {
  const cKey = cacheKey('aura_note_to_msg', `${orgId}:${note.slice(0, 150)}`);
  const cached = await redis.get(cKey);
  if (cached) return JSON.parse(cached) as NoteToMessageResult;

  const contextStr = context?.ticketSubject ? `Ticket subject: ${context.ticketSubject}\n` : '';
  const toneStr = context?.tone ? `Desired tone: ${context.tone}\n` : '';
  const userPrompt = `${contextStr}${toneStr}\nAgent note:\n${note}`;

  const result = await callClaude({
    tenantId: orgId,
    system: SYSTEM_PROMPT,
    user: userPrompt,
    model: 'claude-haiku-4-5-20251001',
    feature: 'other',
    maxTokens: 512,
  });

  const out: NoteToMessageResult = {
    note,
    message: result.text.trim(),
    tokensUsed: result.inputTokens + result.outputTokens,
  };

  await redis.setex(cKey, CACHE_TTL, JSON.stringify(out));
  return out;
}
