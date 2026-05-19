/**
 * Internal coupon allocation endpoint (Sprint E.5) — called by batch-sender
 * once per outbound batch when a campaign template uses the {{coupon
 * "batch-name"}} merge tag. Returns the contactId → code map for the
 * batch in a single transaction. Idempotent: contacts who already hold
 * a code in this batch (retry of a previous send) reuse it.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allocateForBatch } from '../../../services/coupons/index.js';

const internalCouponsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/internal/coupons/allocate-batch', {
    schema: { tags: ['Internal'] },
  }, async (req, reply) => {
    const body = z.object({
      orgId: z.string().uuid(),
      batchId: z.string().uuid(),
      contactIds: z.array(z.string().uuid()).max(1000),
    }).parse(req.body);

    const result = await allocateForBatch(body.orgId, body.batchId, body.contactIds);
    return reply.send({ data: result });
  });
};

export default internalCouponsRoutes;
