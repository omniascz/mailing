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
import { and, eq } from 'drizzle-orm';
import { contacts, emailEvents } from '../../../db/schema/index.js';
import { handleBounce } from '../../../services/campaigns/channel-fallback.js';
import { abVariantForContact } from '../../../services/campaigns/variant-attribution.js';
import { recipientAddress } from '../../../services/transactional/send-message.js';

const bodySchema = z.object({
  type: z.enum(['send', 'deliver', 'bounce', 'deferred', 'failed']),
  orgId: z.string().uuid(),
  campaignId: z.string().uuid(),
  contactId: z.string().uuid(),
  messageId: z.string(),
  metadata: z.record(z.unknown()).optional(),
  /**
   * The campaign and contact ids are stand-ins, not rows: sendTransactionalEmail
   * puts the orgId in campaignId, and a random contactId when its caller named
   * no contact (lib/queues.ts). Inserted as they are, both hit their foreign
   * keys and every transactional delivery and bounce was refused — so none was
   * stored, and the auto-pause below never ran for one.
   */
  campaignIsPlaceholder: z.boolean().optional(),
  /**
   * The address the message went to. `send`, `deliver` and `failed` rows are
   * unique per (org, message id, recipient), and `bounce` rows per bounce type
   * as well (Z137, Z138), which is what makes a second post of the same event
   * — mta-sender run again on a stalled job — a no-op. mta-sender sends it; a
   * worker that does not (one deployed before this field) has the contact's
   * address looked up instead. `deferred` is not constrained: a message is
   * deferred once per attempt.
   */
  recipient: z.string().max(320).optional(),
});

export default async function internalEventsRoutes(app: FastifyInstance) {
  app.post('/api/v1/internal/events', { schema: { tags: ['Internal'] } }, async (req, reply) => {
    const body = bodySchema.parse(req.body);
    const meta = body.metadata ?? {};

    // The wire type is the enum value. It used to be narrowed to three, with
    // the worker's 'fail' folded into a soft bounce "so it is not lost" — which
    // put transport faults into the customer's bounce rate. 'deferred' and
    // 'failed' now carry those cases in their own right.
    const eventType = body.type;

    // Only a real bounce gets a bounce_type. A deferral or a transport failure
    // leaves it null, so `WHERE event_type = 'bounce' AND bounce_type = …`
    // cannot pick them up by accident.
    const bounceType =
      body.type === 'bounce'
        ? ((meta.bounceType as 'hard' | 'soft' | 'block' | undefined) ?? 'soft')
        : undefined;

    // Denormalise the SendGrid-parity stats dimensions onto the event:
    // category from the campaign (cached) and isp from the worker metadata.
    // A placeholder event is stored with no campaign — every campaign statistic
    // filters on campaign_id, so none of them can see it — and with the contact
    // only when the id names a contact of this org. Nothing campaign-derived
    // (category, A/B variant) applies to it.
    const placeholder = body.campaignIsPlaceholder === true;
    let contactId: string | null = body.contactId;
    if (placeholder) {
      const [c] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, body.contactId), eq(contacts.orgId, body.orgId)))
        .limit(1);
      contactId = c?.id ?? null;
    }

    const { resolveCampaignCategory } = await import('../../../services/stats/category-isp.js');
    const category = placeholder
      ? null
      : await resolveCampaignCategory(body.orgId, body.campaignId).catch(() => null);
    const isp = typeof meta.isp === 'string' ? (meta.isp as string) : null;

    // The recipient: what the worker said, else the contact's address.
    let recipient: string | null = null;
    if (body.recipient) recipient = recipientAddress(body.recipient);
    else if (contactId) {
      const [c] = await db
        .select({ email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.orgId, body.orgId)))
        .limit(1);
      recipient = c?.email ? recipientAddress(c.email) : null;
    }

    const inserted = await db
      .insert(emailEvents)
      .values({
        orgId: body.orgId,
        campaignId: placeholder ? null : body.campaignId,
        contactId,
        messageId: body.messageId,
        eventType,
        bounceType,
        stream:
          (meta.stream as 'broadcast' | 'transactional' | 'triggered' | undefined) ?? 'broadcast',
        // mta-sender puts the variant in the metadata on the success path only;
        // its three bounce branches do not. Fall back to the send row so a bounce
        // is attributable to the variant that caused it — a subject line that
        // trips more spam filters is a legitimate test outcome.
        abVariantId: placeholder
          ? null
          : ((meta.abVariantId as string | undefined) ??
            abVariantForContact(body.campaignId, body.contactId)),
        category,
        isp,
        recipient,
        metadata: meta,
      })
      // A row this delivery already has — `send`, `deliver`, `failed`, or a
      // bounce of the same type: the same job, processed again. Nothing is
      // stored, counted or announced a second time (no auto-pause signal, no
      // webhook, no channel fallback), and the worker gets the success it got
      // the first time.
      .onConflictDoNothing()
      .returning({ id: emailEvents.id });
    if (inserted.length === 0) return reply.code(201).send({ ok: true, duplicate: true });

    // Real-time reputation auto-pause, for every bounce that is stored. It
    // computes the org's rate over its stored events (auto-pause.ts), so a
    // transactional bounce counts against the same sends a campaign's does —
    // mailbox providers do not tell the two apart on our addresses.
    if (eventType === 'bounce' && (bounceType === 'hard' || bounceType === 'soft')) {
      const { onBounceComplaintSignal } =
        await import('../../../services/abuse-detection/auto-pause.js');
      onBounceComplaintSignal(body.orgId, 'bounce').catch(() => {});
    }

    // A placeholder event stops here. Its webhooks and the channel fallback
    // never ran before (the insert failed first), and starting them is a
    // customer-facing change of its own, not part of storing the event.
    if (placeholder) return reply.code(201).send({ ok: true });

    // Fire the matching webhook (delivered / bounced / sent) — the previously
    // dark email→webhook path.
    const { emitEmailEvent } = await import('../../../services/webhooks/email-events.js');
    const wePayload = {
      messageId: body.messageId,
      contactId: body.contactId,
      campaignId: body.campaignId,
    };
    if (eventType === 'deliver') emitEmailEvent(body.orgId, 'delivered', wePayload);
    else if (eventType === 'deferred') {
      // SendGrid semantics: a transient failure that will be retried is a
      // deferral, not a bounce.
      emitEmailEvent(body.orgId, 'delivery_delayed', wePayload);
    } else if (eventType === 'failed') {
      // Never delivered, never rejected. `rejected` is the closest existing
      // subscriber-facing event; the metadata says which transport fault it was.
      emitEmailEvent(body.orgId, 'rejected', wePayload);
    } else if (eventType === 'bounce') {
      // Retries are exhausted by the time a soft bounce is written, so this is
      // a real bounce now and emits `bounced` like the permanent kinds.
      emitEmailEvent(body.orgId, 'bounced', { ...wePayload, bounceType });
    } else if (eventType === 'send') emitEmailEvent(body.orgId, 'sent', wePayload);

    // Auto channel fallback: a hard/soft bounce on email can trigger a
    // configured fallback send (SMS/WhatsApp/push). Best-effort, non-blocking.
    if (eventType === 'bounce' && (bounceType === 'hard' || bounceType === 'soft')) {
      handleBounce(body.orgId, body.contactId, bounceType).catch(() => {});
    }

    return reply.code(201).send({ ok: true });
  });
}
