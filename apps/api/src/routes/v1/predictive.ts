import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  refreshOrgPredictions,
  topContactsByScore,
  orgPredictiveSummary,
  ensureEngagementRows,
  getContactPredictions,
  predictiveDistribution,
} from '../../services/predictive-segmentation/index.js';

const predictiveRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/predictive/refresh',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Predictive'] },
    },
    async (req, reply) => {
      await ensureEngagementRows(req.user!.orgId);
      const result = await refreshOrgPredictions(req.user!.orgId);
      return reply.send({ data: result });
    },
  );

  app.get(
    '/api/v1/predictive/summary',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Predictive'] },
    },
    async (req, reply) => {
      return reply.send({ data: await orgPredictiveSummary(req.user!.orgId) });
    },
  );

  app.get(
    '/api/v1/predictive/top',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Predictive'] },
    },
    async (req, reply) => {
      const { metric, limit } = z
        .object({
          metric: z.enum(['clv', 'purchase_likelihood', 'churn_risk']).default('clv'),
          limit: z.coerce.number().int().min(1).max(500).default(50),
        })
        .parse(req.query);
      return reply.send({ data: await topContactsByScore(req.user!.orgId, metric, limit) });
    },
  );

  app.get(
    '/api/v1/predictive/contacts/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Predictive'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getContactPredictions(req.user!.orgId, contactId) });
    },
  );

  app.get(
    '/api/v1/predictive/distribution',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Predictive'] },
    },
    async (req, reply) => {
      return reply.send({ data: await predictiveDistribution(req.user!.orgId) });
    },
  );
};

export default predictiveRoutes;
