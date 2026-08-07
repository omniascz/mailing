/**
 * Internal email events ingestion endpoint.
 * Called by mta-sender worker after each SMTP attempt.
 *
 *  POST /api/v1/internal/events
 *    body: { type, orgId, campaignId, contactId, messageId, metadata? }
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
import { z } from 'zod';
import { db } from '../../../db/client.js';
import { emailEvents } from '../../../db/schema/index.js';
import { handleBounce } from '../../../services/campaigns/channel-fallback.js';
import { abVariantForContact } from '../../../services/campaigns/variant-attribution.js';

const bodySchema = z.object({
  type: z.enum(['send', 'deliver', 'bounce', 'fail']),
  orgId: z.string().uuid(),
  campaignId: z.string().uuid(),
  contactId: z.string().uuid(),
  messageId: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export default async function internalEventsRoutes(app: FastifyInstance) {
  app.post('/api/v1/internal/events', { schema: { tags: ['Internal'] } }, async (req, reply) => {
    const body = bodySchema.parse(req.body);
    const meta = body.metadata ?? {};

    // Map the worker's wire type to a valid email_event_type enum value.
    // 'fail' has no enum member — record it as a soft bounce so it is not lost.
    const eventType: 'send' | 'deliver' | 'bounce' =
      body.type === 'send' ? 'send' : body.type === 'deliver' ? 'deliver' : 'bounce';

    const bounceType =
      body.type === 'bounce' || body.type === 'fail'
        ? ((meta.bounceType as 'hard' | 'soft' | 'block' | undefined) ?? 'soft')
        : undefined;

    // Denormalise the SendGrid-parity stats dimensions onto the event:
    // category from the campaign (cached) and isp from the worker metadata.
    const { resolveCampaignCategory } = await import('../../../services/stats/category-isp.js');
    const category = await resolveCampaignCategory(body.orgId, body.campaignId).catch(() => null);
    const isp = typeof meta.isp === 'string' ? (meta.isp as string) : null;

    await db.insert(emailEvents).values({
      orgId: body.orgId,
      campaignId: body.campaignId,
      contactId: body.contactId,
      messageId: body.messageId,
      eventType,
      bounceType,
      stream:
        (meta.stream as 'broadcast' | 'transactional' | 'triggered' | undefined) ?? 'broadcast',
      // mta-sender puts the variant in the metadata on the success path only;
      // its three bounce branches do not. Fall back to the send row so a bounce
      // is attributable to the variant that caused it — a subject line that
      // trips more spam filters is a legitimate test outcome.
      abVariantId:
        (meta.abVariantId as string | undefined) ??
        abVariantForContact(body.campaignId, body.contactId),
      category,
      isp,
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
      const { onBounceComplaintSignal } =
        await import('../../../services/abuse-detection/auto-pause.js');
      onBounceComplaintSignal(body.orgId, 'bounce').catch(() => {});
    }

    return reply.code(201).send({ ok: true });
  });
}
