import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createHoldoutGroup, listHoldoutGroups, populateHoldout,
  isHeldOut, holdoutMembers,
} from '../../services/holdout/index.js';

const holdoutRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/holdout-groups', {
    preHandler: [app.authenticate],
    schema: { tags: ['Holdout'] },
  }, async (req, reply) => {
    return reply.send({ data: await listHoldoutGroups(req.user!.orgId) });
  });

  app.post('/api/v1/holdout-groups', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['Holdout'] },
  }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(1024).optional(),
      percentage: z.number().min(0).max(50),
    }).parse(req.body);
    return reply.code(201).send({ data: await createHoldoutGroup(req.user!.orgId, body) });
  });

  app.post('/api/v1/holdout-groups/:id/populate', {
    preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
    schema: { tags: ['Holdout'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await populateHoldout(req.user!.orgId, id) });
  });

  app.get('/api/v1/holdout-groups/:id/members', {
    preHandler: [app.authenticate],
    schema: { tags: ['Holdout'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ data: await holdoutMembers(id, req.user!.orgId) });
  });

  app.get('/api/v1/holdout/check/:contactId', {
    preHandler: [app.authenticate],
    schema: { tags: ['Holdout'] },
  }, async (req, reply) => {
    const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
    return reply.send({ data: { heldOut: await isHeldOut(req.user!.orgId, contactId) } });
  });
};

export default holdoutRoutes;
