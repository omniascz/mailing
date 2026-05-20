/**
 * List admin CRUD routes.
 *
 *   GET    /api/v1/lists                          — list org's lists
 *   POST   /api/v1/lists                          — create
 *   GET    /api/v1/lists/:id                      — get with live count
 *   PUT    /api/v1/lists/:id                      — update
 *   DELETE /api/v1/lists/:id                      — soft delete
 *   POST   /api/v1/lists/:id/contacts             — add contact to list
 *   DELETE /api/v1/lists/:id/contacts/:contactId  — remove contact from list
 *
 * Note: public DOI subscribe endpoint remains in subscriptions.ts —
 * that flow is different (DOI token, pending state, email confirm).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listLists,
  getList,
  createList,
  updateList,
  deleteList,
  addContactToList,
  removeContactFromList,
} from '../../services/lists/index.js';

const idParam = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  doubleOptIn: z.boolean().optional(),
  thankYouUrl: z.string().url().max(1024).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  doubleOptIn: z.boolean().optional(),
  thankYouUrl: z.string().url().max(1024).nullable().optional(),
});

export default async function listRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/api/v1/lists',
    {
      schema: { tags: ['Lists'], summary: "List org's lists" },
    },
    async (req) => {
      return { data: await listLists(req.user!.orgId) };
    },
  );

  app.post(
    '/api/v1/lists',
    {
      schema: { tags: ['Lists'], summary: 'Create list' },
    },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const list = await createList(req.user!.orgId, body);
      return reply.code(201).send({ data: list });
    },
  );

  app.get(
    '/api/v1/lists/:id',
    {
      schema: { tags: ['Lists'], summary: 'Get list' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      return { data: await getList(req.user!.orgId, id) };
    },
  );

  app.put(
    '/api/v1/lists/:id',
    {
      schema: { tags: ['Lists'], summary: 'Update list' },
    },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = updateSchema.parse(req.body);
      return { data: await updateList(req.user!.orgId, id, body) };
    },
  );

  app.delete(
    '/api/v1/lists/:id',
    {
      schema: { tags: ['Lists'], summary: 'Soft-delete list' },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      await deleteList(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/lists/:id/contacts',
    {
      schema: { tags: ['Lists'], summary: 'Add contact to list (admin, skips DOI)' },
    },
    async (req, reply) => {
      const { id } = idParam.parse(req.params);
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.body);
      await addContactToList(req.user!.orgId, id, contactId);
      return reply.code(204).send();
    },
  );

  app.delete(
    '/api/v1/lists/:id/contacts/:contactId',
    {
      schema: { tags: ['Lists'], summary: 'Remove contact from list' },
    },
    async (req, reply) => {
      const { id, contactId } = z
        .object({
          id: z.string().uuid(),
          contactId: z.string().uuid(),
        })
        .parse(req.params);
      await removeContactFromList(req.user!.orgId, id, contactId);
      return reply.code(204).send();
    },
  );
}
