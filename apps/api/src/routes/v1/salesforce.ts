import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { salesforceConnections } from '../../db/schema/salesforce.js';
import { authorizeUrl, exchangeCode, getConnection } from '../../integrations/salesforce/client.js';
import { runSync, listSyncRuns } from '../../integrations/salesforce/sync.js';
import { AppError } from '../../lib/app-error.js';
import { randomBytes } from 'node:crypto';

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw AppError.badRequest(`Missing env: ${key}`);
  return v;
}

export default async function salesforceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    if (!req.url.includes('/oauth/callback')) await app.requireAuth(req);
  });

  app.get(
    '/api/v1/integrations/salesforce/status',
    { schema: { tags: ['Salesforce'], summary: 'Connection status' } },
    async (req) => {
      const [row] = await db
        .select({
          orgId: salesforceConnections.orgId,
          instanceUrl: salesforceConnections.instanceUrl,
          salesforceUserId: salesforceConnections.salesforceUserId,
          salesforceOrgId: salesforceConnections.salesforceOrgId,
          syncContacts: salesforceConnections.syncContacts,
          syncAccounts: salesforceConnections.syncAccounts,
          syncDeals: salesforceConnections.syncDeals,
          lastSyncAt: salesforceConnections.lastSyncAt,
          createdAt: salesforceConnections.createdAt,
        })
        .from(salesforceConnections)
        .where(eq(salesforceConnections.orgId, req.user!.orgId))
        .limit(1);
      return { data: row ?? null };
    },
  );

  app.post(
    '/api/v1/integrations/salesforce/oauth/authorize-url',
    { schema: { tags: ['Salesforce'], summary: 'Build OAuth authorize URL' } },
    async (req) => {
      const { loginHost } = z
        .object({ loginHost: z.string().url().optional() })
        .parse(req.body ?? {});
      const state = `${req.user!.orgId}:${randomBytes(16).toString('hex')}`;
      const url = authorizeUrl({
        clientId: envOrThrow('SALESFORCE_CLIENT_ID'),
        redirectUri: envOrThrow('SALESFORCE_REDIRECT_URI'),
        state,
        loginHost,
      });
      return { data: { url, state } };
    },
  );

  // Public — Salesforce calls this without our auth header.
  app.get(
    '/api/v1/integrations/salesforce/oauth/callback',
    { schema: { tags: ['Salesforce'], summary: 'OAuth callback' } },
    async (req) => {
      const { code, state } = z.object({ code: z.string(), state: z.string() }).parse(req.query);
      const orgId = state.split(':')[0];
      if (!orgId || orgId.length !== 36) throw AppError.badRequest('Invalid state');
      const conn = await exchangeCode({
        orgId,
        code,
        clientId: envOrThrow('SALESFORCE_CLIENT_ID'),
        clientSecret: envOrThrow('SALESFORCE_CLIENT_SECRET'),
        redirectUri: envOrThrow('SALESFORCE_REDIRECT_URI'),
      });
      return { data: { connected: true, instanceUrl: conn.instanceUrl } };
    },
  );

  app.put(
    '/api/v1/integrations/salesforce/settings',
    { schema: { tags: ['Salesforce'], summary: 'Update sync settings' } },
    async (req) => {
      const body = z
        .object({
          syncContacts: z.boolean().optional(),
          syncAccounts: z.boolean().optional(),
          syncDeals: z.boolean().optional(),
          fieldMap: z.record(z.record(z.string())).optional(),
        })
        .parse(req.body);
      const [row] = await db
        .update(salesforceConnections)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(salesforceConnections.orgId, req.user!.orgId))
        .returning();
      if (!row) throw AppError.notFound('Salesforce connection');
      return { data: row };
    },
  );

  app.delete(
    '/api/v1/integrations/salesforce',
    { schema: { tags: ['Salesforce'], summary: 'Disconnect' } },
    async (req, reply) => {
      await db
        .delete(salesforceConnections)
        .where(eq(salesforceConnections.orgId, req.user!.orgId));
      return reply.code(204).send();
    },
  );

  app.post(
    '/api/v1/integrations/salesforce/sync',
    { schema: { tags: ['Salesforce'], summary: 'Trigger sync' } },
    async (req) => {
      const { direction } = z
        .object({ direction: z.enum(['push', 'pull', 'both']).optional() })
        .parse(req.body ?? {});
      await getConnection(req.user!.orgId); // 404 if missing
      // Run async: don't block the request on a long sync.
      void runSync(req.user!.orgId, { direction }).catch((err) =>
        req.log.error({ err }, 'salesforce sync failed'),
      );
      return { data: { started: true } };
    },
  );

  app.get(
    '/api/v1/integrations/salesforce/sync-runs',
    { schema: { tags: ['Salesforce'], summary: 'List recent sync runs' } },
    async (req) => {
      const { limit } = z
        .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
        .parse(req.query);
      return { data: await listSyncRuns(req.user!.orgId, limit) };
    },
  );
}
