import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createCategory,
  listCategories,
  createGroup,
  listGroups,
  addContactToGroup,
  removeContactFromGroup,
  getContactGroups,
} from '../../services/groups/index.js';

const groupRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/groups/categories',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Groups'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listCategories(req.user!.orgId) });
    },
  );

  app.post(
    '/api/v1/groups/categories',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Groups'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(100),
          kind: z.enum(['checkboxes', 'radio', 'dropdown', 'hidden']).optional(),
          visible: z.boolean().optional(),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createCategory(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/groups',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Groups'] },
    },
    async (req, reply) => {
      const q = z.object({ categoryId: z.string().uuid().optional() }).parse(req.query);
      return reply.send({ data: await listGroups(req.user!.orgId, q.categoryId) });
    },
  );

  app.post(
    '/api/v1/groups',
    {
      preHandler: [app.authenticate, app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Groups'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          categoryId: z.string().uuid(),
          name: z.string().min(1).max(100),
        })
        .parse(req.body);
      return reply.code(201).send({ data: await createGroup(req.user!.orgId, body) });
    },
  );

  app.post(
    '/api/v1/groups/:groupId/members/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Groups'] },
    },
    async (req, reply) => {
      const { groupId, contactId } = z
        .object({
          groupId: z.string().uuid(),
          contactId: z.string().uuid(),
        })
        .parse(req.params);
      await addContactToGroup(contactId, groupId, req.user!.orgId);
      return reply.code(204).send();
    },
  );

  app.delete(
    '/api/v1/groups/:groupId/members/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Groups'] },
    },
    async (req, reply) => {
      const { groupId, contactId } = z
        .object({
          groupId: z.string().uuid(),
          contactId: z.string().uuid(),
        })
        .parse(req.params);
      await removeContactFromGroup(contactId, groupId);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/v1/contacts/:contactId/groups',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Groups'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getContactGroups(contactId) });
    },
  );
};

export default groupRoutes;
