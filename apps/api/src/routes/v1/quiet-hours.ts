import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { listRules, upsertRule, isQuiet } from '../../services/quiet-hours/index.js';

const quietHoursRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/quiet-hours', {
    preHandler: [app.authenticate],
    schema: { tags: ['QuietHours'] },
  }, async (req, reply) => {
    return reply.send({ data: await listRules(req.user!.orgId) });
  });

  app.put('/api/v1/quiet-hours', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['QuietHours'] },
  }, async (req, reply) => {
    const body = z.object({
      channel: z.string().optional(),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
      timezone: z.string().optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body);
    return reply.send({ data: await upsertRule(req.user!.orgId, body) });
  });

  app.get('/api/v1/quiet-hours/check', {
    preHandler: [app.authenticate],
    schema: { tags: ['QuietHours'] },
  }, async (req, reply) => {
    const q = z.object({ channel: z.string().default('all') }).parse(req.query);
    return reply.send({ data: await isQuiet(req.user!.orgId, q.channel) });
  });
};

export default quietHoursRoutes;
