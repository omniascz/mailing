/**
 * Internal ticketing cron endpoints (secret-gated), driven by the workers
 * scheduler: day-of (per minute), fill-the-house (daily), discover (weekly).
 */
/**
 * Auth for every route in this file is the internal-auth plugin's onRequest
 * hook: it covers each /api/v1/internal/* path and compares x-internal-secret
 * against env.INTERNAL_API_SECRET in constant time.
 *
 * These handlers used to repeat that check by hand against
 * the legacy `INTERNAL_SECRET` env name — which the API neither validates nor any
 * deployment sets. Two gates that disagree are worse than one, so the
 * duplicates are gone rather than corrected.
 */

import type { FastifyInstance } from 'fastify';
import {
  runDayOfTick,
  runFillTheHouseTick,
  runDiscoverTick,
} from '../../../services/ticketing/cron.js';

export default async function internalTicketingCronRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/internal/ticketing/day-of/tick',
    { schema: { tags: ['Internal'] } },
    async (_req, reply) => {
      return reply.send({ data: await runDayOfTick() });
    },
  );

  app.post(
    '/api/v1/internal/ticketing/fill-the-house/tick',
    { schema: { tags: ['Internal'] } },
    async (_req, reply) => {
      return reply.send({ data: await runFillTheHouseTick() });
    },
  );

  app.post(
    '/api/v1/internal/ticketing/discover/tick',
    { schema: { tags: ['Internal'] } },
    async (_req, reply) => {
      return reply.send({ data: await runDiscoverTick() });
    },
  );
}
