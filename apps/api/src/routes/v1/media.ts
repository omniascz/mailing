import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createMediaAsset,
  listMediaAssets,
  getMediaAsset,
  deleteMediaAsset,
  folderStats,
} from '../../services/media/index.js';

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
