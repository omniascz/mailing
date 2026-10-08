/**
 * Inbound email processing — accepts parsed email webhook payloads from an
 * MX/ingest provider (AWS SES, SendGrid Inbound Parse, Postmark), persists
 * them, matches to a contact by From address, and fires an
 * `email_reply_received` workflow event.
 */

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  inboundEmails,
  contacts,
  suppressions,
  emailEvents,
  helpdeskTickets,
  ticketMessages,
  type InboundEmail,
} from '../../db/schema/index.js';
import { onApiEvent } from '../workflows/triggers.js';
import { openTicket } from '../helpdesk/index.js';
import {
  classifyBounce,
  isBounceMessage,
  extractFailedRecipient,
} from '../sending/bounce-processor.js';
import { decodeVerp } from '@forgemsg/shared/sending/verp';
import { AppError } from '../../lib/app-error.js';
import { abVariantForContact } from '../campaigns/variant-attribution.js';

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
          abVariantId:
            ev?.campaignId && ev?.contactId
              ? abVariantForContact(ev.campaignId, ev.contactId)
              : null,
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
      // A reply goes into the ticket its headers point at — looked up only
      // among this org's email tickets, because the Message-ID domain is
      // shared by every org and says nothing about whose message it was.
      const threadTicketId = await findThreadTicket(orgId, threadReferences(payload));
      if (threadTicketId) {
        await appendReplyToTicket(orgId, threadTicketId, payload);
        continue;
      }
      const subject = payload.subject?.trim() || '(no subject)';
      const ticket = await openTicket(orgId, {
        subject: action.ticketSubjectPrefix ? `${action.ticketSubjectPrefix} ${subject}` : subject,
        contactId: contact?.id,
        channel: 'email',
        body: payload.textBody || payload.htmlBody || '',
        externalMessageId: messageIdKey(payload.messageId) ?? undefined,
        metadata: { fromAddress: fromEmail },
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
 * A Message-ID as stored in `ticket_messages.external_message_id`: without
 * the angle brackets, because the engine's MX receiver strips them and a
 * provider webhook may not. Null when there is none, or when it would not
 * fit the column — a truncated id would never match anything again.
 */
function messageIdKey(raw: string | undefined | null): string | null {
  const key = (raw ?? '').trim().replace(/^<+/, '').replace(/>+$/, '').trim();
  return key && key.length <= 253 ? key : null;
}

function header(payload: InboundPayload, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(payload.headers ?? {})) {
    if (k.toLowerCase() === want) return v;
  }
  return undefined;
}

/**
 * The ids a reply points at, most specific first: In-Reply-To (the direct
 * parent), then References newest to oldest. RFC 5322 §3.6.4 builds
 * References as the parent's References plus the parent's own id, so the
 * last entry is the parent and the first is the thread root. Walking back
 * keeps a reply threaded when its parent is a message we never stored.
 */
export function threadReferences(payload: InboundPayload): string[] {
  const raw = [
    payload.inReplyTo ?? header(payload, 'In-Reply-To'),
    ...(header(payload, 'References') ?? '').split(/[\s,]+/).reverse(),
  ];
  const ids: string[] = [];
  for (const r of raw) {
    const key = messageIdKey(r);
    if (key && !ids.includes(key)) ids.push(key);
  }
  // A forged header with thousands of ids should not become a huge IN list.
  return ids.slice(0, 50);
}

/**
 * The email ticket of THIS org that holds one of `ids`, preferring the
 * earliest id in the list. Another org's ticket is never a candidate: the
 * query is scoped by the org the inbound route resolved, so a foreign
 * In-Reply-To simply finds nothing and the caller opens a new ticket.
 */
async function findThreadTicket(orgId: string, ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  // Agent replies recorded through the inbox route may carry the brackets.
  const forms = ids.flatMap((id) => [id, `<${id}>`]);
  const hits = await db
    .select({ ticketId: ticketMessages.ticketId, ext: ticketMessages.externalMessageId })
    .from(ticketMessages)
    .innerJoin(helpdeskTickets, eq(helpdeskTickets.id, ticketMessages.ticketId))
    .where(
      and(
        eq(helpdeskTickets.orgId, orgId),
        eq(helpdeskTickets.channel, 'email'),
        inArray(ticketMessages.externalMessageId, forms),
      ),
    );
  for (const id of ids) {
    const hit = hits.find((h) => messageIdKey(h.ext) === id);
    if (hit) return hit.ticketId;
  }
  return null;
}

/**
 * Add an inbound email to the ticket its headers point at.
 *
 * Whoever sent it, it goes in: a reply from the customer's other mailbox,
 * a colleague in Cc, a forward with the thread headers kept. A sender that
 * is not the ticket's own gets `senderNotOnTicket` so the agent sees it —
 * marked, not refused. A closed ticket reopens: the customer is talking
 * again. A redelivered webhook with the same Message-ID adds nothing.
 */
export async function appendReplyToTicket(
  orgId: string,
  ticketId: string,
  payload: InboundPayload,
): Promise<void> {
  const fromEmail = normalizeEmail(payload.from);
  const [ticket] = await db
    .select({
      status: helpdeskTickets.status,
      contactEmail: contacts.email,
    })
    .from(helpdeskTickets)
    .leftJoin(contacts, and(eq(contacts.id, helpdeskTickets.contactId), eq(contacts.orgId, orgId)))
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)))
    .limit(1);
  if (!ticket) throw AppError.notFound('Ticket');

  // Whose ticket it is: its contact, or — when the first sender was not a
  // contact — the address that first wrote in.
  let owner = ticket.contactEmail?.toLowerCase() ?? null;
  if (!owner) {
    const [first] = await db
      .select({ metadata: ticketMessages.metadata })
      .from(ticketMessages)
      .where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.sender, 'customer')))
      .orderBy(asc(ticketMessages.createdAt))
      .limit(1);
    owner = first?.metadata.fromAddress ?? null;
  }

  const inserted = await db
    .insert(ticketMessages)
    .values({
      ticketId,
      sender: 'customer',
      direction: 'inbound',
      externalMessageId: messageIdKey(payload.messageId),
      body: payload.textBody || payload.htmlBody || '',
      attachments: (payload.attachments ?? [])
        .filter((a) => a.url)
        .map((a) => ({ url: a.url!, name: a.filename })),
      metadata:
        owner === fromEmail
          ? { fromAddress: fromEmail }
          : { fromAddress: fromEmail, senderNotOnTicket: true },
    })
    .onConflictDoNothing()
    .returning({ id: ticketMessages.id });
  if (inserted.length === 0) return;

  await db
    .update(helpdeskTickets)
    .set(
      ticket.status === 'closed'
        ? { status: 'open', closedAt: null, updatedAt: new Date() }
        : { updatedAt: new Date() },
    )
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)));
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
