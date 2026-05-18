/**
 * RCS messaging — Rich Communication Services.
 * Stores outbound RCS payloads (text, carousel, suggested replies) and dispatches
 * them via a configurable provider (Sinch, Vonage, Twilio Messaging Services).
 *
 * The actual provider HTTP call is delegated to the workers package; this service
 * just persists the queued message and exposes status updates from delivery webhooks.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  rcsMessages,
  type RcsMessage, type RcsPayload, type RcsCarouselCard,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export type RcsMessageType = 'text' | 'carousel' | 'rich_card' | 'media';

export async function queueRcs(orgId: string, input: {
  phone: string; contactId?: string; messageType: RcsMessageType; payload: RcsPayload;
  provider?: string;
}): Promise<RcsMessage> {
  if (input.messageType === 'carousel' && (!input.payload.carousel || input.payload.carousel.length === 0)) {
    throw AppError.badRequest('Carousel requires at least one card');
  }
  const [row] = await db.insert(rcsMessages).values({
    orgId, phone: input.phone,
    contactId: input.contactId ?? null,
    messageType: input.messageType,
    payload: input.payload,
    provider: input.provider ?? null,
  }).returning();
  return row!;
}

export async function listForContact(orgId: string, contactId: string, limit = 50): Promise<RcsMessage[]> {
  return db.select().from(rcsMessages)
    .where(and(eq(rcsMessages.orgId, orgId), eq(rcsMessages.contactId, contactId)))
    .orderBy(desc(rcsMessages.createdAt))
    .limit(limit);
}

export async function updateStatus(messageId: string, status: 'sent' | 'delivered' | 'failed', meta?: {
  providerId?: string; error?: string;
}): Promise<void> {
  const patch: Partial<RcsMessage> = { status };
  if (status === 'sent') patch.sentAt = new Date();
  if (status === 'delivered') patch.deliveredAt = new Date();
  if (meta?.providerId) patch.providerId = meta.providerId;
  if (meta?.error) patch.error = meta.error;
  await db.update(rcsMessages).set(patch).where(eq(rcsMessages.id, messageId));
}

/** Helper for callers that want to build a carousel inline. */
export function buildCarousel(cards: RcsCarouselCard[]): RcsPayload {
  return { carousel: cards };
}
