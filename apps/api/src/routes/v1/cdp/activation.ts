/**
 * Activation routes (#266) — reverse-ETL push of segments/traits.
 *
 *   POST   /api/v1/cdp/activation/destinations
 *   GET    /api/v1/cdp/activation/destinations
 *   DELETE /api/v1/cdp/activation/destinations/:id
 *   POST   /api/v1/cdp/activation/destinations/:id/run
 *   GET    /api/v1/cdp/activation/destinations/:id/runs
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createDestination,
  listDestinations,
  deleteDestination,
  runActivation,
  listActivationRuns,
  type DestinationKind,
  type ActivationMode,
} from '../../../services/cdp/activation.js';

const DestinationKindEnum = z.enum([
  'webhook',
  'mailchimp',
  'salesforce',
  'hubspot',
  'meta_ads',
  'google_ads',
  'tiktok_ads',
]);

const ConfigSchema = z
  .object({
    url: z.string().url().optional(),
    secret: z.string().optional(),
    listId: z.string().optional(),
    apiKey: z.string().optional(),
    audienceId: z.string().optional(),
    fieldMap: z.record(z.string(), z.string()).optional(),
    columns: z.array(z.string()).optional(),
  })
  .strict();

const activationRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/cdp/activation/destinations',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['CDP'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(255),
          kind: DestinationKindEnum,
          config: ConfigSchema,
        })
        .parse(req.body);
      const row = await createDestination(req.user!.orgId, {
        name: body.name,
        kind: body.kind as DestinationKind,
        config: body.config,
      });
      return reply.code(201).send({ data: row });
    },
  );

  app.get(
    '/api/v1/cdp/activation/destinations',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP'] },
    },
    async (req, reply) => {
      return reply.send({ data: await listDestinations(req.user!.orgId) });
    },
  );

  app.delete(
    '/api/v1/cdp/activation/destinations/:id',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['CDP'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteDestination(req.user!.orgId, id);
      return reply.send({ data: { ok: true } });
    },
  );

  app.post(
    '/api/v1/cdp/activation/destinations/:id/run',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['CDP'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          segmentId: z.string().uuid().nullable().optional(),
          mode: z.enum(['upsert', 'insert_only', 'delete_only']).optional(),
          limit: z.number().int().min(1).max(100000).optional(),
        })
        .parse(req.body ?? {});
      const run = await runActivation(req.user!.orgId, id, {
        segmentId: body.segmentId ?? null,
        mode: body.mode as ActivationMode | undefined,
        limit: body.limit,
      });
      return reply.code(202).send({ data: run });
    },
  );

  app.get(
    '/api/v1/cdp/activation/destinations/:id/runs',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return reply.send({ data: await listActivationRuns(req.user!.orgId, id) });
    },
  );
};

export default activationRoutes;
