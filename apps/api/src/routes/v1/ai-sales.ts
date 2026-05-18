import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { winProbability, winProbabilityForPipeline } from '../../services/ai-sales/win-probability.js';
import { assessDealRisk, atRiskDeals } from '../../services/ai-sales/deal-risk.js';
import { analyzeSentiment } from '../../services/ai-sales/sentiment.js';
import { predictConversion, topPredictedContacts } from '../../services/lead-scoring/predictive.js';

const aiSalesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/ai-sales/deals/:id/win-probability', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Sales'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await winProbability(req.user!.orgId, id) });
  });

  app.get('/api/v1/ai-sales/pipelines/:id/win-probability', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Sales'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    return reply.send({ data: await winProbabilityForPipeline(req.user!.orgId, id, q.limit) });
  });

  app.get('/api/v1/ai-sales/deals/:id/risk', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Sales'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({
      stalledDays: z.coerce.number().int().min(1).max(365).optional(),
      silentDays: z.coerce.number().int().min(1).max(365).optional(),
      highValueThreshold: z.coerce.number().nonnegative().optional(),
    }).parse(req.query);
    return reply.send({ data: await assessDealRisk(req.user!.orgId, id, q) });
  });

  app.get('/api/v1/ai-sales/at-risk', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Sales'] },
  }, async (req, reply) => {
    const q = z.object({
      pipelineId: z.string().uuid().optional(),
      minScore: z.coerce.number().int().min(0).max(100).default(30),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      stalledDays: z.coerce.number().int().min(1).max(365).optional(),
      silentDays: z.coerce.number().int().min(1).max(365).optional(),
    }).parse(req.query);
    return reply.send({ data: await atRiskDeals(req.user!.orgId, q) });
  });

  app.post('/api/v1/ai-sales/sentiment', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Sales'] },
  }, async (req, reply) => {
    const body = z.object({
      text: z.string().min(1).max(16000),
      forceAi: z.boolean().optional(),
    }).parse(req.body);
    return reply.send({ data: await analyzeSentiment(req.user!.orgId, body.text, { forceAi: body.forceAi }) });
  });

  app.get('/api/v1/ai-sales/contacts/:id/predictive-score', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Sales'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await predictConversion(req.user!.orgId, id) });
  });

  app.get('/api/v1/ai-sales/top-predicted', {
    preHandler: [app.authenticate],
    schema: { tags: ['AI Sales'] },
  }, async (req, reply) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    return reply.send({ data: await topPredictedContacts(req.user!.orgId, q.limit) });
  });
};

export default aiSalesRoutes;
