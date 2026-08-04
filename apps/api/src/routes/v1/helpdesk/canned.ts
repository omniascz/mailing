/**
 * Canned responses routes (#246, #507).
 *
 *   GET    /api/v1/helpdesk/canned-responses        — list org canned responses
 *   POST   /api/v1/helpdesk/canned-responses        — create
 *   GET    /api/v1/helpdesk/canned-responses/:id    — get
 *   PUT    /api/v1/helpdesk/canned-responses/:id    — update
 *   DELETE /api/v1/helpdesk/canned-responses/:id    — delete
 *   GET    /api/v1/helpdesk/canned-responses/search — search by shortcut or keyword
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, ilike, or, desc } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { cannedResponses } from '../../../db/schema/index.js';

const bodySchema = z.object({
  name: z.string().min(1).max(255),
  shortcut: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  body: z.string().min(1).max(50_000),
  shared: z.boolean().default(true),
});

const idParam = z.object({ id: z.string().uuid() });

export default async function cannedResponseRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const adminAuth = { preHandler: [app.authenticate, app.requireRole('admin', 'owner', 'editor')] };

  app.get('/api/v1/helpdesk/canned-responses', auth, async (req, reply) => {
    const rows = await db
      .select()
      .from(cannedResponses)
      .where(eq(cannedResponses.orgId, req.user!.orgId))
      .orderBy(desc(cannedResponses.createdAt));
    return reply.send({ data: rows });
  });

  app.get('/api/v1/helpdesk/canned-responses/search', auth, async (req, reply) => {
    const { q } = z.object({ q: z.string().min(1).max(100) }).parse(req.query);
    const rows = await db
      .select()
      .from(cannedResponses)
      .where(
        and(
          eq(cannedResponses.orgId, req.user!.orgId),
          or(
            ilike(cannedResponses.name, `%${q}%`),
            ilike(cannedResponses.shortcut, `%${q}%`),
            ilike(cannedResponses.body, `%${q}%`),
          ),
        ),
      )
      .orderBy(cannedResponses.name)
      .limit(20);
    return reply.send({ data: rows });
  });

  app.post('/api/v1/helpdesk/canned-responses', adminAuth, async (req, reply) => {
    const body = bodySchema.parse(req.body);
    const [row] = await db
      .insert(cannedResponses)
      .values({ ...body, orgId: req.user!.orgId, createdByUserId: req.user!.userId })
      .returning();
    return reply.code(201).send({ data: row });
  });

  app.get('/api/v1/helpdesk/canned-responses/:id', auth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [row] = await db
      .select()
      .from(cannedResponses)
      .where(and(eq(cannedResponses.orgId, req.user!.orgId), eq(cannedResponses.id, id)))
      .limit(1);
    if (!row)
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Canned response not found' });
    return reply.send({ data: row });
  });

  app.put('/api/v1/helpdesk/canned-responses/:id', adminAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = bodySchema.partial().parse(req.body);
    const [row] = await db
      .update(cannedResponses)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(cannedResponses.orgId, req.user!.orgId), eq(cannedResponses.id, id)))
      .returning();
    if (!row)
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Canned response not found' });
    return reply.send({ data: row });
  });

  app.delete('/api/v1/helpdesk/canned-responses/:id', adminAuth, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db
      .delete(cannedResponses)
      .where(and(eq(cannedResponses.orgId, req.user!.orgId), eq(cannedResponses.id, id)));
    return reply.code(204).send();
  });
}
