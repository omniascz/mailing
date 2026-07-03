/**
 * Webhook management routes (task 6.2).
 *
 *  GET    /api/v1/webhooks                    — list webhooks
 *  POST   /api/v1/webhooks                    — create webhook
 *  PUT    /api/v1/webhooks/:id                — update webhook
 *  DELETE /api/v1/webhooks/:id                — delete webhook
 *  POST   /api/v1/webhooks/:id/test           — send test delivery
 *  GET    /api/v1/webhooks/:id/deliveries     — list deliveries
 *
 *  GET    /api/v1/api-keys                    — list API keys
 *  POST   /api/v1/api-keys                    — create API key (returns rawKey once)
 *  DELETE /api/v1/api-keys/:id                — revoke API key
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { WEBHOOK_EVENTS } from '../../db/schema/webhooks.js';
import {
  createWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  listDeliveries,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../../services/webhooks/index.js';

const webhookRoutes: FastifyPluginAsync = async (app) => {
  // ── List webhooks ────────────────────────────────────────────────────────────
  app.get(
    '/api/v1/webhooks',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Webhooks'], summary: 'List webhooks' },
    },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      return reply.send({ data: await listWebhooks(orgId) });
    },
  );

  // ── Create webhook ───────────────────────────────────────────────────────────
  const createSchema = z.object({
    url: z.string().url(),
    events: z.array(z.enum(WEBHOOK_EVENTS as unknown as [string, ...string[]])).min(1),
    description: z.string().max(255).optional(),
  });

  app.post(
    '/api/v1/webhooks',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Webhooks'], summary: 'Create webhook' },
    },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      const body = createSchema.parse(req.body);
      const result = await createWebhook(orgId, body as Parameters<typeof createWebhook>[1]);
      return reply.status(201).send({ data: result });
    },
  );

  // ── Update webhook ───────────────────────────────────────────────────────────
  const updateSchema = z.object({
    url: z.string().url().optional(),
    events: z.array(z.string()).min(1).optional(),
    description: z.string().max(255).optional(),
    active: z.boolean().optional(),
  });

  app.put(
    '/api/v1/webhooks/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Webhooks'], summary: 'Update webhook' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const orgId = req.user!.orgId;
      const body = updateSchema.parse(req.body);
      return reply.send({
        data: await updateWebhook(id, orgId, body as Parameters<typeof updateWebhook>[2]),
      });
    },
  );

  // ── Delete webhook ───────────────────────────────────────────────────────────
  app.delete(
    '/api/v1/webhooks/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Webhooks'], summary: 'Delete webhook' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const orgId = req.user!.orgId;
      await deleteWebhook(id, orgId);
      return reply.status(204).send();
    },
  );

  // ── Test webhook ─────────────────────────────────────────────────────────────
  app.post(
    '/api/v1/webhooks/:id/test',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Webhooks'], summary: 'Send a test delivery' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const orgId = req.user!.orgId;
      const result = await testWebhook(id, orgId);
      return reply.send({ data: result });
    },
  );

  // ── List deliveries ──────────────────────────────────────────────────────────
  app.get(
    '/api/v1/webhooks/:id/deliveries',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Webhooks'], summary: 'List webhook deliveries' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const orgId = req.user!.orgId;
      const { limit } = req.query as { limit?: string };
      return reply.send({ data: await listDeliveries(id, orgId, limit ? Number(limit) : 50) });
    },
  );

  // ── Supported events ─────────────────────────────────────────────────────────
  app.get(
    '/api/v1/webhooks/events',
    {
      schema: { tags: ['Webhooks'], summary: 'List supported webhook event types' },
    },
    async (_req, reply) => {
      return reply.send({ data: WEBHOOK_EVENTS });
    },
  );

  // ─── API key routes ──────────────────────────────────────────────────────────

  // List API keys
  app.get(
    '/api/v1/api-keys',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['API Keys'], summary: 'List API keys (never returns the raw key)' },
    },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      return reply.send({ data: await listApiKeys(orgId) });
    },
  );

  // Catalog of assignable scopes for building least-privilege keys. The global
  // scope guard (plugins/auth) enforces these across the API surface.
  app.get(
    '/api/v1/api-keys/scopes',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['API Keys'], summary: 'List assignable API-key scopes' },
    },
    async (_req, reply) => {
      const { GATED_RESOURCES, READ_ONLY_RESOURCES } = await import(
        '../../services/auth/scope-map.js'
      );
      const scopes = new Set<string>(['*', 'emails:send', 'emails:read']);
      for (const r of GATED_RESOURCES) {
        scopes.add(`${r}:read`);
        scopes.add(`${r}:write`);
      }
      for (const r of READ_ONLY_RESOURCES) scopes.add(`${r}:read`);
      return reply.send({ data: [...scopes].sort() });
    },
  );

  // Create API key
  const apiKeySchema = z.object({
    name: z.string().min(1).max(255),
    scopes: z.array(z.string()).optional(),
    expiresAt: z.string().datetime().optional(),
    /** Mint a public (publishable) key for the browser web-sdk (`fm_pub_`). */
    isPublic: z.boolean().optional(),
  });

  app.post(
    '/api/v1/api-keys',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['API Keys'],
        summary: 'Create API key — raw key returned once, store securely',
      },
    },
    async (req, reply) => {
      const orgId = req.user!.orgId;
      const userId = req.user!.userId;
      const body = apiKeySchema.parse(req.body);
      const result = await createApiKey(
        orgId,
        userId,
        body.name,
        // Public keys default to the ingest-only scope set (browser-safe).
        body.scopes ?? (body.isPublic ? ['in_app:read', 'events:write'] : []),
        body.expiresAt ? new Date(body.expiresAt) : undefined,
        'live',
        body.isPublic ?? false,
      );
      return reply.status(201).send({ data: result });
    },
  );

  // Revoke API key
  app.delete(
    '/api/v1/api-keys/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['API Keys'], summary: 'Revoke an API key' },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const orgId = req.user!.orgId;
      await revokeApiKey(id, orgId);
      return reply.status(204).send();
    },
  );
};

export default webhookRoutes;
