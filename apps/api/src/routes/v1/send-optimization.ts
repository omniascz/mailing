import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  bestHourForContact,
  bestDayForOrg,
  computeTimewarpSchedule,
  recordOpen,
  backfillContactTimezones,
} from '../../services/send-optimization/index.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const sendOptimizationRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/api/v1/send-optimization/record-open',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Send Optimization'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          contactId: z.string().uuid(),
          at: z.string().datetime().optional(),
        })
        .parse(req.body);
      await recordOpen(body.contactId, req.user!.orgId, body.at ? new Date(body.at) : undefined);
      return reply.send({ ok: true });
    },
  );

  app.get(
    '/api/v1/send-optimization/best-hour/:contactId',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Send Optimization'] },
    },
    async (req, reply) => {
      const { contactId } = z.object({ contactId: z.string().uuid() }).parse(req.params);
      const hour = await bestHourForContact(req.user!.orgId, contactId);
      return reply.send({ data: { hour, label: `${String(hour).padStart(2, '0')}:00` } });
    },
  );

  app.get(
    '/api/v1/send-optimization/best-day',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Send Optimization'] },
    },
    async (req, reply) => {
      const { day, confidence } = await bestDayForOrg(req.user!.orgId);
      return reply.send({ data: { day, label: DAYS[day], confidence } });
    },
  );

  app.post(
    '/api/v1/send-optimization/timewarp',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Send Optimization'] },
    },
    async (req, reply) => {
      const body = z
        .object({
          contactIds: z.array(z.string().uuid()).max(1000),
          baseDate: z.string().datetime(),
          localHour: z.number().int().min(0).max(23),
          fallbackTimezone: z.string().default('UTC'),
        })
        .parse(req.body);
      const schedule = await computeTimewarpSchedule(
        body.contactIds,
        new Date(body.baseDate),
        body.localHour,
        body.fallbackTimezone,
      );
      const data = Array.from(schedule.entries()).map(([contactId, sendAt]) => ({
        contactId,
        sendAt: sendAt.toISOString(),
      }));
      return reply.send({ data });
    },
  );

  app.post(
    '/api/v1/send-optimization/backfill-timezones',
    {
      preHandler: [app.authenticate, app.requireRole('admin', 'owner')],
      schema: { tags: ['Send Optimization'] },
    },
    async (req, reply) => {
      const updated = await backfillContactTimezones(req.user!.orgId);
      return reply.send({ data: { updated } });
    },
  );
};

export default sendOptimizationRoutes;
