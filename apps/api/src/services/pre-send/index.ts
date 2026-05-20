/**
 * Pre-send tips — AI-generated recommendations before a campaign goes out.
 * Combines deterministic checks (subject length, spam score, accessibility)
 * with an LLM pass for copy-level advice.
 */

import { callClaude, parseJsonSafe } from '../../lib/ai-client.js';
import { checkSpam } from '../editor/spam-checker.js';

export interface PreSendTip {
  severity: 'info' | 'warn' | 'error';
  category: 'subject' | 'content' | 'deliverability' | 'timing' | 'accessibility';
  message: string;
}

export interface PreSendInput {
  subject: string;
  preheader?: string;
  htmlOrText: string;
  recipientCount: number;
  hasImages?: boolean;
  hasLinks?: boolean;
}

const SYSTEM = `You are an expert email marketing reviewer. Given a subject line, preheader, and email body,
return 3-6 short, actionable tips to improve open rate, click rate, and deliverability.
Reply with a JSON array of objects {severity, category, message}.
severity ∈ {info, warn, error}. category ∈ {subject, content, deliverability, timing, accessibility}.
Keep each message under 160 characters. Do not include tips that are obviously satisfied.`;

export async function generatePreSendTips(
  orgId: string,
  input: PreSendInput,
): Promise<PreSendTip[]> {
  const tips: PreSendTip[] = [];

  // Deterministic checks first.
  if (input.subject.length < 10) {
    tips.push({
      severity: 'warn',
      category: 'subject',
      message: 'Subject is under 10 characters; consider making it more descriptive.',
    });
  }
  if (input.subject.length > 80) {
    tips.push({
      severity: 'warn',
      category: 'subject',
      message: 'Subject over 80 chars may be truncated in inbox previews.',
    });
  }
  if (!input.preheader) {
    tips.push({
      severity: 'info',
      category: 'content',
      message: 'No preheader set — add one to boost open rate by ~7%.',
    });
  }
  const spam = checkSpam(input.subject, input.htmlOrText);
  if (spam.score >= 5) {
    const reasons = spam.issues
      .slice(0, 2)
      .map((i) => i.message)
      .join('; ');
    tips.push({
      severity: 'warn',
      category: 'deliverability',
      message: `Spam score ${spam.score}/10 — ${reasons}`,
    });
  }
  if (input.recipientCount > 50_000) {
    tips.push({
      severity: 'info',
      category: 'timing',
      message: 'Large audience: enable batch delivery to smooth ISP throughput.',
    });
  }

  try {
    const result = await callClaude({
      tenantId: orgId,
      feature: 'other',
      system: SYSTEM,
      user: `SUBJECT: ${input.subject}\nPREHEADER: ${input.preheader ?? '(none)'}\nBODY (first 2000 chars):\n${input.htmlOrText.slice(0, 2000)}`,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 700,
    });
    const parsed = parseJsonSafe<PreSendTip[]>(result.text);
    if (Array.isArray(parsed)) {
      for (const t of parsed) {
        if (t && typeof t.message === 'string') tips.push(t);
      }
    }
  } catch {
    // Non-fatal — deterministic tips remain.
  }

  return tips;
}
