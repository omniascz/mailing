/**
 * Customer Support Agent (#330).
 *
 * Autonomous first-line support. For every new inbound ticket message the
 * agent:
 *   1. Retrieves relevant KB chunks via RAG (`search`).
 *   2. Reads the recent ticket thread for context.
 *   3. Asks Claude to draft a reply grounded in the retrieved context.
 *   4. Classifies the outcome as `auto_reply` (high confidence answer),
 *      `suggest_draft` (likely answer, human approval) or `escalate`
 *      (confidence low, escalate to human, no reply drafted).
 *
 * The service does NOT send the reply — that's the job of the helpdesk
 * outbound handler. It returns structured output the caller (helpdesk route
 * or workflow) decides what to do with.
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { helpdeskTickets, ticketMessages } from '../../db/schema/helpdesk.js';
import { contacts } from '../../db/schema/contacts.js';
import { callClaude, parseJsonSafe } from '../../lib/ai-client.js';
import { AppError } from '../../lib/app-error.js';
import { search, buildContext, type SearchHit } from '../rag/index.js';

export type SupportOutcome = 'auto_reply' | 'suggest_draft' | 'escalate';

export interface SupportAgentResult {
  ticketId: string;
  outcome: SupportOutcome;
  /** 0–1; Claude's self-reported grounding confidence. */
  confidence: number;
  /** Drafted reply body (empty on `escalate`). */
  reply: string;
  /** Short internal note explaining the decision. */
  internalNote: string;
  citations: Array<{
    documentId: string;
    chunkId: string;
    title: string;
    url: string | null;
    similarity: number;
  }>;
  suggestedTags: string[];
  tokensUsed: number;
}

export interface RunOptions {
  /** Minimum confidence to auto-reply. Default 0.75. */
  autoReplyThreshold?: number;
  /** Minimum confidence to surface a draft. Default 0.45. Below → escalate. */
  draftThreshold?: number;
  /** Limit retrieved chunks. Default 6. */
  topK?: number;
  /** Override the language hint (ISO). Defaults to contact.preferredLocale or 'en'. */
  language?: string;
}

export async function runSupportAgent(
  orgId: string,
  ticketId: string,
  opts?: RunOptions,
): Promise<SupportAgentResult> {
  const [ticket] = await db
    .select()
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)))
    .limit(1);
  if (!ticket) throw AppError.notFound('Ticket not found');

  const messages = await db
    .select()
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt))
    .limit(50);

  const inboundMessages = messages.filter((m) => m.direction === 'inbound');
  const latestInbound = inboundMessages[inboundMessages.length - 1];
  if (!latestInbound) {
    throw AppError.badRequest('Ticket has no inbound message to answer');
  }

  // Retrieve contact for locale.
  let language = opts?.language ?? 'en';
  if (ticket.contactId) {
    const [c] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, ticket.contactId), eq(contacts.orgId, orgId)))
      .limit(1);
    if (c) {
      const locale = (c as { preferredLocale?: string | null }).preferredLocale;
      if (locale) language = opts?.language ?? locale;
    }
  }

  // RAG lookup using subject + latest inbound body.
  const query = `${ticket.subject}\n\n${latestInbound.body}`.slice(0, 4000);
  const hits = await search(orgId, query, {
    topK: opts?.topK ?? 6,
    sourceTypes: ['kb_article', 'helpdesk_ticket', 'blog_post'],
    minSimilarity: 0.2,
  });
  const contextBlock = hits.length ? buildContext(hits) : '';

  const transcript = messages
    .slice(-8)
    .map((m) => `[${m.direction}] ${m.body}`)
    .join('\n---\n');

  const autoThreshold = opts?.autoReplyThreshold ?? 0.75;
  const draftThreshold = opts?.draftThreshold ?? 0.45;

  const result = await callClaude({
    tenantId: orgId,
    model: 'claude-sonnet-4-6',
    feature: 'agent_run',
    system: `You are an autonomous first-line customer support agent. You answer ONLY using the provided KB context. If the KB does not contain enough information to answer confidently, say so and set confidence low. Reply in the customer's language. Output strict JSON only.`,
    user: `Ticket subject: ${ticket.subject}
Ticket channel: ${ticket.channel}
Customer language: ${language}

=== Conversation (last 8 messages) ===
${transcript}

=== Knowledge base context ===
${contextBlock || '(no relevant KB articles found)'}

Task:
Draft a concise, helpful reply to the latest INBOUND message. Use only facts from the KB context. Do not invent product features, prices, or policies. If you must guess, lower your confidence.

Output JSON:
{
  "reply": "the message body, in ${language}, no greeting of 'Dear Customer'; use first name if known",
  "confidence": 0.0-1.0,
  "internalNote": "1-2 sentences for the support team explaining your reasoning",
  "suggestedTags": ["billing", "shipping", ...],
  "needsEscalation": true|false
}`,
    maxTokens: 1200,
  });

  const parsed = parseJsonSafe<{
    reply: string;
    confidence: number;
    internalNote: string;
    suggestedTags?: string[];
    needsEscalation?: boolean;
  }>(result.text) ?? {
    reply: '',
    confidence: 0,
    internalNote: 'LLM returned unparseable response',
    suggestedTags: [],
    needsEscalation: true,
  };

  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  let outcome: SupportOutcome;
  let reply = parsed.reply ?? '';
  if (parsed.needsEscalation) {
    outcome = 'escalate';
    reply = '';
  } else if (confidence >= autoThreshold && hits.length > 0) {
    outcome = 'auto_reply';
  } else if (confidence >= draftThreshold) {
    outcome = 'suggest_draft';
  } else {
    outcome = 'escalate';
    reply = '';
  }

  return {
    ticketId,
    outcome,
    confidence,
    reply,
    internalNote: parsed.internalNote ?? '',
    citations: hits.map((h: SearchHit) => ({
      documentId: h.documentId,
      chunkId: h.chunkId,
      title: h.title,
      url: h.url,
      similarity: h.similarity,
    })),
    suggestedTags: parsed.suggestedTags ?? [],
    tokensUsed: (result.inputTokens + result.outputTokens),
  };
}

/**
 * Persists the agent's draft as an internal (direction='internal') message on
 * the ticket so a human agent can review, edit, or promote it to an outbound
 * reply. Used when outcome === 'suggest_draft'.
 */
export async function persistAgentDraft(
  ticketId: string,
  result: SupportAgentResult,
): Promise<void> {
  if (!result.reply) return;
  const header = `[AI draft · confidence ${(result.confidence * 100).toFixed(0)}%]`;
  const note = result.internalNote ? `\n\n${result.internalNote}` : '';
  const citations = result.citations.length
    ? `\n\nCitations: ${result.citations.map((c) => `${c.title} (${c.similarity.toFixed(2)})`).join('; ')}`
    : '';

  await db.insert(ticketMessages).values({
    ticketId,
    sender: 'ai_agent',
    direction: 'internal',
    body: `${header}\n\n${result.reply}${note}${citations}`,
    attachments: [],
  });
}
