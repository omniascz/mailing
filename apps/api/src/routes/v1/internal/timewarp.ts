/**
 * Internal time-warp scheduler — called by batch-sender before enqueuing
 * per-contact MTA jobs. Returns the absolute send timestamps per contact
 * so the worker can apply BullMQ `delay` to each MTA job.
 *
 * Mirrors the authenticated /api/v1/send-optimization/timewarp endpoint
 * but skips role checks so the worker doesn't need a user JWT. Should be
 * behind an internal network boundary or shared-secret header in production.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { computeTimewarpSchedule } from '../../../services/send-optimization/index.js';

const internalTimewarpRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/v1/internal/timewarp/schedule', {
    schema: { tags: ['Internal'] },
  }, async (req, reply) => {
    const body = z.object({
      contactIds: z.array(z.string().uuid()).max(1000),
      baseDate: z.string().datetime(),
      localHour: z.number().int().min(0).max(23),
      fallbackTimezone: z.string().default('Europe/Prague'),
    }).parse(req.body);

    const schedule = await computeTimewarpSchedule(
      body.contactIds,
      new Date(body.baseDate),
      body.localHour,
      body.fallbackTimezone,
    );

    const data: Record<string, string> = {};
    for (const [contactId, sendAt] of schedule) {
      data[contactId] = sendAt.toISOString();
    }
    return reply.send({ data });
  });
};

export default internalTimewarpRoutes;
