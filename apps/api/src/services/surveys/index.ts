import { and, eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  surveys,
  surveyResponses,
  type Survey,
  type SurveyQuestion,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export async function createSurvey(
  orgId: string,
  data: {
    name: string;
    description?: string;
    questions: SurveyQuestion[];
  },
): Promise<Survey> {
  const [row] = await db
    .insert(surveys)
    .values({ ...data, orgId })
    .returning();
  return row!;
}

export async function listSurveys(orgId: string): Promise<Survey[]> {
  return db.select().from(surveys).where(eq(surveys.orgId, orgId)).orderBy(desc(surveys.createdAt));
}

export async function getSurvey(id: string, orgId: string): Promise<Survey> {
  const [row] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, id), eq(surveys.orgId, orgId)))
    .limit(1);
  if (!row) throw AppError.notFound('Survey');
  return row;
}

/** Fetch an active survey by id without org scoping (for public hosted page). */
export async function getPublicSurvey(id: string): Promise<Survey | null> {
  const [row] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, id), eq(surveys.active, true)))
    .limit(1);
  return row ?? null;
}

export async function updateSurvey(
  id: string,
  orgId: string,
  data: Partial<{
    name: string;
    description: string;
    questions: SurveyQuestion[];
    active: boolean;
  }>,
): Promise<Survey> {
  const [row] = await db
    .update(surveys)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(surveys.id, id), eq(surveys.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Survey');
  return row;
}

export async function submitResponse(input: {
  surveyId: string;
  orgId: string;
  contactId?: string | null;
  answers: Record<string, unknown>;
}): Promise<void> {
  // Extract NPS score if survey has an nps question.
  let npsScore: number | null = null;
  for (const [qid, val] of Object.entries(input.answers)) {
    if (typeof val === 'number' && qid.toLowerCase().includes('nps') && val >= 0 && val <= 10) {
      npsScore = Math.round(val);
      break;
    }
  }

  await db.insert(surveyResponses).values({
    surveyId: input.surveyId,
    orgId: input.orgId,
    contactId: input.contactId ?? null,
    answers: input.answers,
    npsScore,
  });

  await db
    .update(surveys)
    .set({ submitCount: sql`${surveys.submitCount} + 1` })
    .where(eq(surveys.id, input.surveyId));
}

export async function getSurveyResults(
  surveyId: string,
  orgId: string,
): Promise<{
  submitCount: number;
  npsScore: number | null; // Net Promoter Score (-100 to 100)
  byQuestion: Record<string, Record<string, number>>;
}> {
  // Verify ownership.
  await getSurvey(surveyId, orgId);

  const rs = await db
    .select({
      answers: surveyResponses.answers,
      nps: surveyResponses.npsScore,
    })
    .from(surveyResponses)
    .where(eq(surveyResponses.surveyId, surveyId));

  const byQuestion: Record<string, Record<string, number>> = {};
  let promoters = 0,
    detractors = 0,
    npsTotal = 0;

  for (const row of rs) {
    if (row.nps !== null && row.nps !== undefined) {
      npsTotal++;
      if (row.nps >= 9) promoters++;
      else if (row.nps <= 6) detractors++;
    }
    const answers = row.answers as Record<string, unknown>;
    for (const [qid, ans] of Object.entries(answers)) {
      byQuestion[qid] ??= {};
      const key = String(ans);
      byQuestion[qid][key] = (byQuestion[qid][key] ?? 0) + 1;
    }
  }

  const npsScore = npsTotal > 0 ? Math.round(((promoters - detractors) / npsTotal) * 100) : null;
  return { submitCount: rs.length, npsScore, byQuestion };
}
