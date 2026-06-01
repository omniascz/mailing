/**
 * Resend-compatible API Keys API.
 *
 *   GET    /api/v1/api-keys/resend  list   (Resend shape)
 *   POST   /api/v1/api-keys/resend  create (Resend shape)
 *   DELETE /api/v1/api-keys/resend/:id    revoke
 *
 * Mounted under `/api-keys/resend` (instead of the bare `/api-keys`
 * Resend uses) to avoid colliding with the existing camelCase API.
 *
 * The MailForge dashboard keeps its richer key model; this surface is
 * solely for Resend SDK drop-in compatibility.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../../../services/webhooks/index.js';

function apiKeyShape(k: {
  id: string;
  name: string;
  keyPrefix?: string;
  createdAt: Date;
}) {
  return {
    object: 'api_key' as const,
    id: k.id,
    name: k.name,
    created_at: k.createdAt.toISOString(),
    token: k.keyPrefix ? `${k.keyPrefix}…` : undefined,
  };
}

const apiKeysResendRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/api/v1/api-keys/resend',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'List API keys (Resend shape)' },
    },
    async (req, reply) => {
      const rows = await listApiKeys(req.user!.orgId);
      return reply.send({
        data: rows.map((r) =>
          apiKeyShape({
            id: r.id,
            name: r.name,
            keyPrefix: r.keyPrefix ?? undefined,
            createdAt: r.createdAt,
          }),
        ),
      });
    },
  );

  app.post(
    '/api/v1/api-keys/resend',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Create an API key (Resend shape)' },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          // Resend supports `permission: full_access | sending_access` — we
          // map to scopes accordingly.
          permission: z.enum(['full_access', 'sending_access']).optional(),
          // Test mode keys never queue real sends. Defaults to live.
          mode: z.enum(['live', 'test']).optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        return reply
          .code(422)
          .send({ statusCode: 422, name: 'validation_error', message: 'name is required' });
      }
      const scopes =
        body.data.permission === 'sending_access' ? ['emails:send'] : ['*'];
      const { apiKey, rawKey } = await createApiKey(
        req.user!.orgId,
        req.user!.userId,
        body.data.name,
        scopes,
        undefined,
        body.data.mode ?? 'live',
      );
      return reply.code(200).send({
        ...apiKeyShape({
          id: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          createdAt: apiKey.createdAt,
        }),
        // Resend returns the raw token exactly once at create time.
        token: rawKey,
      });
    },
  );

  app.delete(
    '/api/v1/api-keys/resend/:id',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Resend-compatible'], summary: 'Revoke an API key' },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await revokeApiKey(id, req.user!.orgId).catch(() => null);
      return reply.send({ object: 'api_key', id, deleted: true });
    },
  );
};

export default apiKeysResendRoutes;
