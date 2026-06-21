/**
 * Internal email events ingestion endpoint.
 * Called by mta-sender worker after each SMTP attempt.
 *
 *  POST /api/v1/internal/events
 *    body: { type, orgId, campaignId, contactId, messageId, metadata? }
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../../db/client.js';
import { emailEvents } from '../../../db/schema/index.js';

const bodySchema = z.object({
  type: z.enum(['send', 'bounce', 'fail']),
  orgId: z.string().uuid(),
  campaignId: z.string().uuid(),
  contactId: z.string().uuid(),
  messageId: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export default async function internalEventsRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/internal/events',
    { schema: { tags: ['Internal'] } },
    async (req, reply) => {
      const secret = req.headers['x-internal-secret'];
      if (secret !== process.env.INTERNAL_SECRET) return reply.status(401).send();

      const body = bodySchema.parse(req.body);
      const meta = body.metadata ?? {};

      const eventType =
        body.type === 'send' ? 'send' : body.type === 'bounce' ? 'bounce' : 'fail';

      const bounceType =
        body.type === 'bounce'
          ? (meta.bounceType as 'hard' | 'soft' | 'block' | undefined) ?? 'soft'
          : undefined;

      await db.insert(emailEvents).values({
        orgId: body.orgId,
        campaignId: body.campaignId,
        contactId: body.contactId,
        messageId: body.messageId,
        eventType: eventType as 'send' | 'bounce',
        bounceType,
        stream: (meta.stream as 'broadcast' | 'transactional' | 'triggered' | undefined) ?? 'broadcast',
        abVariantId: meta.abVariantId as string | undefined,
        metadata: meta,
      });

      return reply.code(201).send({ ok: true });
    },
  );
}
