/**
 * Inbound email processing — accepts parsed email webhook payloads from an
 * MX/ingest provider (AWS SES, SendGrid Inbound Parse, Postmark), persists
 * them, matches to a contact by From address, and fires an
 * `email_reply_received` workflow event.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  inboundEmails,
  contacts,
  suppressions,
  emailEvents,
  type InboundEmail,
} from '../../db/schema/index.js';
import { onApiEvent } from '../workflows/triggers.js';
import { openTicket, appendMessage } from '../helpdesk/index.js';
import {
  classifyBounce,
  isBounceMessage,
  extractFailedRecipient,
} from '../sending/bounce-processor.js';
import { decodeVerp } from '../sending/verp.js';
import { AppError } from '../../lib/app-error.js';

export interface InboundPayload {
  from: string;
  to: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  messageId?: string;
  inReplyTo?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; contentType: string; size: number; url?: string }>;
}

/**
 * Routing rule for incoming mail. Match the recipient address against a
 * pattern; on match, dispatch to the named handler.
 *
 * Defaults applied if no rule matches:
 *  - support@/help@/contact@         → helpdesk ticket
 *  - reply+<id>@                      → workflow `email_reply_received`
 *  - other                            → store + workflow trigger
 */
export type DispatchTarget = 'helpdesk' | 'workflow' | 'discard';

export interface DispatchRule {
  matchRecipient: RegExp;
  target: DispatchTarget;
  ticketSubjectPrefix?: string;
}

function normalizeEmail(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1]! : addr).trim().toLowerCase();
}

