/**
 * Configuration set management (SES CreateConfigurationSet et al).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createConfigurationSet,
  listConfigurationSets,
  getConfigurationSet,
  updateConfigurationSet,
  deleteConfigurationSet,
} from '../../services/configuration-sets/index.js';

const eventDestinationSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.enum(['webhook', 'sns', 'sqs', 'eventbridge', 'cloudwatch']),
  enabled: z.boolean().default(true),
  matchingEventTypes: z
    .array(
      z.enum([
        'send',
        'delivery',
        'bounce',
        'complaint',
        'reject',
        'open',
        'click',
        'rendering_failure',
        'delivery_delay',
      ]),
    )
    .default([]),
  url: z.string().url().optional(),
});

const optionsSchema = z.object({
  trackingEnabled: z.boolean().optional(),
  tlsPolicy: z.enum(['optional', 'require']).optional(),
  suppressionEnabled: z.boolean().optional(),
  reputationTracking: z.boolean().optional(),
  ipPoolId: z.string().uuid().nullable().optional(),
  eventDestinations: z.array(eventDestinationSchema).optional(),
});

const configurationSetRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/api/v1/configuration-sets',
    { schema: { tags: ['Configuration Sets'] } },
    async (req) => {
      return { data: await listConfigurationSets(req.user!.orgId) };
    },
  );

  app.get(
    '/api/v1/configuration-sets/:id',
    { schema: { tags: ['Configuration Sets'] } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      return { data: await getConfigurationSet(req.user!.orgId, id) };
    },
  );

  app.post(
    '/api/v1/configuration-sets',
    {
      preHandler: [app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Configuration Sets'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(128),
          sendingEnabled: z.boolean().optional(),
          options: optionsSchema.optional(),
        })
        .parse(req.body);
      const row = await createConfigurationSet(req.user!.orgId, body);
      return reply.code(201).send({ data: row });
    },
  );

  app.patch(
    '/api/v1/configuration-sets/:id',
    {
      preHandler: [app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Configuration Sets'] },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({ sendingEnabled: z.boolean().optional(), options: optionsSchema.optional() })
        .parse(req.body);
      return { data: await updateConfigurationSet(req.user!.orgId, id, body) };
    },
  );

  app.delete(
    '/api/v1/configuration-sets/:id',
    {
      preHandler: [app.requireRole('editor', 'admin', 'owner')],
      schema: { tags: ['Configuration Sets'] },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await deleteConfigurationSet(req.user!.orgId, id);
      return reply.code(204).send();
    },
  );
};

export default configurationSetRoutes;
