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
import { handleBounce } from '../../../services/campaigns/channel-fallback.js';

const bodySchema = z.object({
  type: z.enum(['send', 'deliver', 'bounce', 'fail']),
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

      // Map the worker's wire type to a valid email_event_type enum value.
      // 'fail' has no enum member — record it as a soft bounce so it is not lost.
      const eventType: 'send' | 'deliver' | 'bounce' =
        body.type === 'send'
          ? 'send'
          : body.type === 'deliver'
            ? 'deliver'
            : 'bounce';

      const bounceType =
        body.type === 'bounce' || body.type === 'fail'
          ? (meta.bounceType as 'hard' | 'soft' | 'block' | undefined) ?? 'soft'
          : undefined;

      await db.insert(emailEvents).values({
        orgId: body.orgId,
        campaignId: body.campaignId,
        contactId: body.contactId,
        messageId: body.messageId,
        eventType,
        bounceType,
        stream: (meta.stream as 'broadcast' | 'transactional' | 'triggered' | undefined) ?? 'broadcast',
        abVariantId: meta.abVariantId as string | undefined,
        metadata: meta,
      });

      // Fire the matching webhook (delivered / bounced / sent) — the previously
      // dark email→webhook path.
      const { emitEmailEvent } = await import('../../../services/webhooks/email-events.js');
      const wePayload = {
        messageId: body.messageId,
        contactId: body.contactId,
        campaignId: body.campaignId,
      };
      if (eventType === 'deliver') emitEmailEvent(body.orgId, 'delivered', wePayload);
      else if (eventType === 'bounce') {
        // SendGrid semantics: a soft (transient) failure is a *deferral* that
        // will be retried — emit delivery_delayed, not bounced. Permanent
        // hard/block failures emit bounced.
        if (bounceType === 'soft') emitEmailEvent(body.orgId, 'delivery_delayed', wePayload);
        else emitEmailEvent(body.orgId, 'bounced', { ...wePayload, bounceType });
      } else if (eventType === 'send') emitEmailEvent(body.orgId, 'sent', wePayload);

      // Auto channel fallback: a hard/soft bounce on email can trigger a
      // configured fallback send (SMS/WhatsApp/push). Best-effort, non-blocking.
      if (eventType === 'bounce' && (bounceType === 'hard' || bounceType === 'soft')) {
        handleBounce(body.orgId, body.contactId, bounceType).catch(() => {});
        // Real-time reputation auto-pause (previously route-only, never triggered).
        const { onBounceComplaintSignal } = await import(
          '../../../services/abuse-detection/auto-pause.js'
        );
        onBounceComplaintSignal(body.orgId, 'bounce').catch(() => {});
      }

      return reply.code(201).send({ ok: true });
    },
  );
}
