import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createDeal,
  getDeal,
  listDeals,
  updateDeal,
  moveDealToStage,
  markDealWon,
  markDealLost,
  deleteDeal,
  dealStageHistoryForDeal,
} from '../../../services/crm/deals.js';

const isoDate = z
  .string()
  .datetime()
  .transform((s) => new Date(s));

const createSchema = z.object({
  pipelineId: z.string().uuid(),
  stageId: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  contactId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  value: z.union([z.number(), z.string()]).optional(),
  currency: z.string().length(3).optional(),
  expectedCloseDate: isoDate.optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
  source: z.string().optional().nullable(),
  customFields: z.record(z.unknown()).optional().nullable(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  contactId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  value: z.union([z.number(), z.string()]).optional(),
  currency: z.string().length(3).optional(),
  expectedCloseDate: isoDate.optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
  source: z.string().optional().nullable(),
  customFields: z.record(z.unknown()).optional().nullable(),
});

const dealRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/crm/deals',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['CRM Deals'] },
    },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      return reply.status(201).send({ data: await createDeal(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/crm/deals',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CRM Deals'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          pipelineId: z.string().uuid().optional(),
          stageId: z.string().optional(),
          status: z.enum(['open', 'won', 'lost']).optional(),
          contactId: z.string().uuid().optional(),
          accountId: z.string().uuid().optional(),
          ownerUserId: z.string().uuid().optional(),
          search: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        })
        .parse(req.query);
      return reply.send({ data: await listDeals(req.user!.orgId, q) });
    },
  );

  app.get(
    '/api/v1/crm/deals/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CRM Deals'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getDeal(req.user!.orgId, id) });
    },
  );

  app.patch(
    '/api/v1/crm/deals/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['CRM Deals'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = updateSchema.parse(req.body);
      return reply.send({ data: await updateDeal(req.user!.orgId, id, body, req.user!.userId) });
    },
  );

  app.post(
    '/api/v1/crm/deals/:id/move-stage',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['CRM Deals'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { stageId } = z.object({ stageId: z.string().min(1) }).parse(req.body);
      return reply.send({
        data: await moveDealToStage(req.user!.orgId, id, stageId, req.user!.userId),
      });
    },
  );

  app.post(
    '/api/v1/crm/deals/:id/won',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['CRM Deals'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z.object({ closeDate: isoDate.optional() }).parse(req.body ?? {});
      return reply.send({
        data: await markDealWon(req.user!.orgId, id, body.closeDate, req.user!.userId),
      });
    },
  );

  app.post(
    '/api/v1/crm/deals/:id/lost',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['CRM Deals'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          reason: z.string().min(1).max(500),
          closeDate: isoDate.optional(),
        })
        .parse(req.body);
      return reply.send({
        data: await markDealLost(
          req.user!.orgId,
          id,
          body.reason,
          body.closeDate,
          req.user!.userId,
        ),
      });
    },
  );

  app.delete(
    '/api/v1/crm/deals/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['CRM Deals'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteDeal(req.user!.orgId, id);
      return reply.status(204).send();
    },
  );

  app.get(
    '/api/v1/crm/deals/:id/stage-history',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CRM Deals'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await dealStageHistoryForDeal(req.user!.orgId, id) });
    },
  );
};

export default dealRoutes;
