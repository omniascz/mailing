import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createRssCampaign, listRssCampaigns, getRssCampaign,
  parseFeed, runDueRssCampaigns,
} from '../../services/rss/index.js';

const rssRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/rss-campaigns', {
    preHandler: [app.authenticate],
    schema: { tags: ['RSS'] },
  }, async (req, reply) => {
    return reply.send({ data: await listRssCampaigns(req.user!.orgId) });
  });

  app.post('/api/v1/rss-campaigns', {
    preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
    schema: { tags: ['RSS'] },
  }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      feedUrl: z.string().url(),
      listId: z.string().uuid().optional(),
      frequency: z.enum(['hourly', 'daily', 'weekly']).default('daily'),
      sendTime: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
      timezone: z.string().default('UTC'),
      fromName: z.string().max(100).optional(),
      fromEmail: z.string().email().optional(),
      subjectTemplate: z.string().max(255).default('{{rss.title}}'),
    }).parse(req.body);
    return reply.code(201).send({ data: await createRssCampaign(req.user!.orgId, body) });
  });

  app.get('/api/v1/rss-campaigns/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['RSS'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await getRssCampaign(id, req.user!.orgId) });
  });

  app.post('/api/v1/rss-campaigns/preview', {
    preHandler: [app.authenticate],
    schema: { tags: ['RSS'] },
  }, async (req, reply) => {
    const body = z.object({ feedUrl: z.string().url() }).parse(req.body);
    const items = await parseFeed(body.feedUrl);
    return reply.send({ data: items.slice(0, 10) });
  });

  app.post('/api/v1/rss-campaigns/run-due', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['RSS'] },
  }, async (_req, reply) => {
    return reply.send({ data: await runDueRssCampaigns() });
  });
};

export default rssRoutes;
