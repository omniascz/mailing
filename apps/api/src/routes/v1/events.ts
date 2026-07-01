/**
 * Custom event tracking endpoint (task 5.3 — api_event trigger):
 *
 *  POST /api/v1/events   — track a custom event for a contact
 *  GET  /api/v1/events   — list recent events for the org
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { workflowEvents, contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { onApiEvent } from '../../services/workflows/triggers.js';

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
