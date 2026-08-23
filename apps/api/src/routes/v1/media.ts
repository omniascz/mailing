import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createMediaAsset,
  listMediaAssets,
  getMediaAsset,
  deleteMediaAsset,
  folderStats,
} from '../../services/media/index.js';
import { transformAsset } from '../../services/media/transform-asset.js';
import { ALLOWED_OUTPUT_FORMATS } from '../../services/media/image-transform.js';

const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/media',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          folder: z.string().optional(),
          tag: z.string().optional(),
        })
        .parse(req.query);
      return reply.send({ data: await listMediaAssets(req.user!.orgId, q) });
    },
  );

  app.post(
    '/api/v1/media',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          folder: z.string().default('/'),
          filename: z.string().min(1).max(255),
          mimeType: z.string().min(1).max(100),
          sizeBytes: z.number().int().min(0),
          width: z.number().int().optional(),
          height: z.number().int().optional(),
          storageUrl: z.string().url(),
          thumbnailUrl: z.string().url().optional(),
          altText: z.string().max(512).optional(),
          tags: z.array(z.string()).default([]),
        })
        .parse(req.body);
      const asset = await createMediaAsset(req.user!.orgId, body);
      return reply.code(201).send({ data: asset });
    },
  );

  app.get(
    '/api/v1/media/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getMediaAsset(id, req.user!.orgId) });
    },
  );

  app.delete(
    '/api/v1/media/:id',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteMediaAsset(id, req.user!.orgId);
      return reply.code(204).send();
    },
  );

  /**
   * POST /api/v1/media/:id/transform
   * Crop / resize / rotate / recompress an image into a NEW asset.
   *
   * Never in place: the original's URL is quoted by campaigns that have
   * already been delivered and by the view-in-browser page, both of which
   * would silently change. See services/media/transform-asset.ts.
   */
  app.post(
    '/api/v1/media/:id/transform',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          crop: z
            .object({
              left: z.number().int().min(0),
              top: z.number().int().min(0),
              width: z.number().int().min(1),
              height: z.number().int().min(1),
            })
            .optional(),
          resize: z
            .object({
              width: z.number().int().min(1).optional(),
              height: z.number().int().min(1).optional(),
              fit: z.enum(['cover', 'contain', 'inside']).optional(),
            })
            .optional(),
          rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
          format: z.enum(ALLOWED_OUTPUT_FORMATS).optional(),
          quality: z.number().int().min(1).max(100).optional(),
          filename: z.string().min(1).max(255).optional(),
        })
        .parse(req.body ?? {});

      const asset = await transformAsset(req.user!.orgId, id, body);
      return reply.code(201).send({ data: asset });
    },
  );

  app.get(
    '/api/v1/media/stats/folders',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Media'] },
    },
    async (req, reply) => {
      return reply.send({ data: await folderStats(req.user!.orgId) });
    },
  );
};

export default mediaRoutes;
