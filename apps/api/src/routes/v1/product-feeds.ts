/**
 * Product feeds routes (#393).
 *
 *   GET    /api/v1/product-feeds             — list org feeds
 *   POST   /api/v1/product-feeds             — add a feed
 *   POST   /api/v1/product-feeds/:id/ingest  — trigger manual ingestion
 *   DELETE /api/v1/product-feeds/:id         — remove a feed
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { productFeeds } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { ingestFeed } from '../../services/product-catalog/feed-ingestion.js';

const productFeedRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/product-feeds',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Product feeds'], summary: 'List configured product feeds' },
    },
    async (req) => {
      const rows = await db
        .select()
        .from(productFeeds)
        .where(eq(productFeeds.orgId, req.user!.orgId))
        .orderBy(desc(productFeeds.createdAt));
      return { data: rows };
    },
  );

  app.post(
    '/api/v1/product-feeds',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Product feeds'], summary: 'Register a product feed' },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          format: z.enum(['heureka', 'zbozi', 'google_shopping', 'custom_xml']),
          url: z.string().url(),
          username: z.string().min(1).max(128).optional(),
          password: z.string().min(1).max(512).optional(),
          pollIntervalMinutes: z.number().int().min(5).max(1440).optional(),
        })
        .parse(req.body);

      const [row] = await db
        .insert(productFeeds)
        .values({
          orgId: req.user!.orgId,
          name: body.name,
          format: body.format,
          url: body.url,
          username: body.username,
          password: body.password,
          pollIntervalMinutes: body.pollIntervalMinutes ?? 60,
        })
        .returning();
      return reply.code(201).send({ data: row });
    },
  );

  app.post(
    '/api/v1/product-feeds/:id/ingest',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Product feeds'], summary: 'Trigger manual feed ingestion' },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const [feed] = await db
        .select()
        .from(productFeeds)
        .where(and(eq(productFeeds.orgId, req.user!.orgId), eq(productFeeds.id, id)))
        .limit(1);
      if (!feed) throw AppError.notFound('Product feed');
      const result = await ingestFeed(feed.id);
      return { data: result };
    },
  );

  app.delete(
    '/api/v1/product-feeds/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Product feeds'], summary: 'Remove a product feed' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await db
        .delete(productFeeds)
        .where(and(eq(productFeeds.orgId, req.user!.orgId), eq(productFeeds.id, id)));
      return reply.code(204).send();
    },
  );
};

export default productFeedRoutes;
