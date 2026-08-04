/**
 * Internal ticketing cron endpoints (secret-gated), driven by the workers
 * scheduler: day-of (per minute), fill-the-house (daily), discover (weekly).
 */
import type { FastifyInstance } from 'fastify';
import {
  runDayOfTick,
  runFillTheHouseTick,
  runDiscoverTick,
} from '../../../services/ticketing/cron.js';

function ok(req: { headers: Record<string, unknown> }): boolean {
  return (
    !process.env.INTERNAL_SECRET || req.headers['x-internal-secret'] === process.env.INTERNAL_SECRET
  );
}

export default async function internalTicketingCronRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/internal/ticketing/day-of/tick',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      if (!ok(req)) return reply.status(401).send();
      return reply.send({ data: await runDayOfTick() });
    },
  );

  app.post(
    '/api/v1/internal/ticketing/fill-the-house/tick',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      if (!ok(req)) return reply.status(401).send();
      return reply.send({ data: await runFillTheHouseTick() });
    },
  );

  app.post(
    '/api/v1/internal/ticketing/discover/tick',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      if (!ok(req)) return reply.status(401).send();
      return reply.send({ data: await runDiscoverTick() });
    },
  );
}
