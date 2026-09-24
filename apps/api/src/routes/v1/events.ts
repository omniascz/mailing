/**
 * Custom event tracking endpoint (task 5.3 — api_event trigger):
 *
 *  POST /api/v1/events            — track a custom event for a contact
 *  GET  /api/v1/events            — list recent events for the org
 *  POST /api/v1/checkout-started  — a shop page reports its own basket
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workflowEvents, contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { onApiEvent } from '../../services/workflows/triggers.js';
import { recordCheckoutStarted } from '../../services/storefront/checkout-started.js';

export default async function eventRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/events
   *
   * Track a custom event for a contact. Immediately evaluates api_event
   * workflow triggers and stores the event for audit.
   *
   * Ingest-only → authenticatePublic so the browser web-sdk can call it with a
   * public (fm_pub_) key. Still org-scoped and contact-ownership checked below.
   *
   * Body: { contact_id, event_name, properties? }
   */
  app.post(
    '/api/v1/events',
    {
      preHandler: [app.authenticatePublic],
      schema: { tags: ['Events'], summary: 'Track a custom event for workflow triggers' },
    },
    async (req) => {
      const body = z
        .object({
          contactId: z.string().uuid(),
          eventName: z.string().min(1).max(255),
          properties: z.record(z.unknown()).optional().default({}),
        })
        .parse(req.body);

      const orgId = req.user!.orgId;

      // Verify contact belongs to org
      const [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, body.contactId), eq(contacts.orgId, orgId)))
        .limit(1);

      if (!contact) throw AppError.notFound('Contact');

      // Store event
      const [event] = await db
        .insert(workflowEvents)
        .values({
          orgId,
          contactId: body.contactId,
          eventName: body.eventName,
          properties: body.properties,
          processed: false,
        })
        .returning();

      // Fire triggers immediately (non-blocking)
      onApiEvent(orgId, body.contactId, body.eventName, body.properties).catch(() => {});

      // Mark as processed (we just fired it synchronously)
      if (event) {
        db.update(workflowEvents)
          .set({ processed: true })
          .where(eq(workflowEvents.id, event.id))
          .catch(() => {});
      }

      return { data: { event, triggersEvaluated: true } };
    },
  );

  /**
   * POST /api/v1/checkout-started
   *
   * The shop's own page reporting a basket, for platforms that deliver no cart
   * webhook. Shoptet is the reason it exists: its webhook code list has no cart
   * event at all, and its abandoned-cart export carries neither a cart id nor a
   * recovery URL, so neither a webhook nor a poller can do this (probe Z75).
   * A script in the template can — Shoptet allows HTML codes to be inserted
   * from the e-shop administration, and the dataLayer exposes the basket.
   *
   * Public, because the caller is a page: `authenticatePublic` accepts the
   * publishable key, and the key carries the one fact this needs, the org.
   *
   * The address is the only identifier a page may send. The publishable key is
   * visible in the page source, so accepting a `contactId` from it would let
   * anybody enrol strangers by handle — the same rule, and the same wording, as
   * back-in-stock/subscribe.
   *
   * The rate limit is keyed on the key AND the caller's address: with one
   * publishable key per shop, a single bucket would let one abuser lock out
   * every genuine shopper.
   */
  app.post(
    '/api/v1/checkout-started',
    {
      preHandler: [app.authenticatePublic],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 hour',
          keyGenerator: (req: { headers: Record<string, unknown>; ip: string }) =>
            `checkout-started:${(req.headers['x-api-key'] as string) ?? 'anon'}:${req.ip}`,
        },
      },
      schema: { tags: ['Events'], summary: 'Public: a shop page reports an abandoned basket' },
    },
    async (req, reply) => {
      const body = z
        .object({
          email: z.string().email().max(255),
          contactId: z.string().uuid().optional(),
          cartId: z.string().min(1).max(191).optional(),
          amount: z.number().nonnegative().optional(),
          currency: z.string().length(3).optional(),
          itemCount: z.number().int().nonnegative().max(1000).optional(),
          recoveryUrl: z.string().url().max(2048).optional(),
        })
        .parse(req.body);

      if (req.user?.isPublicKey && body.contactId) {
        throw AppError.forbidden('A publishable key must identify the shopper by email');
      }

      const result = await recordCheckoutStarted(req.user!.orgId, body);
      // 202 either way, and the body says which. Answering differently for an
      // address we do not know would turn this into a way to ask whether
      // somebody shops here.
      return reply.code(202).send({ data: result });
    },
  );
  /**
   * GET /api/v1/events?contact_id=&event_name=&limit=
   * List recent custom events for the org.
   */
  app.get(
    '/api/v1/events',
    {
      preHandler: [app.authenticate], // secret-only: listing org events is not public
      schema: { tags: ['Events'], summary: 'List recent custom events' },
    },
    async (req) => {
      const query = z
        .object({
          contactId: z.string().uuid().optional(),
          eventName: z.string().max(255).optional(),
          limit: z.string().optional().default('50'),
        })
        .parse(req.query);

      const orgId = req.user!.orgId;
      const limit = Math.min(parseInt(query.limit, 10) || 50, 200);

      const conditions = [eq(workflowEvents.orgId, orgId)];
      if (query.contactId) conditions.push(eq(workflowEvents.contactId, query.contactId));
      if (query.eventName) conditions.push(eq(workflowEvents.eventName, query.eventName));

      const rows = await db
        .select()
        .from(workflowEvents)
        .where(and(...conditions))
        .orderBy(desc(workflowEvents.createdAt))
        .limit(limit);

      return { data: rows };
    },
  );
}
