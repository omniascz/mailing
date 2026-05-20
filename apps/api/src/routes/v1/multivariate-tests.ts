/**
 * Multivariate testing routes.
 *
 *  - GET    /api/v1/multivariate-tests              — list tests
 *  - POST   /api/v1/multivariate-tests              — create test + variants
 *  - GET    /api/v1/multivariate-tests/:id          — get test detail + variants
 *  - POST   /api/v1/multivariate-tests/:id/start    — start the test
 *  - POST   /api/v1/multivariate-tests/:id/winner   — compute / select winner
 *  - POST   /api/v1/multivariate-tests/:id/cancel   — cancel running test
 *  - POST   /api/v1/multivariate-tests/:id/assign   — deterministic assign contact → variant
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createMultivariateTest,
  listMultivariateTests,
  getMultivariateTest,
  startMultivariateTest,
  selectWinner,
  cancelMultivariateTest,
  assignVariant,
} from '../../services/multivariate-tests/index.js';

const idParam = z.object({ id: z.string().uuid() });

const variantInput = z.object({
  name: z.string().min(1).max(100),
  element: z.enum(['subject', 'preheader', 'from_name', 'content', 'send_time']),
  value: z.union([z.string(), z.record(z.unknown())]),
  allocationPercent: z.number().min(0).max(100),
  isControl: z.boolean().optional(),
});

const createSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  winnerMetric: z
    .enum(['open_rate', 'click_rate', 'click_to_open_rate', 'conversion_rate', 'revenue_per_email'])
    .optional(),
  testAudiencePercent: z.number().min(5).max(100).optional(),
  testWindowHours: z.number().min(1).max(168).optional(),
  autoSendWinner: z.boolean().optional(),
  confidenceThreshold: z.number().min(0).max(100).optional(),
  variants: z.array(variantInput).min(2).max(8),
});

const routes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/multivariate-tests',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Multivariate Tests'], summary: 'List multivariate tests' },
    },
    async (req) => {
      const q = z
        .object({
          campaignId: z.string().uuid().optional(),
          status: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        })
        .parse(req.query);
      const data = await listMultivariateTests(req.user!.orgId, q);
      return { data };
    },
  );

  app.post(
    '/api/v1/multivariate-tests',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['Multivariate Tests'], summary: 'Create multivariate test' },
    },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const data = await createMultivariateTest(req.user!.orgId, body);
      return reply.code(201).send({ data });
    },
  );

  app.get(
    '/api/v1/multivariate-tests/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Multivariate Tests'], summary: 'Get multivariate test' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const data = await getMultivariateTest(req.user!.orgId, id);
      return { data };
    },
  );

  app.post(
    '/api/v1/multivariate-tests/:id/start',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['Multivariate Tests'], summary: 'Start multivariate test' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const data = await startMultivariateTest(req.user!.orgId, id);
      return { data };
    },
  );

  app.post(
    '/api/v1/multivariate-tests/:id/winner',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['Multivariate Tests'], summary: 'Select winner' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const data = await selectWinner(req.user!.orgId, id);
      return { data };
    },
  );

  app.post(
    '/api/v1/multivariate-tests/:id/cancel',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['Multivariate Tests'], summary: 'Cancel multivariate test' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const data = await cancelMultivariateTest(req.user!.orgId, id);
      return { data };
    },
  );

  app.post(
    '/api/v1/multivariate-tests/:id/assign',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Multivariate Tests'], summary: 'Assign contact → variant' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.body);
      const variant = await assignVariant(id, contactId);
      return { data: variant };
    },
  );
};

export default routes;
