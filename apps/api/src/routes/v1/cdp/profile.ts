/**
 * Unified profile routes (#265).
 *
 *   GET  /api/v1/cdp/profile/:contactId               — full unified profile (cache-first)
 *   GET  /api/v1/cdp/profile/by-signal                — resolve via identity graph
 *   POST /api/v1/cdp/profile/:contactId/invalidate    — drop cache for this contact
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getUnifiedProfile,
  getProfileBySignal,
  invalidateProfile,
} from '../../../services/cdp/unified-profile.js';
import { AppError } from '../../../lib/app-error.js';

const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/cdp/profile/:contactId', {
    preHandler: [app.authenticate],
    schema: { tags: ['CDP'] },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    const q = z.object({ bypassCache: z.coerce.boolean().optional() }).parse(req.query);
    const profile = await getUnifiedProfile(req.user!.orgId, contactId, {
      bypassCache: q.bypassCache,
    });
    return reply.send({ data: profile });
  });

  app.get('/api/v1/cdp/profile/by-signal', {
    preHandler: [app.authenticate],
    schema: { tags: ['CDP'] },
  }, async (req, reply) => {
    const q = z.object({
      type: z.string().min(1),
      value: z.string().min(1),
    }).parse(req.query);
    const profile = await getProfileBySignal(req.user!.orgId, q.type, q.value);
    if (!profile) throw AppError.notFound('Profile');
    return reply.send({ data: profile });
  });

  app.post('/api/v1/cdp/profile/:contactId/invalidate', {
    preHandler: [app.authenticate],
    schema: { tags: ['CDP'] },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    await invalidateProfile(req.user!.orgId, contactId);
    return reply.send({ data: { ok: true } });
  });
};

export default profileRoutes;
