import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
  deleteAccount,
  listChildAccounts,
} from '../../../services/crm/accounts.js';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().max(255).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  annualRevenueUsd: z.number().int().nonnegative().optional().nullable(),
  employeeCount: z.number().int().nonnegative().optional().nullable(),
  parentAccountId: z.string().uuid().optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
  customFields: z.record(z.unknown()).optional().nullable(),
});

const updateSchema = createSchema.partial();

const accountRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/crm/accounts',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['CRM Accounts'] },
    },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      return reply.status(201).send({ data: await createAccount(req.user!.orgId, body) });
    },
  );

  app.get(
    '/api/v1/crm/accounts',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CRM Accounts'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          search: z.string().optional(),
          industry: z.string().optional(),
          ownerUserId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        })
        .parse(req.query);
      return reply.send({ data: await listAccounts(req.user!.orgId, q) });
    },
  );

  app.get(
    '/api/v1/crm/accounts/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CRM Accounts'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await getAccount(req.user!.orgId, id) });
    },
  );

  app.patch(
    '/api/v1/crm/accounts/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin', 'editor')],
      schema: { tags: ['CRM Accounts'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = updateSchema.parse(req.body);
      return reply.send({ data: await updateAccount(req.user!.orgId, id, body) });
    },
  );

  app.delete(
    '/api/v1/crm/accounts/:id',
    {
      preHandler: [app.authenticate, app.requireRole('owner', 'admin')],
      schema: { tags: ['CRM Accounts'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteAccount(req.user!.orgId, id);
      return reply.status(204).send();
    },
  );

  app.get(
    '/api/v1/crm/accounts/:id/children',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CRM Accounts'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await listChildAccounts(req.user!.orgId, id) });
    },
  );
};

export default accountRoutes;
