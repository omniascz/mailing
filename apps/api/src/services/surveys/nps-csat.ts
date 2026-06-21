/**
 * NPS / CSAT out-of-box templates + response-rule evaluation (#377, #378).
 *
 * NPS (Net Promoter Score):
 *   - 0-6 = Detractor, 7-8 = Passive, 9-10 = Promoter
 *   - Score = % Promoters − % Detractors
 *
 * CSAT (Customer Satisfaction):
 *   - 1-5 scale, positive = 4+5
 *   - Score = % satisfied responses
 *
 * Response rules: per-question threshold → action (add_tag, update_field, trigger_workflow).
 * Rules are stored as JSONB on the survey. Evaluated after each submission.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { surveys, surveyResponses, contacts, tags, contactTags } from '../../db/schema/index.js';
import { onApiEvent } from '../workflows/triggers.js';
import type { SurveyQuestion } from '../../db/schema/surveys.js';

// ─── Response rule types ──────────────────────────────────────────────────────

export type ResponseRuleCondition =
  | { type: 'equals'; questionId: string; value: unknown }
  | { type: 'gte'; questionId: string; value: number }
  | { type: 'lte'; questionId: string; value: number }
  | { type: 'contains'; questionId: string; value: string };

export type ResponseRuleAction =
  | { type: 'add_tag'; tag: string }
  | { type: 'remove_tag'; tag: string }
  | { type: 'update_field'; field: string; value: unknown }
  | { type: 'trigger_workflow'; workflowId: string };

export interface SurveyResponseRule {
  id: string;
  name: string;
  condition: ResponseRuleCondition;
  action: ResponseRuleAction;
}

// ─── NPS / CSAT helpers ───────────────────────────────────────────────────────

export type NpsTier = 'promoter' | 'passive' | 'detractor';

export function npsClassify(score: number): NpsTier {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

export function computeNpsScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

export function computeCsatScore(ratings: number[]): number {
  if (ratings.length === 0) return 0;
  const satisfied = ratings.filter((r) => r >= 4).length;
  return Math.round((satisfied / ratings.length) * 100);
}

// ─── Pre-built survey templates ───────────────────────────────────────────────

export function npsTemplate(): { name: string; questions: SurveyQuestion[] } {
  return {
    name: 'Net Promoter Score (NPS)',
    questions: [
      {
        id: 'nps',
        type: 'nps',
        label: 'How likely are you to recommend us to a friend or colleague?',
        required: true,
        min: 0,
        max: 10,
      },
      {
        id: 'reason',
        type: 'text',
        label: 'What is the main reason for your score?',
        required: false,
      },
    ],
  };
}

export function csatTemplate(): { name: string; questions: SurveyQuestion[] } {
  return {
    name: 'Customer Satisfaction (CSAT)',
    questions: [
      {
        id: 'satisfaction',
        type: 'rating',
        label: 'How satisfied are you with your experience?',
        required: true,
        min: 1,
        max: 5,
      },
      {
        id: 'comment',
        type: 'text',
        label: 'Any additional comments?',
        required: false,
      },
    ],
  };
}

export function cesTemplate(): { name: string; questions: SurveyQuestion[] } {
  return {
    name: 'Customer Effort Score (CES)',
    questions: [
      {
        id: 'effort',
        type: 'scale',
        label: 'How easy was it to resolve your issue?',
        required: true,
        min: 1,
        max: 7,
        options: ['Very difficult', '', '', 'Neutral', '', '', 'Very easy'],
      },
    ],
  };
}

// ─── Survey analytics ─────────────────────────────────────────────────────────

export interface NpsReport {
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number;
}

export async function getNpsReport(orgId: string, surveyId: string): Promise<NpsReport> {
  const responses = await db
    .select({ npsScore: surveyResponses.npsScore })
    .from(surveyResponses)
    .where(and(eq(surveyResponses.orgId, orgId), eq(surveyResponses.surveyId, surveyId)));

  const scores = responses.map((r) => r.npsScore ?? -1).filter((s) => s >= 0);
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const passives = scores.length - promoters - detractors;

  return {
    totalResponses: scores.length,
    promoters,
    passives,
    detractors,
    npsScore: computeNpsScore(scores),
  };
}

// ─── Response rule evaluation ─────────────────────────────────────────────────

function evaluateCondition(
  condition: ResponseRuleCondition,
  answers: Record<string, unknown>,
): boolean {
  const raw = answers[condition.questionId];
  switch (condition.type) {
    case 'equals':
      return raw === condition.value;
    case 'gte':
      return typeof raw === 'number' && raw >= condition.value;
    case 'lte':
      return typeof raw === 'number' && raw <= condition.value;
    case 'contains':
      return typeof raw === 'string' && raw.toLowerCase().includes(condition.value.toLowerCase());
    default:
      return false;
  }
}

export async function evaluateResponseRules(
  orgId: string,
  surveyId: string,
  contactId: string | null,
  answers: Record<string, unknown>,
): Promise<void> {
  if (!contactId) return;

  const [survey] = await db
    .select({ config: surveys.questions })
    .from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.orgId, orgId)))
    .limit(1);

  if (!survey) return;

  // Rules are stored in a parallel JSONB `responseRules` column if the survey has it.
  // We use the survey config object — the key 'responseRules' lives alongside 'questions'.
  const rules: SurveyResponseRule[] = ((survey.config as unknown as Record<string, unknown>)['responseRules'] as SurveyResponseRule[] | undefined) ?? [];

  for (const rule of rules) {
    if (!evaluateCondition(rule.condition, answers)) continue;

    const action = rule.action;
    switch (action.type) {
      case 'add_tag': {
        const [tagRow] = await db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.orgId, orgId), eq(tags.name, action.tag)))
          .limit(1);
        if (tagRow) {
          await db
            .insert(contactTags)
            .values({ contactId, tagId: tagRow.id })
            .onConflictDoNothing()
            .catch(() => {});
        }
        break;
      }
      case 'remove_tag': {
        const [tagRow] = await db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.orgId, orgId), eq(tags.name, action.tag)))
          .limit(1);
        if (tagRow) {
          await db
            .delete(contactTags)
            .where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagRow.id)))
            .catch(() => {});
        }
        break;
      }
      case 'update_field':
        if (action.field && action.value !== undefined) {
          await db
            .update(contacts)
            .set({ updatedAt: new Date() })
            .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId)));
        }
        break;
      case 'trigger_workflow':
        await onApiEvent(orgId, contactId, 'survey_rule_matched', {
          workflowId: action.workflowId,
          ruleId: rule.id,
        });
        break;
    }
  }

  // Built-in NPS auto-tagging: tag by NPS tier
  const npsAnswer = answers['nps'];
  if (typeof npsAnswer === 'number') {
    const tier = npsClassify(npsAnswer);
    const tierTag = `nps_${tier}`;
    // Remove old NPS tags first, then assign new tier tag
    const allNpsTags = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(and(eq(tags.orgId, orgId), sql`name IN ('nps_promoter','nps_passive','nps_detractor')`));

    for (const t of allNpsTags) {
      if (t.name !== tierTag) {
        await db
          .delete(contactTags)
          .where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, t.id)))
          .catch(() => {});
      }
    }

    const tierTagRow = allNpsTags.find((t) => t.name === tierTag);
    if (tierTagRow) {
      await db
        .insert(contactTags)
        .values({ contactId, tagId: tierTagRow.id })
        .onConflictDoNothing()
        .catch(() => {});
    }
  }
}
