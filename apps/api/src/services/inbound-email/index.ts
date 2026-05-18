/**
 * Inbound email processing — accepts parsed email webhook payloads from an
 * MX/ingest provider (AWS SES, SendGrid Inbound Parse, Postmark), persists
 * them, matches to a contact by From address, and fires an
 * `email_reply_received` workflow event.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { inboundEmails, contacts, type InboundEmail } from '../../db/schema/index.js';
import { onApiEvent } from '../workflows/triggers.js';
import { openTicket, appendMessage } from '../helpdesk/index.js';
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

const DEFAULT_RULES: DispatchRule[] = [
  { matchRecipient: /^(support|help|hello|contact)\b/i, target: 'helpdesk' },
];

function matchRule(to: string, rules: DispatchRule[] = DEFAULT_RULES): DispatchRule | null {
  const local = to.split('@')[0] ?? '';
  for (const rule of rules) if (rule.matchRecipient.test(local)) return rule;
  return null;
}

function normalizeEmail(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1]! : addr).trim().toLowerCase();
}

export async function receiveInbound(orgId: string, payload: InboundPayload): Promise<InboundEmail> {
  const fromEmail = normalizeEmail(payload.from);

  const [contact] = await db.select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.email, fromEmail)))
    .limit(1);

  const [row] = await db.insert(inboundEmails).values({
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
  }).returning();

  const rule = matchRule(normalizeEmail(payload.to));

  if (rule?.target === 'helpdesk') {
    const subject = payload.subject?.trim() || '(no subject)';
    const ticket = await openTicket(orgId, {
      subject: rule.ticketSubjectPrefix ? `${rule.ticketSubjectPrefix} ${subject}` : subject,
      contactId: contact?.id,
      channel: 'email',
      body: payload.textBody || payload.htmlBody || '',
    });
    if (contact) {
      await onApiEvent(orgId, contact.id, 'helpdesk_ticket_opened', {
        ticketId: ticket.id,
        subject: ticket.subject,
      });
    }
    await db.update(inboundEmails).set({ processed: true }).where(eq(inboundEmails.id, row!.id));
    return row!;
  }

  if (contact) {
    await onApiEvent(orgId, contact.id, 'email_reply_received', {
      subject: payload.subject,
      messageId: payload.messageId,
      inReplyTo: payload.inReplyTo,
      fromAddress: fromEmail,
    });
    await db.update(inboundEmails).set({ processed: true }).where(eq(inboundEmails.id, row!.id));
  }

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

export async function listInbound(orgId: string, opts: { limit?: number; contactId?: string } = {}): Promise<InboundEmail[]> {
  const limit = Math.min(opts.limit ?? 50, 500);
  const conds = [eq(inboundEmails.orgId, orgId)];
  if (opts.contactId) conds.push(eq(inboundEmails.contactId, opts.contactId));
  return db.select().from(inboundEmails)
    .where(and(...conds))
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(limit);
}

export async function getInbound(orgId: string, id: string): Promise<InboundEmail> {
  const [row] = await db.select().from(inboundEmails)
    .where(and(eq(inboundEmails.orgId, orgId), eq(inboundEmails.id, id))).limit(1);
  if (!row) throw AppError.notFound('Inbound email');
  return row;
}
