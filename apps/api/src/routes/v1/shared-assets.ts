/**
 * Shared assets routes (#276).
 *
 * Read-only endpoints that merge parent org's shared templates/blocks/brand-kit
 * with the current child org's own assets.
 *
 *  GET  /api/v1/shared-assets/saved-blocks      — own + parent shared blocks
 *  GET  /api/v1/shared-assets/templates         — own + parent shared templates
 *  GET  /api/v1/shared-assets/brand-kit         — effective brand kit (own || parent)
 *
 * Existing editor/template write routes remain unchanged — children cannot
 * modify parent assets (they are returned with isShared=true, which the UI
 * uses to disable editing).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listSavedBlocksWithShared,
  listTemplatesWithShared,
  getEffectiveBrandKit,
} from '../../services/assets/shared.js';

const sharedAssetsRoutes: FastifyPluginAsync = async (app) => {

  app.get('/api/v1/shared-assets/saved-blocks', {
    preHandler: [app.authenticate],
    schema: { tags: ['Shared Assets'] },
  }, async (req, reply) => {
    const { category } = z.object({ category: z.string().optional() }).parse(req.query);
    const blocks = await listSavedBlocksWithShared(req.user!.orgId, category);
    return reply.send({ data: blocks });
  });

  app.get('/api/v1/shared-assets/templates', {
    preHandler: [app.authenticate],
    schema: { tags: ['Shared Assets'] },
  }, async (req, reply) => {
    const { category } = z.object({ category: z.string().optional() }).parse(req.query);
    const rows = await listTemplatesWithShared(req.user!.orgId, category);
    return reply.send({ data: rows });
  });

  app.get('/api/v1/shared-assets/brand-kit', {
    preHandler: [app.authenticate],
    schema: { tags: ['Shared Assets'] },
  }, async (req, reply) => {
    const kit = await getEffectiveBrandKit(req.user!.orgId);
    return reply.send({ data: kit });
  });
};

export default sharedAssetsRoutes;
