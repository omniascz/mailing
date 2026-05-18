/**
 * Trait routes (#268).
 *
 *   GET  /api/v1/cdp/traits/:contactId       — read persisted traits
 *   POST /api/v1/cdp/traits/:contactId       — recompute + persist for one contact
 *   POST /api/v1/cdp/traits/recompute        — batch recompute (optionally since)
 *   GET  /api/v1/cdp/traits                  — list trait definitions (builtin + org)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  computeTraits,
  getTraits,
  recomputeAllTraits,
  getTraitDefinitions,
} from '../../../services/cdp/traits.js';

const traitRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/cdp/traits', {
    preHandler: [app.authenticate],
    schema: { tags: ['CDP'] },
  }, async (req, reply) => {
    return reply.send({ data: await getTraitDefinitions(req.user!.orgId) });
  });

  app.get('/api/v1/cdp/traits/:contactId', {
    preHandler: [app.authenticate],
    schema: { tags: ['CDP'] },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await getTraits(req.user!.orgId, contactId) });
  });

  app.post('/api/v1/cdp/traits/:contactId', {
    preHandler: [app.authenticate],
    schema: { tags: ['CDP'] },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const values = await computeTraits(req.user!.orgId, contactId);
    return reply.send({ data: values });
  });

  app.post('/api/v1/cdp/traits/recompute', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['CDP'] },
  }, async (req, reply) => {
    const body = z.object({
      since: z.string().datetime().optional(),
      limit: z.number().int().min(1).max(50000).optional(),
    }).parse(req.body ?? {});
    const result = await recomputeAllTraits(req.user!.orgId, {
      since: body.since ? new Date(body.since) : undefined,
      limit: body.limit,
    });
    return reply.send({ data: result });
  });
};

export default traitRoutes;
