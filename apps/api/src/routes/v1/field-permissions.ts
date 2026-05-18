/**
 * Field-level permissions routes (#344).
 *
 *   GET    /api/v1/field-permissions
 *   POST   /api/v1/field-permissions             — upsert by (role, entity)
 *   DELETE /api/v1/field-permissions/:id
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listRules,
  upsertRule,
  deleteRule,
} from '../../services/field-permissions/index.js';

const fpRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/field-permissions', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['Field Permissions'] },
  }, async (req, reply) => {
    return reply.send({ data: await listRules(req.user!.orgId) });
  });

  app.post('/api/v1/field-permissions', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['Field Permissions'] },
  }, async (req, reply) => {
    const body = z.object({
      role: z.string().min(1).max(64),
      entity: z.string().min(1).max(64),
      readable: z.array(z.string().max(100)).optional(),
      hidden: z.array(z.string().max(100)).optional(),
      writable: z.array(z.string().max(100)).optional(),
    }).parse(req.body);
    return reply.send({ data: await upsertRule(req.user!.orgId, body) });
  });

  app.delete('/api/v1/field-permissions/:id', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['Field Permissions'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await deleteRule(req.user!.orgId, id);
    return reply.code(204).send();
  });
};

export default fpRoutes;
