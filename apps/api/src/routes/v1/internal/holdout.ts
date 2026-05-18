/**
 * Internal holdout endpoint — called by the workers service before each
 * broadcast send. Returns whether the recipient is currently held out
 * (i.e. assigned to an active holdout group) so the worker can skip them.
 *
 * Not exposed to external clients; should sit behind an internal network
 * boundary or shared-secret header in production.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isHeldOut } from '../../../services/holdout/index.js';

const internalHoldoutRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/internal/holdout/check', {
    schema: { tags: ['Internal'] },
  }, async (req, reply) => {
    const { orgId, contactId } = z.object({
      orgId: z.string().uuid(),
      contactId: z.string().uuid(),
    }).parse(req.query);

    const heldOut = await isHeldOut(orgId, contactId);
    return reply.send({ data: { heldOut } });
  });
};

export default internalHoldoutRoutes;
