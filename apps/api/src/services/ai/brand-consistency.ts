/**
 * AI brand consistency checker.
 * Analyzes email content against saved brand guidelines and flags deviations.
 * Nobody else has this built into an email platform.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { brandGuidelines, type BrandGuidelinesData } from '../../db/schema/brand-guidelines.js';
import { callClaude } from '../../lib/ai-client.js';

export interface ConsistencyIssue {
  type: 'forbidden_phrase' | 'missing_required' | 'tone_mismatch' | 'reading_level' | 'emoji_policy' | 'exclamation_overuse' | 'off_brand';
  severity: 'error' | 'warning' | 'suggestion';
  description: string;
  evidence: string;
  fix: string;
}

export interface BrandConsistencyReport {
  score: number; // 0-100 (100 = perfectly on-brand)
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: ConsistencyIssue[];
  strengths: string[];
  aiVerdict: string; // 1-2 sentence summary
  guidelineName: string;
}

async function getActiveGuidelines(orgId: string): Promise<BrandGuidelinesData | null> {
  const [row] = await db
    .select({ guidelines: brandGuidelines.guidelines, name: brandGuidelines.name })
    .from(brandGuidelines)
    .where(and(eq(brandGuidelines.orgId, orgId), eq(brandGuidelines.active, true)))
    .limit(1);
  return row?.guidelines ?? null;
}

function ruleCheck(subject: string, bodyText: string, g: BrandGuidelinesData): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const full = `${subject} ${bodyText}`;

  // Forbidden phrases
  for (const phrase of g.forbiddenPhrases ?? []) {
    if (full.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push({
        type: 'forbidden_phrase',
        severity: 'error',
        description: `Forbidden phrase found: "${phrase}"`,
        evidence: phrase,
        fix: `Remove or replace "${phrase}" — it is on the brand blacklist`,
      });
    }
  }

  // Required phrases
  for (const phrase of g.requiredPhrases ?? []) {
    if (!full.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push({
        type: 'missing_required',
        severity: 'warning',
        description: `Required phrase missing: "${phrase}"`,
        evidence: '(not found)',
        fix: `Add "${phrase}" somewhere in the email`,
      });
    }
  }

  // Exclamation marks
  const exclCount = (full.match(/!/g) ?? []).length;
  if (exclCount > (g.maxExclamationMarks ?? 3)) {
    issues.push({
      type: 'exclamation_overuse',
      severity: 'warning',
      description: `${exclCount} exclamation marks found (max: ${g.maxExclamationMarks})`,
      evidence: `${exclCount} occurrences of "!"`,
      fix: `Reduce exclamation marks to ${g.maxExclamationMarks} or fewer`,
    });
  }

  // Emoji policy
  const hasEmoji = /\p{Emoji}/u.test(full);
  if (hasEmoji && !g.emojisAllowed) {
    issues.push({
      type: 'emoji_policy',
      severity: 'warning',
      description: 'Emojis used but brand guidelines prohibit them',
      evidence: full.match(/\p{Emoji}/u)?.[0] ?? '(emoji)',
      fix: 'Remove all emojis from subject line and body',
    });
  }

  return issues;
}

export async function checkBrandConsistency(
  orgId: string,
  subject: string,
  html: string,
  guidelineId?: string,
): Promise<BrandConsistencyReport> {
  let guidelineRow: { guidelines: BrandGuidelinesData; name: string } | null = null;

  if (guidelineId) {
    const [row] = await db
      .select({ guidelines: brandGuidelines.guidelines, name: brandGuidelines.name })
      .from(brandGuidelines)
      .where(and(eq(brandGuidelines.id, guidelineId), eq(brandGuidelines.orgId, orgId)))
      .limit(1);
    guidelineRow = row ?? null;
  } else {
    const g = await getActiveGuidelines(orgId);
    if (g) {
      const [row] = await db
        .select({ name: brandGuidelines.name })
        .from(brandGuidelines)
        .where(and(eq(brandGuidelines.orgId, orgId), eq(brandGuidelines.active, true)))
        .limit(1);
      guidelineRow = g ? { guidelines: g, name: row?.name ?? 'Default' } : null;
    }
  }

  if (!guidelineRow) {
    return {
      score: 100, grade: 'A',
      issues: [],
      strengths: ['No brand guidelines configured — all content passes by default'],
      aiVerdict: 'No brand guidelines found. Set up brand guidelines to enable consistency checking.',
      guidelineName: 'None',
    };
  }

  const { guidelines: g, name: guidelineName } = guidelineRow;
  const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
  const ruleIssues = ruleCheck(subject, bodyText, g);

  const aiResult = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    feature: 'brand_voice',
    tenantId: orgId,
    system: `You are a brand consistency reviewer. Compare the email against the brand guidelines and identify tone/voice/style deviations. Return JSON:
{
  "toneMatch": true/false,
  "readingLevelMatch": true/false,
  "additionalIssues": [{ "type": "tone_mismatch"|"reading_level"|"off_brand", "severity": "error"|"warning"|"suggestion", "description": string, "evidence": string, "fix": string }],
  "strengths": string[],
  "verdict": "1-2 sentence summary"
}`,
    user: `BRAND GUIDELINES:
Tone descriptors: ${g.toneDescriptors.join(', ')}
Reading level: ${g.readingLevel}
Voice description: ${g.voiceDescription}
Approved examples: ${g.approvedExamples.slice(0, 2).join('\n\n')}

EMAIL TO CHECK:
Subject: ${subject}
Body: ${bodyText.slice(0, 1500)}`,
    maxTokens: 512,
  });

  let aiData: { additionalIssues?: ConsistencyIssue[]; strengths?: string[]; verdict?: string } = {};
  try {
    aiData = JSON.parse(aiResult.text) as typeof aiData;
  } catch { /* use defaults */ }

  const allIssues = [...ruleIssues, ...(aiData.additionalIssues ?? [])];
  const strengths = aiData.strengths ?? [];
  if (!ruleIssues.some((i) => i.type === 'exclamation_overuse')) strengths.push('Appropriate punctuation usage');

  const errorCount = allIssues.filter((i) => i.severity === 'error').length;
  const warnCount = allIssues.filter((i) => i.severity === 'warning').length;
  let score = 100 - errorCount * 20 - warnCount * 8;
  score = Math.max(0, Math.min(100, score));

  const grade: BrandConsistencyReport['grade'] =
    score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

  return {
    score, grade, issues: allIssues, strengths,
    aiVerdict: aiData.verdict ?? `Brand consistency score: ${score}/100 (${grade}).`,
    guidelineName,
  };
}
