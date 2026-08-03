import { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listExternalFeeds,
  getExternalFeed,
  createExternalFeed,
  updateExternalFeed,
  deleteExternalFeed,
  refreshFeed,
} from '../../services/external-feeds/index.js';

const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  feedUrl: z.string().url(),
  format: z.enum(['rss', 'csv', 'json']).optional(),
  mapping: z.record(z.string()).optional(),
  schedule: z.enum(['hourly', 'daily', 'weekly', 'manual']).optional(),
  action: z.enum(['upsert_contact', 'fire_event']).optional(),
  eventName: z.string().max(100).optional(),
  httpHeaders: z.record(z.string()).optional(),
});

const UpdateSchema = CreateSchema.partial().extend({
  active: z.boolean().optional(),
});

export async function externalFeedsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/external-feeds
  app.get(
    '/api/v1/external-feeds',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['External Feeds'], summary: 'List external feeds' },
    },
    async (req) => {
      const orgId = req.user!.orgId;
      return { data: await listExternalFeeds(orgId) };
    },
  );

  // GET /api/v1/external-feeds/:id
  app.get(
    '/api/v1/external-feeds/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['External Feeds'], summary: 'Get external feed' },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      return { data: await getExternalFeed(req.user!.orgId, id) };
    },
  );

  // POST /api/v1/external-feeds
  app.post(
    '/api/v1/external-feeds',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['External Feeds'], summary: 'Create external feed' },
    },
    async (req, reply) => {
      const body = CreateSchema.parse(req.body);
      const feed = await createExternalFeed(req.user!.orgId, body);
      return reply.code(201).send({ data: feed });
    },
  );

  // PATCH /api/v1/external-feeds/:id
  app.patch(
    '/api/v1/external-feeds/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['External Feeds'], summary: 'Update external feed' },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = UpdateSchema.parse(req.body);
      return {
        data: await updateExternalFeed(
          req.user!.orgId,
          id,
          body as Parameters<typeof updateExternalFeed>[2],
        ),
      };
    },
  );

  // DELETE /api/v1/external-feeds/:id
  app.delete(
    '/api/v1/external-feeds/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['External Feeds'], summary: 'Delete external feed' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await deleteExternalFeed(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // POST /api/v1/external-feeds/:id/refresh — manual trigger
  app.post(
    '/api/v1/external-feeds/:id/refresh',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['External Feeds'], summary: 'Manually refresh external feed' },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      return { data: await refreshFeed(req.user!.orgId, id) };
    },
  );
}
