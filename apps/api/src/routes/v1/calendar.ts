/**
 * Calendar sync routes (#258) — OAuth connect, sync, bookings.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  buildGoogleAuthUrl,
  buildMicrosoftAuthUrl,
  connectCalendar,
  disconnectCalendar,
  listIntegrations,
  syncIntegration,
  getBusyIntervals,
  createBooking,
  cancelBooking,
} from '../../services/meetings/calendar-sync.js';

const calendarSyncRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/calendar/oauth/:provider/authorize', {
    preHandler: [app.authenticate],
    schema: { tags: ['Calendar'] },
  }, async (req, reply) => {
    const { provider } = z.object({ provider: z.enum(['google', 'microsoft']) }).parse(req.params);
    const q = z.object({ redirectUri: z.string().url(), state: z.string().min(1) }).parse(req.query);
    const url = provider === 'google'
      ? buildGoogleAuthUrl(q.redirectUri, q.state)
      : buildMicrosoftAuthUrl(q.redirectUri, q.state);
    return reply.send({ data: { authorizeUrl: url } });
  });

  app.post('/api/v1/calendar/oauth/:provider/callback', {
    preHandler: [app.authenticate],
    schema: { tags: ['Calendar'] },
  }, async (req, reply) => {
    const { provider } = z.object({ provider: z.enum(['google', 'microsoft']) }).parse(req.params);
    const body = z.object({ code: z.string().min(1), redirectUri: z.string().url() }).parse(req.body);
    const integration = await connectCalendar({
      orgId: req.user!.orgId,
      userId: req.user!.userId,
      provider,
      code: body.code,
      redirectUri: body.redirectUri,
    });
    return reply.code(201).send({ data: integration });
  });

  app.get('/api/v1/calendar/integrations', {
    preHandler: [app.authenticate],
    schema: { tags: ['Calendar'] },
  }, async (req, reply) => {
    const q = z.object({ mine: z.coerce.boolean().optional() }).parse(req.query);
    const rows = await listIntegrations(
      req.user!.orgId,
      q.mine ? req.user!.userId : undefined,
    );
    return reply.send({ data: rows });
  });

  app.delete('/api/v1/calendar/integrations/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['Calendar'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await disconnectCalendar(req.user!.orgId, id);
    return reply.code(204).send();
  });

  app.post('/api/v1/calendar/integrations/:id/sync', {
    preHandler: [app.authenticate],
    schema: { tags: ['Calendar'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({
      daysBack: z.number().int().min(0).max(365).optional(),
      daysForward: z.number().int().min(1).max(365).optional(),
    }).parse(req.body ?? {});
    return reply.send({ data: await syncIntegration(id, body) });
  });

  app.get('/api/v1/calendar/free-busy', {
    preHandler: [app.authenticate],
    schema: { tags: ['Calendar'] },
  }, async (req, reply) => {
    const q = z.object({
      userId: z.string().uuid(),
      from: z.string().datetime(),
      to: z.string().datetime(),
    }).parse(req.query);
    return reply.send({
      data: await getBusyIntervals(q.userId, new Date(q.from), new Date(q.to)),
    });
  });

  app.post('/api/v1/calendar/bookings', {
    preHandler: [app.authenticate],
    schema: { tags: ['Calendar'] },
  }, async (req, reply) => {
    const body = z.object({
      hostUserId: z.string().uuid().optional(),
      inviteeEmail: z.string().email(),
      inviteeName: z.string().optional(),
      title: z.string().min(1).max(1024),
      description: z.string().optional(),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      timezone: z.string().optional(),
      location: z.string().optional(),
      conferencing: z.enum(['google-meet', 'teams', 'none']).optional(),
    }).parse(req.body);
    const booking = await createBooking({
      orgId: req.user!.orgId,
      hostUserId: body.hostUserId ?? req.user!.userId,
      inviteeEmail: body.inviteeEmail,
      inviteeName: body.inviteeName,
      title: body.title,
      description: body.description,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      timezone: body.timezone,
      location: body.location,
      conferencing: body.conferencing,
    });
    return reply.code(201).send({ data: booking });
  });

  app.delete('/api/v1/calendar/bookings/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['Calendar'] },
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await cancelBooking(req.user!.orgId, id);
    return reply.code(204).send();
  });
};

export default calendarSyncRoutes;
