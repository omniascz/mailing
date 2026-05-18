import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from '../../../services/crm/tasks.js';

const idParam = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  type: z.enum(['call', 'email', 'meeting', 'todo']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  contactId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

const updateSchema = z.object({
  type: z.enum(['call', 'email', 'meeting', 'todo']).optional(),
  status: z.enum(['open', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

const listQuery = z.object({
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  status: z.enum(['open', 'completed', 'cancelled']).optional(),
  type: z.enum(['call', 'email', 'meeting', 'todo']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().uuid().optional(),
});

export default async function crmTaskRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/crm/tasks',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'List tasks' } },
    async (req) => {
      const q = listQuery.parse(req.query);
      return svc.listTasks(req.user!.orgId, {
        ...q,
        overdue: q.overdue === 'true',
        limit: q.limit,
      });
    },
  );

  app.post(
    '/api/v1/crm/tasks',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Create task' } },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const task = await svc.createTask(req.user!.orgId, {
        ...body,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        createdByUserId: req.user!.userId,
      });
      return reply.code(201).send({ data: task });
    },
  );

  app.get(
    '/api/v1/crm/tasks/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Get task' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.getTask(req.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/crm/tasks/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Update task' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = updateSchema.parse(req.body);
      const { dueAt: dueAtStr, ...rest } = body;
      const task = await svc.updateTask(req.user!.orgId, id, {
        ...rest,
        ...(dueAtStr !== undefined ? { dueAt: dueAtStr ? new Date(dueAtStr) : null } : {}),
      });
      return { data: task };
    },
  );

  app.post(
    '/api/v1/crm/tasks/:id/complete',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Complete task' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.completeTask(req.user!.orgId, id) };
    },
  );

  app.delete(
    '/api/v1/crm/tasks/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Delete task' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.deleteTask(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/crm/tasks/overdue',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'List overdue tasks' } },
    async (req) => ({ data: await svc.listOverdueTasks(req.user!.orgId) }),
  );
}
