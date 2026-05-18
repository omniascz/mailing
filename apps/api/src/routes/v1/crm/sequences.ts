import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from '../../../services/crm/sales-sequences.js';

const idParam = z.object({ id: z.string().uuid() });

const stepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['email', 'personal_email', 'wait', 'task', 'sms', 'linkedin']),
  order: z.number().int().min(0),
  delayDays: z.number().int().min(0).default(1),
  config: z.record(z.unknown()).default({}),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  steps: z.array(stepSchema).optional(),
  exitOnReply: z.boolean().optional(),
  exitOnUnsubscribe: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  steps: z.array(stepSchema).optional(),
  exitOnReply: z.boolean().optional(),
  exitOnUnsubscribe: z.boolean().optional(),
  active: z.boolean().optional(),
});

const enrollSchema = z.object({
  contactId: z.string().uuid(),
  dealId: z.string().uuid().nullable().optional(),
  senderEmail: z.string().email().nullable().optional(),
  senderName: z.string().max(255).nullable().optional(),
});

const listEnrollmentsQuery = z.object({
  contactId: z.string().uuid().optional(),
  sequenceId: z.string().uuid().optional(),
  status: z.enum(['active', 'paused', 'completed', 'replied', 'unsubscribed', 'bounced', 'cancelled']).optional(),
});

export default async function sequenceRoutes(app: FastifyInstance) {
  // ─── Sequences CRUD ──────────────────────────────────────────────────────────

  app.get(
    '/api/v1/crm/sequences',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'List sequences' } },
    async (req) => ({ data: await svc.listSequences(req.user!.orgId) }),
  );

  app.post(
    '/api/v1/crm/sequences',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Create sequence' } },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      return reply.code(201).send({ data: await svc.createSequence(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/crm/sequences/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Get sequence' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.getSequence(req.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/crm/sequences/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Update sequence' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.updateSequence(req.user!.orgId, id, updateSchema.parse(req.body)) };
    },
  );

  app.delete(
    '/api/v1/crm/sequences/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Delete sequence' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.deleteSequence(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  // ─── Enrollments ─────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/crm/sequences/:id/enroll',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Enroll contact in sequence' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const body = enrollSchema.parse(req.body);
      const enrollment = await svc.enrollContact(req.user!.orgId, {
        sequenceId: id,
        enrolledByUserId: req.user!.userId,
        ...body,
      });
      return reply.code(201).send({ data: enrollment });
    },
  );

  app.get(
    '/api/v1/crm/enrollments',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'List enrollments' } },
    async (req) => {
      const q = listEnrollmentsQuery.parse(req.query);
      return { data: await svc.listEnrollments(req.user!.orgId, q) };
    },
  );

  app.delete(
    '/api/v1/crm/enrollments/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Cancel enrollment' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.unenrollContact(req.user!.orgId, id, 'cancelled');
      return reply.code(204).send();
    },
  );
}
