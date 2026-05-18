import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  dealsByStage, conversionRates, salesVelocity, repPerformance, winLossAnalysis,
} from '../../../services/crm/sales-reports.js';
import { forecastPipeline } from '../../../services/crm/forecasting.js';

const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/crm/reports/deals-by-stage', {
    preHandler: [app.authenticate],
    schema: { tags: ['CRM Reports'] },
  }, async (req, reply) => {
    const q = z.object({ pipelineId: z.string().uuid() }).parse(req.query);
    return reply.send({ data: await dealsByStage(req.user!.orgId, q.pipelineId) });
  });

  app.get('/api/v1/crm/reports/conversion-rates', {
    preHandler: [app.authenticate],
    schema: { tags: ['CRM Reports'] },
  }, async (req, reply) => {
    const q = z.object({
      pipelineId: z.string().uuid(),
      days: z.coerce.number().int().min(1).max(365).default(90),
    }).parse(req.query);
    return reply.send({ data: await conversionRates(req.user!.orgId, q.pipelineId, q.days) });
  });

  app.get('/api/v1/crm/reports/sales-velocity', {
    preHandler: [app.authenticate],
    schema: { tags: ['CRM Reports'] },
  }, async (req, reply) => {
    const q = z.object({
      pipelineId: z.string().uuid(),
      days: z.coerce.number().int().min(1).max(365).default(180),
    }).parse(req.query);
    return reply.send({ data: await salesVelocity(req.user!.orgId, q.pipelineId, q.days) });
  });

  app.get('/api/v1/crm/reports/rep-performance', {
    preHandler: [app.authenticate],
    schema: { tags: ['CRM Reports'] },
  }, async (req, reply) => {
    const q = z.object({
      days: z.coerce.number().int().min(1).max(365).default(180),
    }).parse(req.query);
    return reply.send({ data: await repPerformance(req.user!.orgId, q.days) });
  });

  app.get('/api/v1/crm/reports/win-loss', {
    preHandler: [app.authenticate],
    schema: { tags: ['CRM Reports'] },
  }, async (req, reply) => {
    const q = z.object({
      days: z.coerce.number().int().min(1).max(365).default(180),
    }).parse(req.query);
    return reply.send({ data: await winLossAnalysis(req.user!.orgId, q.days) });
  });

  app.get('/api/v1/crm/reports/forecast', {
    preHandler: [app.authenticate],
    schema: { tags: ['CRM Reports'] },
  }, async (req, reply) => {
    const q = z.object({
      pipelineId: z.string().uuid(),
      horizonMonths: z.coerce.number().int().min(1).max(24).default(6),
    }).parse(req.query);
    return reply.send({ data: await forecastPipeline(req.user!.orgId, q.pipelineId, { horizonMonths: q.horizonMonths }) });
  });
};

export default reportRoutes;
