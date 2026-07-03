/**
 * Email event → webhook bridge. Every email lifecycle event (delivered, opened,
 * clicked, bounced, complained, unsubscribed, plus the P2 additions) is fanned
 * out to the org's subscribed webhooks via dispatchEvent — the piece that was
 * missing (dispatchEvent existed + was subscribable but never fired for email).
 *
 * Fire-and-forget: webhook delivery must never block or fail the send/tracking
 * path, so callers do not await the returned promise's errors.
 */

import { dispatchEvent } from './index.js';
import type { WebhookEvent } from '../../db/schema/webhooks.js';

export type EmailEventKind =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'unsubscribed'
  | 'rejected'
  | 'rendering_failed'
  | 'delivery_delayed'
  | 'group_unsubscribe'
  | 'group_resubscribe';

const KIND_TO_EVENT: Record<EmailEventKind, WebhookEvent> = {
  sent: 'email.sent',
  delivered: 'email.delivered',
  opened: 'email.opened',
  clicked: 'email.clicked',
  bounced: 'email.bounced',
  complained: 'email.complained',
  unsubscribed: 'email.unsubscribed',
  rejected: 'email.rejected',
  rendering_failed: 'email.rendering_failed',
  delivery_delayed: 'email.delivery_delayed',
  group_unsubscribe: 'email.group_unsubscribe',
  group_resubscribe: 'email.group_resubscribe',
};

export interface EmailEventPayload {
  messageId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

/** Emit an email lifecycle event to the org's webhooks (non-blocking). */
export function emitEmailEvent(
  orgId: string,
  kind: EmailEventKind,
  payload: EmailEventPayload,
): void {
  const event = KIND_TO_EVENT[kind];
  void dispatchEvent(orgId, event, payload).catch(() => {});
}
