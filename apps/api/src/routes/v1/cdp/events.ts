/**
 * CDP event ingestion routes (#267).
 *
 *   POST /api/v1/cdp/events         — single event (identify/track/page)
 *   POST /api/v1/cdp/events/batch   — batched ingest (up to 500 events)
 *   GET  /api/v1/cdp/events         — read-back (contact/anonymous timeline)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ingestEvents,
  queryEvents,
  type IngestEvent,
} from '../../../services/cdp/event-ingestion.js';

const EventSchema = z.object({
  eventId: z.string().max(128).optional(),
  type: z.string().max(64).optional(),
  name: z.string().min(1).max(255),
  source: z.string().max(64).optional(),
  userId: z.string().max(255).optional(),
  anonymousId: z.string().max(128).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(32).optional(),
  deviceId: z.string().max(255).optional(),
  cookie: z.string().max(255).optional(),
  socialId: z.string().max(255).optional(),
  contactId: z.string().uuid().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.union([z.string().datetime(), z.date()]).optional(),
});

const cdpEventRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/cdp/events',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP'] },
      config: { rateLimit: { max: 1000, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const body = EventSchema.parse(req.body);
      const result = await ingestEvents(req.user!.orgId, [body as IngestEvent]);
      return reply.code(202).send({ data: result });
    },
  );

  app.post(
    '/api/v1/cdp/events/batch',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP'] },
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
      bodyLimit: 5 * 1024 * 1024, // 5 MB — batch can be large
    },
    async (req, reply) => {
      const body = z.object({ events: z.array(EventSchema).min(1).max(500) }).parse(req.body);
      const result = await ingestEvents(req.user!.orgId, body.events as IngestEvent[]);
      return reply.code(202).send({ data: result });
    },
  );

  app.get(
    '/api/v1/cdp/events',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['CDP'] },
    },
    async (req, reply) => {
      const q = z
        .object({
          contactId: z.string().uuid().optional(),
          anonymousId: z.string().max(128).optional(),
          name: z.string().max(255).optional(),
          since: z.string().datetime().optional(),
          until: z.string().datetime().optional(),
          limit: z.coerce.number().int().min(1).max(1000).optional(),
        })
        .parse(req.query);
      const rows = await queryEvents(req.user!.orgId, {
        ...q,
        since: q.since ? new Date(q.since) : undefined,
        until: q.until ? new Date(q.until) : undefined,
      });
      return reply.send({ data: rows });
    },
  );
};

export default cdpEventRoutes;
