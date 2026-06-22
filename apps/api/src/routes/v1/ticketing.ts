/**
 * Ticketing ingestion API — the endpoint a ticketing app (Tixly) calls to sync
 * contacts/events and emit domain events. ForgeMsg does the marketing on top.
 *
 *   POST /api/v1/ticketing/events        — one event
 *   POST /api/v1/ticketing/events/batch  — up to 500 events
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ingestTicketingEvent, type TicketingEvent } from '../../services/ticketing/ingest.js';

const contactSchema = z.object({
  email: z.string().email(),
  phone: z.string().max(32).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  city: z.string().max(120).optional(),
  locale: z.string().max(8).optional(),
});

const eventSchema = z.object({
  externalId: z.string().min(1).max(128),
  title: z.string().max(500).optional(),
  category: z.string().max(80).optional(),
  subcategory: z.string().max(80).optional(),
  venueName: z.string().max(255).optional(),
  venueCity: z.string().max(120).optional(),
  currency: z.string().length(3).optional(),
  startsAt: z.string().datetime().optional(),
  status: z.string().max(32).optional(),
  unsoldSeats: z.number().int().min(0).optional(),
  unsoldByTier: z.record(z.number().int().min(0)).optional(),
  tags: z.array(z.string().max(60)).max(50).optional(),
});

const orderSchema = z.object({
  orderId: z.string().max(128).optional(),
  amount: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  seats: z.number().int().min(1).optional(),
});

const eventTypeEnum = z.enum([
  'contact_sync',
  'order_paid',
  'order_refunded',
  'event_attended',
  'cart_abandoned',
  'event_upsert',
  'event_changed',
  'subscription_past_due',
  'waitlist_freed',
  'lottery_won',
]);

const ticketingEventSchema = z.object({
  type: eventTypeEnum,
  contact: contactSchema.optional(),
  event: eventSchema.optional(),
  order: orderSchema.optional(),
  occurredAt: z.string().datetime().optional(),
  payload: z.record(z.unknown()).optional(),
});

export default async function ticketingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post(
    '/api/v1/ticketing/events',
    { schema: { tags: ['Ticketing'], summary: 'Ingest one ticketing domain event' } },
    async (req, reply) => {
      const evt = ticketingEventSchema.parse(req.body) as TicketingEvent;
      const result = await ingestTicketingEvent(req.user!.orgId, evt);
      return reply.code(202).send({ data: result });
    },
  );

  app.post(
    '/api/v1/ticketing/events/batch',
    { schema: { tags: ['Ticketing'], summary: 'Ingest a batch of ticketing events' } },
    async (req, reply) => {
      const body = z.object({ events: z.array(ticketingEventSchema).min(1).max(500) }).parse(req.body);
      const results = [];
      let ok = 0;
      for (const e of body.events) {
        try {
          results.push(await ingestTicketingEvent(req.user!.orgId, e as TicketingEvent));
          ok++;
        } catch {
          results.push(null);
        }
      }
      return reply.code(202).send({ data: { total: body.events.length, ok, results } });
    },
  );
}