export async function receiveInbound(
  orgId: string,
  payload: InboundPayload,
): Promise<InboundEmail> {
  const fromEmail = normalizeEmail(payload.from);

  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.email, fromEmail)))
    .limit(1);

  const [row] = await db
    .insert(inboundEmails)
    .values({
      orgId,
      contactId: contact?.id ?? null,
      fromAddress: fromEmail,
      toAddress: normalizeEmail(payload.to),
      subject: payload.subject ?? null,
      textBody: payload.textBody ?? null,
      htmlBody: payload.htmlBody ?? null,
      messageId: payload.messageId ?? null,
      inReplyTo: payload.inReplyTo ?? null,
      headers: payload.headers ?? {},
      attachments: payload.attachments ?? [],
      processed: false,
    })
    .returning();

  // Async bounce / DSN — classify + suppress hard failures. This captures
  // out-of-band bounces (the engine only sees in-session SMTP rejects).
  if (isBounceMessage(fromEmail, payload.subject ?? undefined)) {
    const body = payload.textBody || payload.htmlBody || '';
    const cls = classifyBounce(body, body);

    // VERP: the DSN's recipient is our per-message return-path. Decode it to the
    // original Message-ID and attribute the bounce to that exact send — this
    // recovers the recipient/campaign even when the DSN body has no clear
    // Final-Recipient. Check the To address plus common relay headers.
    const hdrs = (payload.headers ?? {}) as Record<string, string>;
    const verpMsgId =
      decodeVerp(payload.to) ??
      decodeVerp(hdrs['Delivered-To'] ?? hdrs['delivered-to']) ??
      decodeVerp(hdrs['X-Original-To'] ?? hdrs['x-original-to']);

    let failed = extractFailedRecipient(body);
    if (verpMsgId) {
      const [ev] = await db
        .select({ contactId: emailEvents.contactId, campaignId: emailEvents.campaignId })
        .from(emailEvents)
        .where(and(eq(emailEvents.orgId, orgId), eq(emailEvents.messageId, verpMsgId)))
        .limit(1);
      // Record a bounce event against the original message for analytics.
      await db
        .insert(emailEvents)
        .values({
          orgId,
          campaignId: ev?.campaignId ?? null,
          contactId: ev?.contactId ?? null,
          messageId: verpMsgId,
          eventType: 'bounce',
          bounceType: cls.type === 'soft' ? 'soft' : cls.type === 'block' ? 'block' : 'hard',
          metadata: { source: 'verp', reason: cls.reason },
        })
        .catch(() => {});
      // If the DSN body didn't yield a recipient, resolve it from the matched
      // contact so suppression still targets the right address.
      if (!failed && ev?.contactId) {
        const [c] = await db
          .select({ email: contacts.email })
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, ev.contactId)))
          .limit(1);
        failed = c?.email ?? null;
      }
    }

    if (failed && (cls.autoSuppress || cls.type === 'hard')) {
      // Bucket into the correct SendGrid-parity list: invalid_email for
      // nonexistent addresses, hard_bounce for other permanent failures.
      const reason = cls.suppressionReason === 'invalid_email' ? 'invalid_email' : 'hard_bounce';
      await db
        .insert(suppressions)
        .values({ orgId, email: failed, reason })
        .onConflictDoNothing()
        .catch(() => {});
      await db
        .update(contacts)
        .set({ status: 'bounced', updatedAt: new Date() })
        .where(and(eq(contacts.orgId, orgId), eq(contacts.email, failed)))
        .catch(() => {});
    }
    await db
      .update(inboundEmails)
      .set({ processed: true })
      .where(eq(inboundEmails.id, row!.id))
      .catch(() => {});
    return row!;
  }

  // Resolve actions via the org's configurable inbound rules (Mail Manager),
  // falling back to defaults when none are configured.
  const { resolveInboundActions } = await import('../inbound-rules/index.js');
  const toEmail = normalizeEmail(payload.to);
  const actions = await resolveInboundActions(orgId, {
    to: toEmail,
    from: fromEmail,
    subject: payload.subject ?? null,
  });

  for (const action of actions) {
    if (action.type === 'drop') {
      break;
    }
    if (action.type === 'helpdesk') {
      const subject = payload.subject?.trim() || '(no subject)';
      const ticket = await openTicket(orgId, {
        subject: action.ticketSubjectPrefix ? `${action.ticketSubjectPrefix} ${subject}` : subject,
        contactId: contact?.id,
        channel: 'email',
        body: payload.textBody || payload.htmlBody || '',
      });
      if (contact) {
        await onApiEvent(orgId, contact.id, 'helpdesk_ticket_opened', {
          ticketId: ticket.id,
          subject: ticket.subject,
        }).catch(() => {});
      }
    } else if (action.type === 'workflow_event' && contact) {
      await onApiEvent(orgId, contact.id, action.eventName ?? 'email_reply_received', {
        subject: payload.subject,
        messageId: payload.messageId,
        inReplyTo: payload.inReplyTo,
        fromAddress: fromEmail,
      }).catch(() => {});
    } else if ((action.type === 'webhook' || action.type === 'store') && action.url) {
      await fetch(action.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: toEmail,
          subject: payload.subject,
          messageId: payload.messageId,
          textBody: payload.textBody,
          htmlBody: payload.htmlBody,
        }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {});
    }
  }

  await db.update(inboundEmails).set({ processed: true }).where(eq(inboundEmails.id, row!.id));
  return row!;
}

/**
 * Add a customer reply to an existing ticket — keyed by an
 * `In-Reply-To` header that matches a previously-sent ticket message id.
 * Falls back to receiveInbound() when no matching ticket exists.
 */
export async function appendReplyToTicket(
  orgId: string,
  ticketId: string,
  payload: InboundPayload,
): Promise<void> {
  await appendMessage(orgId, ticketId, {
    sender: 'customer',
    body: payload.textBody || payload.htmlBody || '',
    attachments: (payload.attachments ?? [])
      .filter((a) => a.url)
      .map((a) => ({ url: a.url!, name: a.filename })),
  });
}

export async function listInbound(
  orgId: string,
  opts: { limit?: number; contactId?: string } = {},
): Promise<InboundEmail[]> {
  const limit = Math.min(opts.limit ?? 50, 500);
  const conds = [eq(inboundEmails.orgId, orgId)];
  if (opts.contactId) conds.push(eq(inboundEmails.contactId, opts.contactId));
  return db
    .select()
    .from(inboundEmails)
    .where(and(...conds))
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(limit);
}

export async function getInbound(orgId: string, id: string): Promise<InboundEmail> {
  const [row] = await db
    .select()
    .from(inboundEmails)
    .where(and(eq(inboundEmails.orgId, orgId), eq(inboundEmails.id, id)))
    .limit(1);
  if (!row) throw AppError.notFound('Inbound email');
  return row;
}
