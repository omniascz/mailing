import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createSurvey,
  listSurveys,
  getSurvey,
  updateSurvey,
  submitResponse,
  getSurveyResults,
} from '../../services/surveys/index.js';

const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['single', 'multi', 'scale', 'text', 'nps', 'rating']),
  label: z.string().min(1),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

const surveyRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/surveys',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Surveys'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listSurveys(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/surveys',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Surveys'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          description: z.string().max(1024).optional(),
          questions: z.array(questionSchema),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createSurvey(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/surveys/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Surveys'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getSurvey(id, req.user!.orgId) });
    },
  );

  app.put(
    '/api/v1/surveys/:id',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Surveys'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(255).optional(),
          description: z.string().max(1024).optional(),
          questions: z.array(questionSchema).optional(),
          active: z.boolean().optional(),
        })
        .parse(req.body);
      return reply.send({ data: await updateSurvey(id, req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/surveys/:id/results',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Surveys'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getSurveyResults(id, req.user!.orgId) });
    },
  );

  // Public submission endpoint (no auth).
  app.post(
    '/public/surveys/:id/submit',
    {
      schema: { tags: ['Surveys'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          orgId: z.string().uuid(),
          contactId: z.string().uuid().optional(),
          answers: z.record(z.unknown()),
        })
        .parse(req.body);
      await submitResponse({
        surveyId: id,
        orgId: body.orgId,
        contactId: body.contactId ?? null,
        answers: body.answers,
      });
      return reply.code(202).send({ ok: true });
    },
  );
};

export default surveyRoutes;
