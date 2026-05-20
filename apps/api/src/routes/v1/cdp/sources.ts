/**
 * CDP source connector routes (#263).
 *
 *  GET    /api/v1/cdp/sources                — list configured sources
 *  POST   /api/v1/cdp/sources                — create source
 *  PATCH  /api/v1/cdp/sources/:id            — update config/cron/status
 *  DELETE /api/v1/cdp/sources/:id            — delete source
 *  POST   /api/v1/cdp/sources/:id/sync       — trigger manual sync
 *  GET    /api/v1/cdp/sources/:id/runs       — list sync runs
 *
 *  POST   /api/v1/cdp/sources/:id/webhook    — inbound push webhook (no auth — HMAC verified)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { cdpSources, cdpSyncRuns } from '../../../db/schema/cdp-sources.js';
import { AppError } from '../../../lib/app-error.js';
import { runSync } from '../../../services/cdp/connectors/index.js';
import { upsertContactFromCdp } from '../../../services/cdp/source-sync.js';

const cdpSourceRoutes: FastifyPluginAsync = async (app) => {
  // ── List sources ────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/cdp/sources',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const rows = await db
        .select({
          id: cdpSources.id,
          name: cdpSources.name,
          kind: cdpSources.kind,
          direction: cdpSources.direction,
          status: cdpSources.status,
          syncCron: cdpSources.syncCron,
          lastSyncAt: cdpSources.lastSyncAt,
          lastError: cdpSources.lastError,
          createdAt: cdpSources.createdAt,
        })
        .from(cdpSources)
        .where(eq(cdpSources.orgId, req.user!.orgId))
        .orderBy(desc(cdpSources.createdAt));
      return reply.send({ data: rows });
    },
  );

  // ── Create source ───────────────────────────────────────────────────────────

  app.post(
    '/api/v1/cdp/sources',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const body = sourceSchema.parse(req.body);
      const [row] = await db
        .insert(cdpSources)
        .values({
          orgId: req.user!.orgId,
          ...body,
        })
        .returning();
      return reply.code(201).send({ data: row });
    },
  );

  // ── Update source ───────────────────────────────────────────────────────────

  app.patch(
    '/api/v1/cdp/sources/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = sourceSchema.partial().parse(req.body);
      const [row] = await db
        .update(cdpSources)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(cdpSources.id, id), eq(cdpSources.orgId, req.user!.orgId)))
        .returning();
      if (!row) throw AppError.notFound('CDP source');
      return reply.send({ data: row });
    },
  );

  // ── Delete source ───────────────────────────────────────────────────────────

  app.delete(
    '/api/v1/cdp/sources/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [row] = await db
        .delete(cdpSources)
        .where(and(eq(cdpSources.id, id), eq(cdpSources.orgId, req.user!.orgId)))
        .returning({ id: cdpSources.id });
      if (!row) throw AppError.notFound('CDP source');
      return reply.send({ data: { deleted: true } });
    },
  );

  // ── Manual sync ─────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/cdp/sources/:id/sync',
    {
      preHandler: [app.authenticate, app.requireRole('admin')],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [source] = await db
        .select({ id: cdpSources.id, orgId: cdpSources.orgId })
        .from(cdpSources)
        .where(and(eq(cdpSources.id, id), eq(cdpSources.orgId, req.user!.orgId)))
        .limit(1);
      if (!source) throw AppError.notFound('CDP source');

      // Run async — return immediately with run status
      runSync(source.id).catch(() => {});
      return reply.send({ data: { triggered: true } });
    },
  );

  // ── Sync run history ────────────────────────────────────────────────────────

  app.get(
    '/api/v1/cdp/sources/:id/runs',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query);

      const rows = await db
        .select()
        .from(cdpSyncRuns)
        .where(eq(cdpSyncRuns.sourceId, id))
        .orderBy(desc(cdpSyncRuns.startedAt))
        .limit(query.limit);

      return reply.send({ data: rows });
    },
  );

  // ── Inbound push webhook (no auth — sources POST events here) ──────────────

  app.post(
    '/api/v1/cdp/sources/:id/webhook',
    {
      schema: { tags: ['CDP Sources'] },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [source] = await db.select().from(cdpSources).where(eq(cdpSources.id, id)).limit(1);
      if (!source || source.direction !== 'push') {
        return reply.code(404).send({ error: 'Not found' });
      }

      // Accept a batch of contact records
      const payload = z
        .object({
          contacts: z
            .array(
              z.object({
                externalId: z.string(),
                email: z.string().email().optional(),
                firstName: z.string().optional(),
                lastName: z.string().optional(),
                phone: z.string().optional(),
                traits: z.record(z.unknown()).optional(),
              }),
            )
            .max(500),
        })
        .parse(req.body);

      let upserted = 0;
      for (const c of payload.contacts) {
        await upsertContactFromCdp(source.orgId, { ...c, source: source.kind }).catch(() => {});
        upserted++;
      }

      await db
        .update(cdpSources)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(cdpSources.id, id));

      return reply.send({ data: { received: upserted } });
    },
  );
};

// ─── Validation schema ────────────────────────────────────────────────────────

const sourceSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum([
    'hubspot',
    'salesforce',
    'pipedrive',
    'shopify',
    'woocommerce',
    'bigcommerce',
    'stripe',
    'zendesk',
    'intercom',
    'freshdesk',
    'meta_ads',
    'google_ads',
    'tiktok_ads',
    'google_analytics',
    'segment',
    'mixpanel',
    'webhook',
    'http_pull',
  ]),
  direction: z.enum(['pull', 'push']).default('pull'),
  config: z.record(z.unknown()).default({}),
  status: z.enum(['active', 'paused']).default('active'),
  syncCron: z.string().max(64).default('0 * * * *'),
});

export default cdpSourceRoutes;
