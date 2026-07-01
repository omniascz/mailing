import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createBatch,
  listBatches,
  assignCodeToContact,
  redeem,
  batchStats,
  importCodes,
} from '../../services/coupons/index.js';
import { syncBatchToStore } from '../../services/coupons/store-sync.js';

const couponRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/coupons/batches',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Coupons'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listBatches(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/coupons/batches',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Coupons'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          codePrefix: z.string().max(32).optional(),
          discountType: z.enum(['percent', 'fixed']).optional(),
          discountValue: z.number().nonnegative(),
          expiresAt: z.coerce.date().optional(),
          quantity: z.number().int().min(1).max(100_000),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createBatch(req.user!.orgId, body) });
    },
  );

  app.post(
    '/api/v1/coupons/batches/:batchId/assign',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Coupons'] },
    },
    async (req, reply) => {
      const { batchId } = z.object({ batchId: z.string().uuid() }).parse(req.params);
      const body = z.object({ contactId: z.string().uuid() }).parse(req.body);
      return reply.send({
        data: await assignCodeToContact(req.user!.orgId, batchId, body.contactId),
      });
    },
  );

  app.post(
    '/api/v1/coupons/redeem',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Coupons'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          code: z.string().min(1).max(64),
          revenue: z.number().nonnegative().optional(),
        })
        .parse(req.body);
      return reply.send({ data: await redeem(req.user!.orgId, body.code, body.revenue) });
    },
  );

  app.get(
    '/api/v1/coupons/batches/:batchId/stats',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Coupons'] },
    },
    async (req, reply) => {
      const { batchId } = z.object({ batchId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await batchStats(req.user!.orgId, batchId) });
    },
  );

  /**
   * POST /api/v1/coupons/batches/:batchId/sync-to-store
   * Register the batch's codes as real discount codes in a connected store
   * (Shopify price rule + codes, or WooCommerce coupons) so recipients can
   * redeem them at checkout.
   * Body: { connectionId }
   */
  app.post(
    '/api/v1/coupons/batches/:batchId/sync-to-store',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Coupons'], summary: 'Push coupon codes to a connected store' },
    },
    async (req, reply) => {
      const { batchId } = z.object({ batchId: z.string().uuid() }).parse(req.params);
      const body = z.object({ connectionId: z.string().uuid() }).parse(req.body);
      return reply.send({
        data: await syncBatchToStore(req.user!.orgId, batchId, body.connectionId),
      });
    },
  );

  /**
   * POST /api/v1/coupons/batches/:batchId/import
   * Bulk import operator-supplied codes (e.g. uploaded CSV of Shoptet vouchers).
   * Body: { codes: string[] } (max 100 000)
   * Idempotent on (orgId, code) — duplicates dropped on conflict.
   */
  app.post(
    '/api/v1/coupons/batches/:batchId/import',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Coupons'], summary: 'Bulk-import pre-generated codes' },
    },
    async (req, reply) => {
      const { batchId } = z.object({ batchId: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          codes: z.array(z.string().min(1).max(64)).max(100_000),
        })
        .parse(req.body);
      const result = await importCodes(req.user!.orgId, batchId, body.codes);
      return reply.send({ data: result });
    },
  );
};

export default couponRoutes;
