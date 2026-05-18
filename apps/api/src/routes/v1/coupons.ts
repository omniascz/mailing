import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createBatch, listBatches, assignCodeToContact, redeem, batchStats,
} from '../../services/coupons/index.js';

const couponRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/coupons/batches', {
    preHandler: [app.authenticate],
    schema: { tags: ['Coupons'] },
  }, async (req, reply) => {
    return reply.send({ data: await listBatches(req.user!.orgId) });
  });

  app.post('/api/v1/coupons/batches', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['Coupons'] },
  }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      codePrefix: z.string().max(32).optional(),
      discountType: z.enum(['percent', 'fixed']).optional(),
      discountValue: z.number().nonnegative(),
      expiresAt: z.coerce.date().optional(),
      quantity: z.number().int().min(1).max(100_000),
    }).parse(req.body);
    return reply.code(201).send({ data: await createBatch(req.user!.orgId, body) });
  });

  app.post('/api/v1/coupons/batches/:batchId/assign', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['Coupons'] },
  }, async (req, reply) => {
    const { batchId } = z.object({ batchId: z.string().uuid() }).parse(req.params);
    const body = z.object({ contactId: z.string().uuid() }).parse(req.body);
    return reply.send({ data: await assignCodeToContact(req.user!.orgId, batchId, body.contactId) });
  });

  app.post('/api/v1/coupons/redeem', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['Coupons'] },
  }, async (req, reply) => {
    const body = z.object({
      code: z.string().min(1).max(64),
      revenue: z.number().nonnegative().optional(),
    }).parse(req.body);
    return reply.send({ data: await redeem(req.user!.orgId, body.code, body.revenue) });
  });

  app.get('/api/v1/coupons/batches/:batchId/stats', {
    preHandler: [app.authenticate],
    schema: { tags: ['Coupons'] },
  }, async (req, reply) => {
    const { batchId } = z.object({ batchId: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await batchStats(req.user!.orgId, batchId) });
  });
};

export default couponRoutes;
