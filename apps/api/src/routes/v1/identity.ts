import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  trackVisitor, mergeVisitorIntoContact, listUnmerged,
} from '../../services/identity-merge/index.js';

const identityRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/identity/track', {
    preHandler: [app.authenticate],
    schema: { tags: ['Identity'] },
  }, async (req, reply) => {
    const body = z.object({
      visitorId: z.string().min(1).max(128),
      deviceId: z.string().max(128).optional(),
      properties: z.record(z.unknown()).optional(),
    }).parse(req.body);
    return reply.code(201).send({ data: await trackVisitor(req.user!.orgId, body) });
  });

  app.post('/api/v1/identity/merge', {
    preHandler: [app.authenticate],
    schema: { tags: ['Identity'] },
  }, async (req, reply) => {
    const body = z.object({
      visitorId: z.string().min(1).max(128),
      contactId: z.string().uuid(),
    }).parse(req.body);
    return reply.send({ data: await mergeVisitorIntoContact(req.user!.orgId, body) });
  });

  app.get('/api/v1/identity/unmerged', {
    preHandler: [app.authenticate],
    schema: { tags: ['Identity'] },
  }, async (req, reply) => {
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(500).optional(),
    }).parse(req.query);
    return reply.send({ data: await listUnmerged(req.user!.orgId, q.limit) });
  });
};

export default identityRoutes;
