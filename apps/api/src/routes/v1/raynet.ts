/**
 * Raynet CRM routes (#370/#391).
 *
 *   POST   /api/v1/raynet/connect           — save credentials (instance + user + apiKey)
 *   GET    /api/v1/raynet/connection        — current connection info (redacted)
 *   POST   /api/v1/raynet/test              — validate credentials
 *   POST   /api/v1/raynet/sync/contacts     — pull contacts
 *   POST   /api/v1/raynet/sync/companies    — pull companies
 *   POST   /api/v1/raynet/sync/deals        — pull deals (businessCases)
 *   DELETE /api/v1/raynet/connection        — disconnect
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { raynetConnections } from '../../db/schema/raynet.js';
import { AppError } from '../../lib/app-error.js';
import {
  upsertConnection,
  getConnection,
  testConnection,
} from '../../integrations/raynet/client.js';
import { pullContacts, pullCompanies, pullDeals } from '../../integrations/raynet/sync.js';
import { isValidRaynetInstance } from '../../integrations/raynet/pure.js';

const raynetRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/raynet/connect',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Raynet'], summary: 'Save Raynet credentials' },
    },
    async (req, reply) => {
      const body = z
        .object({
          instanceName: z.string().min(1).max(128),
          username: z.string().email().max(255),
          apiKey: z.string().min(1).max(512),
        })
        .parse(req.body);

      if (!isValidRaynetInstance(body.instanceName)) {
        throw AppError.badRequest('Invalid Raynet instance name');
      }

      const conn = await upsertConnection({
        orgId: req.user!.orgId,
        instanceName: body.instanceName,
        username: body.username,
        apiKey: body.apiKey,
      });
      return reply.code(201).send({ data: redact(conn) });
    },
  );

  app.get(
    '/api/v1/raynet/connection',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Raynet'], summary: 'Get current Raynet connection' },
    },
    async (req) => {
      const conn = await getConnection(req.user!.orgId);
      return { data: redact(conn) };
    },
  );

  app.post(
    '/api/v1/raynet/test',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Raynet'], summary: 'Test Raynet credentials' },
    },
    async (req) => {
      const conn = await getConnection(req.user!.orgId);
      const result = await testConnection(conn);
      return { data: result };
    },
  );

  app.post(
    '/api/v1/raynet/sync/contacts',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Raynet'], summary: 'Pull contacts from Raynet' },
    },
    async (req) => {
      const conn = await getConnection(req.user!.orgId);
      const processed = await pullContacts(conn);
      return { data: { processed } };
    },
  );

  app.post(
    '/api/v1/raynet/sync/companies',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Raynet'], summary: 'Pull companies from Raynet' },
    },
    async (req) => {
      const conn = await getConnection(req.user!.orgId);
      const processed = await pullCompanies(conn);
      return { data: { processed } };
    },
  );

  app.post(
    '/api/v1/raynet/sync/deals',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Raynet'], summary: 'Pull deals from Raynet' },
    },
    async (req) => {
      const conn = await getConnection(req.user!.orgId);
      const processed = await pullDeals(conn);
      return { data: { processed } };
    },
  );

  app.delete(
    '/api/v1/raynet/connection',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Raynet'], summary: 'Disconnect Raynet' },
    },
    async (req, reply) => {
      await db.delete(raynetConnections).where(eq(raynetConnections.orgId, req.user!.orgId));
      return reply.code(204).send();
    },
  );
};

function redact<T extends { apiKey: string }>(conn: T): Omit<T, 'apiKey'> & { apiKey: string } {
  return { ...conn, apiKey: '••••••••' };
}

export default raynetRoutes;
