/**
 * Record rotation / round-robin routes (#326).
 *
 *  GET  /api/v1/crm/rotation-configs           — list configs
 *  POST /api/v1/crm/rotation-configs           — create config
 *  PUT  /api/v1/crm/rotation-configs/:id       — update config
 *  DELETE /api/v1/crm/rotation-configs/:id     — deactivate config
 *
 *  POST /api/v1/crm/rotation/assign            — assign next user to an entity
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createRotationConfig,
  listRotationConfigs,
  updateRotationConfig,
  assignNextUser,
} from '../../../services/crm/rotation.js';

const entityTypeEnum = z.enum(['deal', 'contact', 'ticket', 'lead']);
const strategyEnum = z.enum(['round_robin', 'load_balanced', 'random']);

const createSchema = z.object({
  name: z.string().min(1).max(255),
  entityType: entityTypeEnum,
  pipelineId: z.string().uuid().optional(),
  strategy: strategyEnum.default('round_robin'),
  userIds: z.array(z.string().uuid()).min(1).max(100),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  userIds: z.array(z.string().uuid()).min(1).max(100).optional(),
  strategy: strategyEnum.optional(),
  active: z.boolean().optional(),
});

const assignSchema = z.object({
  entityType: entityTypeEnum,
  entityId: z.string().uuid(),
  pipelineId: z.string().uuid().optional(),
});

export default async function rotationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/api/v1/crm/rotation-configs', async (req) => {
    const rows = await listRotationConfigs(req.user!.orgId);
    return { data: rows, total: rows.length };
  });

  app.post('/api/v1/crm/rotation-configs', async (req, reply) => {
    const body = createSchema.parse(req.body);
    const row = await createRotationConfig(req.user!.orgId, body);
    return reply.code(201).send({ data: row });
  });

  app.put('/api/v1/crm/rotation-configs/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = updateSchema.parse(req.body);
    const row = await updateRotationConfig(req.user!.orgId, id, body);
    return { data: row };
  });

  app.delete('/api/v1/crm/rotation-configs/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await updateRotationConfig(req.user!.orgId, id, { active: false });
    return reply.code(204).send();
  });

  app.post('/api/v1/crm/rotation/assign', async (req) => {
    const body = assignSchema.parse(req.body);
    const userId = await assignNextUser(
      req.user!.orgId,
      body.entityType,
      body.entityId,
      body.pipelineId,
    );
    return { data: { assignedUserId: userId } };
  });
}
