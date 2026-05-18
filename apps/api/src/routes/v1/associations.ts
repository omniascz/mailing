/**
 * Associations API routes (#320).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createAssociation,
  deleteAssociation,
  listAssociations,
  countAssociations,
} from '../../services/associations/index.js';

const ENTITY_TYPES = [
  'contact', 'company', 'account', 'deal', 'ticket',
  'quote', 'invoice', 'custom_object', 'task', 'note', 'meeting',
] as const;

const createSchema = z.object({
  fromType: z.enum(ENTITY_TYPES),
  fromId: z.string().uuid(),
  toType: z.enum(ENTITY_TYPES),
  toId: z.string().uuid(),
  label: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listQuery = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().uuid(),
  peerType: z.enum(ENTITY_TYPES).optional(),
});

export default async function associationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post('/api/v1/associations', async (req, reply) => {
    const body = createSchema.parse(req.body);
    const orgId = (req.user as { orgId: string }).orgId;
    const row = await createAssociation(orgId, body);
    return reply.status(201).send({ data: row });
  });

  app.get('/api/v1/associations', async (req, reply) => {
    const q = listQuery.parse(req.query);
    const orgId = (req.user as { orgId: string }).orgId;
    const rows = await listAssociations(orgId, q.entityType, q.entityId, q.peerType);
    return reply.send({ data: rows, total: rows.length });
  });

  app.get('/api/v1/associations/counts', async (req, reply) => {
    const q = z.object({
      entityType: z.enum(ENTITY_TYPES),
      entityId: z.string().uuid(),
    }).parse(req.query);
    const orgId = (req.user as { orgId: string }).orgId;
    const counts = await countAssociations(orgId, q.entityType, q.entityId);
    return reply.send({ data: counts });
  });

  app.delete('/api/v1/associations/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const orgId = (req.user as { orgId: string }).orgId;
    await deleteAssociation(orgId, id);
    return reply.status(204).send();
  });
}
