import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from '../../../services/crm/notes.js';

const idParam = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  body: z.string().min(1).max(10_000),
  contactId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
});

const listQuery = z.object({
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().uuid().optional(),
});

export default async function crmNoteRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/crm/notes',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'List notes' } },
    async (req) => {
      const q = listQuery.parse(req.query);
      return svc.listNotes(req.user!.orgId, q);
    },
  );

  app.post(
    '/api/v1/crm/notes',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Create note' } },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const note = await svc.createNote(req.user!.orgId, {
        ...body,
        authorUserId: req.user!.userId,
      });
      return reply.code(201).send({ data: note });
    },
  );

  app.get(
    '/api/v1/crm/notes/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Get note' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await svc.getNote(req.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/crm/notes/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Update note' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { body } = z.object({ body: z.string().min(1).max(10_000) }).parse(req.body);
      return { data: await svc.updateNote(req.user!.orgId, id, { body }) };
    },
  );

  app.delete(
    '/api/v1/crm/notes/:id',
    { preHandler: app.requireAuth, schema: { tags: ['CRM'], summary: 'Delete note' } },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await svc.deleteNote(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );
}
