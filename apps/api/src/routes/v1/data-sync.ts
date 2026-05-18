/**
 * CRM data-sync routes (#355).
 *
 *   GET    /api/v1/data-sync/mappings                   — list mappings
 *   POST   /api/v1/data-sync/mappings                   — create (admin)
 *   PATCH  /api/v1/data-sync/mappings/:id               — update (admin)
 *   DELETE /api/v1/data-sync/mappings/:id               — admin
 *   GET    /api/v1/data-sync/conflicts                  — unresolved conflicts
 *   POST   /api/v1/data-sync/conflicts/:id/resolve      — admin: pick a side
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  dataSyncMappings, dataSyncConflicts,
  type FieldRule,
} from '../../db/schema/data-sync-mappings.js';
import { resolveConflict } from '../../services/data-sync/engine.js';

const fieldRuleSchema = z.object({
  remoteKey: z.string().min(1),
  direction: z.enum(['in', 'out', 'both']),
  conflict: z.enum(['local_wins', 'remote_wins', 'newer_wins', 'manual']),
  transform: z.string().optional(),
});

const dataSyncRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/data-sync/mappings', {
    preHandler: [app.authenticate],
    schema: { tags: ['DataSync'] },
  }, async (req, reply) => {
    const rows = await db.select().from(dataSyncMappings)
      .where(eq(dataSyncMappings.orgId, req.user!.orgId));
    return reply.send({ data: rows });
  });

  app.post('/api/v1/data-sync/mappings', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['DataSync'] },
  }, async (req, reply) => {
    const body = z.object({
      provider: z.enum(['hubspot', 'salesforce', 'pipedrive']),
      entity: z.enum(['contact', 'deal', 'account']),
      direction: z.enum(['in', 'out', 'both']).optional(),
      fieldMap: z.record(fieldRuleSchema),
      pullFilter: z.record(z.unknown()).optional(),
    }).parse(req.body);

    const [row] = await db.insert(dataSyncMappings).values({
      orgId: req.user!.orgId,
      provider: body.provider,
      entity: body.entity,
      direction: body.direction ?? 'both',
      fieldMap: body.fieldMap as Record<string, FieldRule>,
      pullFilter: body.pullFilter ?? {},
    }).returning();
    return reply.code(201).send({ data: row });
  });

  app.patch('/api/v1/data-sync/mappings/:id', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['DataSync'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      direction: z.enum(['in', 'out', 'both']).optional(),
      fieldMap: z.record(fieldRuleSchema).optional(),
      pullFilter: z.record(z.unknown()).optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body);

    await db.update(dataSyncMappings)
      .set({ ...body, updatedAt: new Date() })
      .where(and(
        eq(dataSyncMappings.orgId, req.user!.orgId),
        eq(dataSyncMappings.id, id),
      ));
    return reply.code(204).send();
  });

  app.delete('/api/v1/data-sync/mappings/:id', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['DataSync'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.delete(dataSyncMappings).where(and(
      eq(dataSyncMappings.orgId, req.user!.orgId),
      eq(dataSyncMappings.id, id),
    ));
    return reply.code(204).send();
  });

  app.get('/api/v1/data-sync/conflicts', {
    preHandler: [app.authenticate],
    schema: { tags: ['DataSync'] },
  }, async (req, reply) => {
    const rows = await db.select().from(dataSyncConflicts).where(and(
      eq(dataSyncConflicts.orgId, req.user!.orgId),
      eq(dataSyncConflicts.resolved, false),
    ));
    return reply.send({ data: rows });
  });

  app.post('/api/v1/data-sync/conflicts/:id/resolve', {
    preHandler: [app.authenticate, app.requireRole('admin')],
    schema: { tags: ['DataSync'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      resolution: z.enum(['local', 'remote', 'custom']),
      customValue: z.unknown().optional(),
    }).parse(req.body);
    await resolveConflict(req.user!.orgId, id, body.resolution, body.customValue);
    return reply.code(204).send();
  });
};

export default dataSyncRoutes;
