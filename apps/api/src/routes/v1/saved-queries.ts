/**
 * Saved NL queries routes (#272/L4-4).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createSavedQuery,
  listSavedQueries,
  getSavedQuery,
  updateSavedQuery,
  deleteSavedQuery,
} from '../../services/ai-analytics/saved-queries.js';

const savedQueryRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/analytics/saved-queries',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Aura Analytics'], summary: 'List saved NL queries' },
    },
    async (req) => ({
      data: await listSavedQueries(req.user!.orgId, req.user!.userId),
    }),
  );

  app.post(
    '/api/v1/analytics/saved-queries',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Aura Analytics'], summary: 'Save an NL query' },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          description: z.string().max(2048).optional(),
          question: z.string().min(1).max(4096),
          visibility: z.enum(['org', 'private']).optional(),
          tags: z.array(z.string().max(64)).optional(),
        })
        .parse(req.body);
      const row = await createSavedQuery(req.user!.orgId, req.user!.userId, body);
      return reply.code(201).send({ data: row });
    },
  );

  app.get(
    '/api/v1/analytics/saved-queries/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Aura Analytics'], summary: 'Get a saved query' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await getSavedQuery(req.user!.orgId, id, req.user!.userId) };
    },
  );

  app.patch(
    '/api/v1/analytics/saved-queries/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Aura Analytics'], summary: 'Update a saved query' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          name: z.string().min(1).max(255).optional(),
          description: z.string().max(2048).optional(),
          question: z.string().min(1).max(4096).optional(),
          visibility: z.enum(['org', 'private']).optional(),
          tags: z.array(z.string().max(64)).optional(),
        })
        .parse(req.body);
      return { data: await updateSavedQuery(req.user!.orgId, id, req.user!.userId, body) };
    },
  );

  app.delete(
    '/api/v1/analytics/saved-queries/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Aura Analytics'], summary: 'Delete a saved query' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteSavedQuery(req.user!.orgId, id, req.user!.userId);
      return reply.code(204).send();
    },
  );
};

export default savedQueryRoutes;
