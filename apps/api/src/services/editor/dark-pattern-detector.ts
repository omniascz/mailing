/**
 * Dark pattern detector for email content.
 * Identifies manipulative, deceptive, or ethically questionable practices
 * before sending. No competitor has this built-in.
 */
import { callClaude } from '../../lib/ai-client.js';

export type Severity = 'info' | 'warning' | 'error';

export interface DarkPatternIssue {
  type: string;
  severity: Severity;
  description: string;
  evidence: string;
  suggestion: string;
}

export interface DarkPatternResult {
  score: number; // 0 (clean) – 10 (very manipulative)
  issues: DarkPatternIssue[];
  aiSummary?: string;
  passedChecks: string[];
}

// ─── Rule-based checks ────────────────────────────────────────────────────────

const URGENCY_PATTERNS = [
  /only\s+\d+\s+(left|remain|available)/i,
  /\d+\s+(items?\s+)?in\s+stock/i,
  /selling\s+fast/i,
  /almost\s+gone/i,
  /last\s+chance/i,
  /expires?\s+(today|tonight|in\s+\d+\s+hour)/i,
  /limited\s+time\s+only/i,
];

const GUILT_PATTERNS = [
  /no[,.]?\s*(thanks|thank you)[,.]?\s*i\s+(don'?t|do\s+not)\s+want/i,
  /i\s+(hate|don'?t\s+want)\s+(saving|discount|deal|money)/i,
  /keep\s+paying\s+full\s+price/i,
  /miss\s+out/i,
];

const MISLEADING_UNSUB = [/unsubscribe/i, /opt.out/i, /stop\s+emails/i];

const CLICKBAIT_SUBJECTS = [
  /you\s+(won'?t|will\s+not)\s+believe/i,
  /this\s+one\s+weird\s+trick/i,
  /doctors?\s+hate/i,
  /\[?urgent\]?/i,
  /\[?warning\]?/i,
  /your\s+account\s+will\s+be\s+(closed|deleted|suspended)/i,
];

function extractText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ruleBasedCheck(subject: string, html: string): DarkPatternIssue[] {
  const issues: DarkPatternIssue[] = [];
  const text = extractText(html);

  for (const pattern of URGENCY_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      issues.push({
        type: 'fake_urgency',
        severity: 'warning',
        description: 'Potentially false scarcity or urgency claim',
        evidence: m[0],
        suggestion: 'Only use urgency claims when stock/deadline is real and verifiable',
      });
      break;
    }
  }

  for (const pattern of GUILT_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      issues.push({
        type: 'guilt_tripping',
        severity: 'error',
        description: 'Guilt-trip opt-out language detected',
        evidence: m[0],
        suggestion: 'Replace with a simple "No thanks" or "Unsubscribe" link',
      });
      break;
    }
  }

  for (const pattern of CLICKBAIT_SUBJECTS) {
    const m = subject.match(pattern);
    if (m) {
      issues.push({
        type: 'clickbait_subject',
        severity: 'warning',
        description: 'Potentially clickbait subject line',
        evidence: m[0],
        suggestion: 'Use a subject that accurately describes the email content',
      });
      break;
    }
  }

  // Check unsubscribe link exists
  const hasUnsub = MISLEADING_UNSUB.some((p) => p.test(html));
  if (!hasUnsub) {
    issues.push({
      type: 'missing_unsubscribe',
      severity: 'error',
      description: 'No unsubscribe link detected — required by CAN-SPAM and GDPR',
      evidence: '(unsubscribe link not found in HTML)',
      suggestion: 'Add a clearly visible unsubscribe link',
    });
  }

  // Check for hidden text (white on white, font-size: 0)
  if (/color:\s*#?fff(fff)?|color:\s*white|font-size:\s*0/i.test(html)) {
    issues.push({
      type: 'hidden_text',
      severity: 'error',
      description: 'Hidden text detected (white on white or zero font-size)',
      evidence: 'CSS: color:white / font-size:0',
      suggestion: 'Remove hidden text — it may trigger spam filters and violates trust',
    });
  }

  // Check for deceptive preheader stuffing (nbsp / zero-width space spam).
  // The zero-width characters are written as escapes rather than literals:
  // literal U+200B / U+FEFF trip eslint's no-irregular-whitespace and are
  // invisible in review, which is a poor property for the one regex whose
  // entire job is spotting them.
  //   \u200B ZERO WIDTH SPACE
  //   \u2060 WORD JOINER
  //   \uFEFF ZERO WIDTH NO-BREAK SPACE (BOM)
  const spacerPattern = /(&nbsp;|\u200B|\u2060|\uFEFF){5,}/;
  if (spacerPattern.test(html)) {
    issues.push({
      type: 'preheader_stuffing',
      severity: 'info',
      description: 'Excessive whitespace / zero-width characters in preheader area',
      evidence: 'Multiple non-breaking spaces or zero-width chars detected',
      suggestion: 'Use a proper preheader text element instead of spacer abuse',
    });
  }

  return issues;
}

// ─── AI analysis ─────────────────────────────────────────────────────────────

export async function detectDarkPatterns(
  orgId: string,
  subject: string,
  html: string,
  useAi = true,
): Promise<DarkPatternResult> {
  const ruleIssues = ruleBasedCheck(subject, html);

  const passedChecks: string[] = [];
  const ruleTypes = new Set(ruleIssues.map((i) => i.type));
  if (!ruleTypes.has('fake_urgency')) passedChecks.push('no_fake_urgency');
  if (!ruleTypes.has('guilt_tripping')) passedChecks.push('no_guilt_tripping');
  if (!ruleTypes.has('missing_unsubscribe')) passedChecks.push('has_unsubscribe');
  if (!ruleTypes.has('hidden_text')) passedChecks.push('no_hidden_text');
  if (!ruleTypes.has('clickbait_subject')) passedChecks.push('honest_subject');

  if (!useAi) {
    const score = Math.min(
      10,
      ruleIssues.filter((i) => i.severity === 'error').length * 3 +
        ruleIssues.filter((i) => i.severity === 'warning').length * 1.5,
    );
    return { score, issues: ruleIssues, passedChecks };
  }

  const text = extractText(html).slice(0, 2000);
  const result = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    feature: 'accessibility_check',
    tenantId: orgId,
    system: `You analyze email marketing content for dark patterns and manipulative techniques. Return JSON only:
{
  "score": 0-10,
  "additionalIssues": [{ "type": string, "severity": "info"|"warning"|"error", "description": string, "evidence": string, "suggestion": string }],
  "summary": "1-2 sentence evaluation"
}
Score: 0=clean, 10=highly manipulative. Check for: misleading claims, false social proof, manufactured urgency, consent dark patterns, deceptive pricing, scare tactics.`,
    user: `Subject: ${subject}\n\nBody text: ${text}`,
    maxTokens: 512,
  });

  try {
    const ai = JSON.parse(result.text) as {
      score: number;
      additionalIssues: DarkPatternIssue[];
      summary: string;
    };
    const allIssues = [...ruleIssues, ...(ai.additionalIssues ?? [])];
    return {
      score: Math.max(ai.score ?? 0, Math.min(10, ruleIssues.length * 2)),
      issues: allIssues,
      aiSummary: ai.summary,
      passedChecks,
    };
  } catch {
    const score = Math.min(10, ruleIssues.length * 2);
    return { score, issues: ruleIssues, passedChecks };
  }
}
