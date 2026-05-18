/**
 * Meetings / booking routes (#256, #257, #261).
 *
 * Public (no auth):
 *   GET  /meetings/:pageSlug                    — booking page info + event types
 *   GET  /meetings/:pageSlug/:eventSlug/slots   — available slots
 *   POST /meetings/:pageSlug/:eventSlug/book    — create booking
 *
 * Authenticated (org member):
 *   GET    /api/v1/meetings/event-types         — list event types
 *   POST   /api/v1/meetings/event-types         — create event type
 *   PATCH  /api/v1/meetings/event-types/:id     — update event type
 *   DELETE /api/v1/meetings/event-types/:id     — delete event type
 *   GET    /api/v1/meetings/bookings            — list bookings
 *   PATCH  /api/v1/meetings/bookings/:id/cancel — cancel booking
 *   PATCH  /api/v1/meetings/bookings/:id/reschedule — reschedule
 *   GET    /api/v1/meetings/availability        — get/set weekly availability
 *   PUT    /api/v1/meetings/availability        — upsert weekly availability
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventTypes, bookingPages, bookingAvailability } from '../../db/schema/booking-pages.js';
import { bookings } from '../../db/schema/calendar.js';
import { AppError } from '../../lib/app-error.js';
import {
  getAvailableSlots, createBooking, cancelBooking, rescheduleBooking,
} from '../../services/meetings/index.js';

const meetingRoutes: FastifyPluginAsync = async (app) => {

  // ── Public: booking page ────────────────────────────────────────────────────

  app.get('/meetings/:pageSlug', {
    schema: { tags: ['Meetings (Public)'] },
  }, async (req, reply) => {
    const { pageSlug } = req.params as { pageSlug: string };
    const [page] = await db.select().from(bookingPages)
      .where(eq(bookingPages.slug, pageSlug)).limit(1);
    if (!page || !page.isActive) throw AppError.notFound('Booking page');

    const types = await db.select().from(eventTypes)
      .where(and(
        eq(eventTypes.ownerUserId, page.ownerUserId),
        eq(eventTypes.isActive, true),
      ));

    return reply.send({ data: { page, eventTypes: types } });
  });

  // ── Public: available slots ─────────────────────────────────────────────────

  app.get('/meetings/:pageSlug/:eventSlug/slots', {
    schema: { tags: ['Meetings (Public)'] },
  }, async (req, reply) => {
    const { pageSlug, eventSlug } = req.params as { pageSlug: string; eventSlug: string };
    const query = z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      timezone: z.string().optional(),
    }).parse(req.query);

    const [page] = await db.select().from(bookingPages)
      .where(eq(bookingPages.slug, pageSlug)).limit(1);
    if (!page || !page.isActive) throw AppError.notFound('Booking page');

    const [et] = await db.select().from(eventTypes)
      .where(and(
        eq(eventTypes.ownerUserId, page.ownerUserId),
        eq(eventTypes.slug, eventSlug),
        eq(eventTypes.isActive, true),
      )).limit(1);
    if (!et) throw AppError.notFound('Event type');

    const now = new Date();
    const fromDate = query.from ? new Date(query.from) : now;
    const toDate = query.to
      ? new Date(query.to)
      : new Date(now.getTime() + et.bookingWindowDays * 24 * 60 * 60 * 1000);
    const timezone = query.timezone ?? et.timezone;

    const slots = await getAvailableSlots(et.id, fromDate, toDate, timezone);
    return reply.send({ data: slots });
  });

  // ── Public: book a slot ─────────────────────────────────────────────────────

  app.post('/meetings/:pageSlug/:eventSlug/book', {
    schema: { tags: ['Meetings (Public)'] },
  }, async (req, reply) => {
    const { pageSlug, eventSlug } = req.params as { pageSlug: string; eventSlug: string };
    const body = z.object({
      startAt: z.string().datetime(),
      inviteeEmail: z.string().email(),
      inviteeName: z.string().max(255).optional(),
      timezone: z.string().max(64).optional(),
      answers: z.record(z.unknown()).optional(),
    }).parse(req.body);

    const [page] = await db.select().from(bookingPages)
      .where(eq(bookingPages.slug, pageSlug)).limit(1);
    if (!page || !page.isActive) throw AppError.notFound('Booking page');

    const [et] = await db.select().from(eventTypes)
      .where(and(
        eq(eventTypes.ownerUserId, page.ownerUserId),
        eq(eventTypes.slug, eventSlug),
        eq(eventTypes.isActive, true),
      )).limit(1);
    if (!et) throw AppError.notFound('Event type');

    const booking = await createBooking(page.orgId, {
      eventTypeId: et.id,
      startAt: new Date(body.startAt),
      inviteeEmail: body.inviteeEmail,
      inviteeName: body.inviteeName,
      timezone: body.timezone,
      answers: body.answers,
    });

    return reply.code(201).send({ data: booking });
  });

  // ── Authenticated: event types CRUD ────────────────────────────────────────

  app.get('/api/v1/meetings/event-types', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const rows = await db.select().from(eventTypes)
      .where(eq(eventTypes.orgId, req.user!.orgId))
      .orderBy(desc(eventTypes.createdAt));
    return reply.send({ data: rows });
  });

  app.post('/api/v1/meetings/event-types', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const body = eventTypeSchema.parse(req.body);
    const [row] = await db.insert(eventTypes).values({
      ...body,
      orgId: req.user!.orgId,
      ownerUserId: req.user!.userId,
    }).returning();
    return reply.code(201).send({ data: row });
  });

  app.patch('/api/v1/meetings/event-types/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = eventTypeSchema.partial().parse(req.body);
    const [row] = await db.update(eventTypes)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(eventTypes.id, id), eq(eventTypes.orgId, req.user!.orgId)))
      .returning();
    if (!row) throw AppError.notFound('Event type');
    return reply.send({ data: row });
  });

  app.delete('/api/v1/meetings/event-types/:id', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db.update(eventTypes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(eventTypes.id, id), eq(eventTypes.orgId, req.user!.orgId)))
      .returning();
    if (!row) throw AppError.notFound('Event type');
    return reply.send({ data: { deleted: true } });
  });

  // ── Authenticated: bookings ─────────────────────────────────────────────────

  app.get('/api/v1/meetings/bookings', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const query = z.object({
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);

    const rows = await db.select().from(bookings)
      .where(and(
        eq(bookings.orgId, req.user!.orgId),
        query.status ? eq(bookings.status, query.status) : undefined,
      ))
      .orderBy(desc(bookings.startAt))
      .limit(query.limit);

    return reply.send({ data: rows });
  });

  app.patch('/api/v1/meetings/bookings/:id/cancel', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await cancelBooking(req.user!.orgId, id);
    return reply.send({ data: { canceled: true } });
  });

  app.patch('/api/v1/meetings/bookings/:id/reschedule', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { newStartAt } = z.object({ newStartAt: z.string().datetime() }).parse(req.body);
    await rescheduleBooking(req.user!.orgId, id, new Date(newStartAt));
    return reply.send({ data: { rescheduled: true } });
  });

  // ── Authenticated: availability ─────────────────────────────────────────────

  app.get('/api/v1/meetings/availability', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const [row] = await db.select().from(bookingAvailability)
      .where(and(
        eq(bookingAvailability.orgId, req.user!.orgId),
        eq(bookingAvailability.userId, req.user!.userId),
      )).limit(1);
    return reply.send({ data: row ?? null });
  });

  app.put('/api/v1/meetings/availability', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const body = z.object({
      schedule: z.array(z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startHour: z.number().int().min(0).max(23),
        startMin: z.number().int().min(0).max(59),
        endHour: z.number().int().min(0).max(23),
        endMin: z.number().int().min(0).max(59),
      })),
      timezone: z.string().max(64).default('UTC'),
      dateOverrides: z.array(z.object({
        date: z.string(),
        unavailable: z.boolean().optional(),
        startHour: z.number().int().optional(),
        startMin: z.number().int().optional(),
        endHour: z.number().int().optional(),
        endMin: z.number().int().optional(),
      })).default([]),
    }).parse(req.body);

    const [row] = await db.insert(bookingAvailability).values({
      orgId: req.user!.orgId,
      userId: req.user!.userId,
      ...body,
    })
      .onConflictDoUpdate({
        target: [bookingAvailability.orgId, bookingAvailability.userId],
        set: { ...body, updatedAt: new Date() },
      })
      .returning();

    return reply.send({ data: row });
  });

  // ── Authenticated: booking pages CRUD ──────────────────────────────────────

  app.get('/api/v1/meetings/booking-pages', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const rows = await db.select().from(bookingPages)
      .where(eq(bookingPages.orgId, req.user!.orgId));
    return reply.send({ data: rows });
  });

  app.post('/api/v1/meetings/booking-pages', {
    preHandler: [app.authenticate],
    schema: { tags: ['Meetings'] },
  }, async (req, reply) => {
    const body = z.object({
      slug: z.string().min(2).max(128).regex(/^[a-z0-9-]+$/),
      displayName: z.string().max(255),
      bio: z.string().max(2000).optional(),
      avatarUrl: z.string().url().optional(),
      timezone: z.string().max(64).default('UTC'),
    }).parse(req.body);

    const [row] = await db.insert(bookingPages).values({
      orgId: req.user!.orgId,
      ownerUserId: req.user!.userId,
      ...body,
    }).returning();
    return reply.code(201).send({ data: row });
  });
};

// ─── Validation schema ────────────────────────────────────────────────────────

const eventTypeSchema = z.object({
  slug: z.string().min(2).max(128).regex(/^[a-z0-9-]+$/),
  name: z.string().max(255),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(5).max(480).default(30),
  bufferBeforeMinutes: z.number().int().min(0).max(120).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(120).default(0),
  minNoticeMinutes: z.number().int().min(0).default(60),
  maxPerDay: z.number().int().min(0).default(0),
  bookingWindowDays: z.number().int().min(1).max(365).default(60),
  locationType: z.enum(['physical', 'zoom', 'google_meet', 'teams', 'custom']).default('google_meet'),
  locationValue: z.string().max(512).optional(),
  timezone: z.string().max(64).default('UTC'),
  schedulingType: z.enum(['single', 'round-robin', 'collective']).default('single'),
  teamMemberIds: z.array(z.string().uuid()).default([]),
  color: z.string().max(16).optional(),
  isActive: z.boolean().default(true),
});

export default meetingRoutes;
