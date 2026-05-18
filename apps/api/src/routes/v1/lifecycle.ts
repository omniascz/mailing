/**
 * Lifecycle-stage routes (#394).
 *
 *   POST /api/v1/contacts/:id/lifecycle       — transition a contact
 *   GET  /api/v1/contacts/:id/lifecycle/history — list transitions
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { transitionStage, getHistory } from '../../services/lifecycle/index.js';
import { LIFECYCLE_STAGES, type LifecycleStage } from '../../services/lifecycle/pure.js';

const lifecycleRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/contacts/:id/lifecycle', {
    preHandler: [app.authenticate],
    schema: { tags: ['Lifecycle'], summary: 'Transition a contact to a new lifecycle stage' },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      toStage: z.enum(LIFECYCLE_STAGES as unknown as [string, ...string[]]),
      allowDowngrade: z.boolean().optional(),
      reason: z.string().min(1).max(255).optional(),
      metadata: z.record(z.unknown()).optional(),
    }).parse(req.body);

    const transition = await transitionStage(
      req.user!.orgId,
      id,
      body.toStage as LifecycleStage,
      {
        ...(body.allowDowngrade != null ? { allowDowngrade: body.allowDowngrade } : {}),
        ...(body.reason ? { reason: body.reason } : {}),
        ...(body.metadata ? { metadata: body.metadata } : {}),
        changedBy: req.user!.userId,
      },
    );
    return reply.send({ data: transition });
  });

  app.get('/api/v1/contacts/:id/lifecycle/history', {
    preHandler: [app.authenticate],
    schema: { tags: ['Lifecycle'], summary: 'List lifecycle-stage transitions' },
  }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const rows = await getHistory(req.user!.orgId, id);
    return { data: rows };
  });
};

export default lifecycleRoutes;
