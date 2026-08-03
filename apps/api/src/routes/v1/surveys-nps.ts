/**
 * Survey NPS/CSAT templates + response rules routes (#377, #378).
 *
 *   GET  /api/v1/surveys/templates               — list pre-built templates (nps, csat, ces)
 *   POST /api/v1/surveys/from-template/:slug     — create survey from template
 *   GET  /api/v1/surveys/:id/nps-report          — NPS analytics report
 *   PUT  /api/v1/surveys/:id/response-rules      — save response automation rules
 *   GET  /api/v1/surveys/:id/response-rules      — get current rules
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { surveys } from '../../db/schema/index.js';
import {
  npsTemplate,
  csatTemplate,
  cesTemplate,
  getNpsReport,
} from '../../services/surveys/nps-csat.js';
import { createSurvey } from '../../services/surveys/index.js';

const TEMPLATES: Record<string, () => { name: string; questions: unknown[] }> = {
  nps: npsTemplate,
  csat: csatTemplate,
  ces: cesTemplate,
};

export default async function surveysNpsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const adminAuth = { preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')] };

  app.get('/api/v1/surveys/templates', auth, async (_req, reply) => {
    const templates = Object.entries(TEMPLATES).map(([slug, fn]) => {
      const t = fn();
      return { slug, name: t.name, questionCount: t.questions.length };
    });
    return reply.send({ data: templates });
  });

  app.post('/api/v1/surveys/from-template/:slug', adminAuth, async (req, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const fn = TEMPLATES[slug];
    if (!fn) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Template not found' });

    const t = fn();
    const survey = await createSurvey(req.user!.orgId, {
      name: t.name,
      questions: t.questions as never,
    });
    return reply.code(201).send({ data: survey });
  });

  app.get('/api/v1/surveys/:id/nps-report', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const report = await getNpsReport(req.user!.orgId, id);
    return reply.send({ data: report });
  });

  // Response rules are stored in the survey's `questions` JSONB under key `responseRules`
  const ruleConditionSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('equals'), questionId: z.string(), value: z.unknown() }),
    z.object({ type: z.literal('gte'), questionId: z.string(), value: z.number() }),
    z.object({ type: z.literal('lte'), questionId: z.string(), value: z.number() }),
    z.object({ type: z.literal('contains'), questionId: z.string(), value: z.string() }),
  ]);

  const ruleActionSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('add_tag'), tag: z.string() }),
    z.object({ type: z.literal('remove_tag'), tag: z.string() }),
    z.object({ type: z.literal('update_field'), field: z.string(), value: z.unknown() }),
    z.object({ type: z.literal('trigger_workflow'), workflowId: z.string().uuid() }),
  ]);

  const rulesBodySchema = z.object({
    rules: z.array(
      z.object({
        id: z.string(),
        name: z.string().max(255),
        condition: ruleConditionSchema,
        action: ruleActionSchema,
      }),
    ),
  });

  app.put('/api/v1/surveys/:id/response-rules', adminAuth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { rules } = rulesBodySchema.parse(req.body);

    const [survey] = await db
      .select({ questions: surveys.questions })
      .from(surveys)
      .where(and(eq(surveys.id, id), eq(surveys.orgId, req.user!.orgId)))
      .limit(1);

    if (!survey) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Survey not found' });

    // Merge rules into the existing questions JSONB as a side-car key
    const merged = {
      ...(survey.questions as unknown as Record<string, unknown>),
      responseRules: rules,
    };
    await db
      .update(surveys)
      .set({ questions: merged as never, updatedAt: new Date() })
      .where(and(eq(surveys.id, id), eq(surveys.orgId, req.user!.orgId)));

    return reply.send({ data: { rules } });
  });

  app.get('/api/v1/surveys/:id/response-rules', auth, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [survey] = await db
      .select({ questions: surveys.questions })
      .from(surveys)
      .where(and(eq(surveys.id, id), eq(surveys.orgId, req.user!.orgId)))
      .limit(1);

    if (!survey) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Survey not found' });

    const rules = (survey.questions as unknown as Record<string, unknown>)['responseRules'] ?? [];
    return reply.send({ data: { rules } });
  });
}
