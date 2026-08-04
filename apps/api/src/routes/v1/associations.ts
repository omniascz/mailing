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
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { associations } from '../../db/schema/index.js';

const ENTITY_TYPES = [
  'contact',
  'company',
  'account',
  'deal',
  'ticket',
  'quote',
  'invoice',
  'custom_object',
  'task',
  'note',
  'meeting',
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
    const q = z
      .object({
        entityType: z.enum(ENTITY_TYPES),
        entityId: z.string().uuid(),
      })
      .parse(req.query);
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

  // ─── Label management (#321) ──────────────────────────────────────────────

  /**
   * GET /api/v1/associations/labels
   * Returns all distinct labels used in this org's associations.
   */
  app.get('/api/v1/associations/labels', async (req, reply) => {
    const orgId = (req.user as { orgId: string }).orgId;
    const rows = await db
      .selectDistinct({ label: associations.label })
      .from(associations)
      .where(and(eq(associations.orgId, orgId), sql`${associations.label} IS NOT NULL`))
      .orderBy(associations.label);
    const labels = rows.map((r) => r.label).filter(Boolean);
    return reply.send({ data: labels });
  });

  /**
   * PUT /api/v1/associations/labels/rename
   * Renames all associations with oldLabel to newLabel within the org.
   */
  app.put('/api/v1/associations/labels/rename', async (req, reply) => {
    const orgId = (req.user as { orgId: string }).orgId;
    const { oldLabel, newLabel } = z
      .object({
        oldLabel: z.string().min(1).max(64),
        newLabel: z.string().min(1).max(64),
      })
      .parse(req.body);

    const result = await db
      .update(associations)
      .set({ label: newLabel, updatedAt: new Date() })
      .where(and(eq(associations.orgId, orgId), eq(associations.label, oldLabel)));

    return reply.send({
      data: { updated: (result as unknown as { rowCount: number }).rowCount ?? 0 },
    });
  });

  /**
   * DELETE /api/v1/associations/labels/:label
   * Removes the label from all associations (sets label to NULL).
   */
  app.delete('/api/v1/associations/labels/:label', async (req, reply) => {
    const orgId = (req.user as { orgId: string }).orgId;
    const { label } = z.object({ label: z.string().min(1).max(64) }).parse(req.params);

    await db
      .update(associations)
      .set({ label: null, updatedAt: new Date() })
      .where(and(eq(associations.orgId, orgId), eq(associations.label, label)));

    return reply.status(204).send();
  });
}
