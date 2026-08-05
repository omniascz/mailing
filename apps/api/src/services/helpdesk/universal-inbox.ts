/**
 * Universal Inbox (#244)
 *
 * One conversation, every channel. The same customer texting from WhatsApp,
 * DM'ing on Twitter, and opening an email thread must land as a single
 * unified history — not three disconnected tickets.
 *
 * Routing rules (first match wins):
 *   1. externalThreadId match on (orgId, channel) → reuse that ticket
 *   2. externalIdentity match on (orgId, channel) with an open ticket → reuse
 *   3. Contact resolution via email / phone / social_id → open tickets on any channel
 *      for the same contact (within a freshness window) → reuse
 *   4. Otherwise → open a new ticket and associate the contact (resolving or creating)
 */

import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { emitWebhookEvent, toContactSummary } from '../webhooks/emit.js';
import { db } from '../../db/client.js';
import {
  helpdeskTickets,
  ticketMessages,
  contacts,
  type HelpdeskTicket,
  type TicketMessage,
} from '../../db/schema/index.js';

export type InboxChannel =
  | 'email'
  | 'chat'
  | 'sms'
  | 'whatsapp'
  | 'voice'
  | 'messenger'
  | 'twitter'
  | 'instagram'
  | 'viber'
  | 'rcs'
  | 'telegram'
  | 'webchat'
  | 'social_comment'
  | 'social_dm'
  | 'facebook'
  | 'linkedin'
  | 'tiktok';

export interface InboundMessage {
  orgId: string;
  channel: InboxChannel;
  /** Stable thread id from the source channel (Gmail threadId, WA conversation id). */
  externalThreadId?: string;
  /** Unique per-message id, used for webhook idempotency. */
  externalMessageId?: string;
  /** Handle the sender reached us through. Normalised before match. */
  identity: {
    email?: string;
    phone?: string;
    socialId?: string; // Twitter handle, Messenger PSID, WA wa_id
  };
  /** Plain-text body. Agents see this; no HTML decoration. */
  body: string;
  subject?: string;
  attachments?: Array<{ url: string; name: string }>;
  channelMetadata?: Record<string, unknown>;
}

export interface RouteResult {
  ticket: HelpdeskTicket;
  message: TicketMessage;
  /** Why this ticket was chosen; useful for observability + tests. */
  matchReason: 'thread' | 'identity' | 'contact' | 'new';
  /** True when the ticket did not previously exist. */
  created: boolean;
}

// Reuse threshold: an "open" ticket updated within this window will claim new
// inbound messages even when the external thread id differs (e.g. customer
// replies via a different email subject line).
const REUSE_OPEN_TICKET_WINDOW_MS = 7 * 86_400_000; // 7 days

// ─── Identity normalisation ───────────────────────────────────────────────────

function normEmail(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normPhone(v: string | undefined): string | null {
  if (!v) return null;
  // Keep only digits and leading +
  const cleaned = v.replace(/[^+\d]/g, '');
  return cleaned.length >= 8 ? cleaned : null;
}

function normSocial(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Pick the most identifying handle for this channel. */
function pickPrimaryIdentity(
  channel: InboxChannel,
  ident: InboundMessage['identity'],
): string | null {
  if (channel === 'email') return normEmail(ident.email);
  if (
    channel === 'sms' ||
    channel === 'voice' ||
    channel === 'whatsapp' ||
    channel === 'rcs' ||
    channel === 'viber'
  ) {
    return normPhone(ident.phone);
  }
  return normSocial(ident.socialId) ?? normEmail(ident.email) ?? normPhone(ident.phone);
}

// ─── Contact resolution ──────────────────────────────────────────────────────

/**
 * Resolve an inbound sender to a contact. If no contact exists and we have
 * at least an email or phone, create one. Returns null if nothing usable.
 */
async function resolveContact(
  orgId: string,
  ident: InboundMessage['identity'],
): Promise<string | null> {
  const email = normEmail(ident.email);
  const phone = normPhone(ident.phone);

  if (email) {
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)))
      .limit(1);
    if (existing) return existing.id;
  }
  if (phone) {
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.phone, phone)))
      .limit(1);
    if (existing) return existing.id;
  }

  // Create if we have any identifier — otherwise the ticket is anonymous
  if (email || phone) {
    const [created] = await db
      .insert(contacts)
      .values({
        orgId,
        email: email ?? null,
        phone: phone ?? null,
        source: 'inbox',
      })
      .returning();
    if (created) {
      emitWebhookEvent(orgId, 'contact.created', {
        ...toContactSummary(created),
        source: 'inbox',
      });
    }
    return created?.id ?? null;
  }

  return null;
}

// ─── Thread routing ──────────────────────────────────────────────────────────

async function findByExternalThread(
  orgId: string,
  channel: InboxChannel,
  threadId: string,
): Promise<HelpdeskTicket | null> {
  const [row] = await db
    .select()
    .from(helpdeskTickets)
    .where(
      and(
        eq(helpdeskTickets.orgId, orgId),
        eq(helpdeskTickets.channel, channel),
        eq(helpdeskTickets.externalThreadId, threadId),
      ),
    )
    .orderBy(desc(helpdeskTickets.updatedAt))
    .limit(1);
  return row ?? null;
}

async function findOpenByIdentity(
  orgId: string,
  channel: InboxChannel,
  identity: string,
): Promise<HelpdeskTicket | null> {
  const since = new Date(Date.now() - REUSE_OPEN_TICKET_WINDOW_MS);
  const [row] = await db
    .select()
    .from(helpdeskTickets)
    .where(
      and(
        eq(helpdeskTickets.orgId, orgId),
        eq(helpdeskTickets.channel, channel),
        eq(helpdeskTickets.externalIdentity, identity),
        sql`${helpdeskTickets.status} <> 'closed'`,
        gte(helpdeskTickets.updatedAt, since),
      ),
    )
    .orderBy(desc(helpdeskTickets.updatedAt))
    .limit(1);
  return row ?? null;
}

async function findOpenByContact(orgId: string, contactId: string): Promise<HelpdeskTicket | null> {
  const since = new Date(Date.now() - REUSE_OPEN_TICKET_WINDOW_MS);
  const [row] = await db
    .select()
    .from(helpdeskTickets)
    .where(
      and(
        eq(helpdeskTickets.orgId, orgId),
        eq(helpdeskTickets.contactId, contactId),
        sql`${helpdeskTickets.status} <> 'closed'`,
        gte(helpdeskTickets.updatedAt, since),
      ),
    )
    .orderBy(desc(helpdeskTickets.updatedAt))
    .limit(1);
  return row ?? null;
}

// ─── Main routing entrypoint ─────────────────────────────────────────────────

/**
 * Route an inbound message into the universal inbox. Idempotent on
 * externalMessageId: if the same message has been ingested before, the
 * existing ticket/message are returned unchanged.
 */
export async function routeInbound(msg: InboundMessage): Promise<RouteResult> {
  const identity = pickPrimaryIdentity(msg.channel, msg.identity);

  // Step 1 — thread id match
  let ticket: HelpdeskTicket | null = null;
  let matchReason: RouteResult['matchReason'] = 'new';
  let created = false;

  if (msg.externalThreadId) {
    ticket = await findByExternalThread(msg.orgId, msg.channel, msg.externalThreadId);
    if (ticket) matchReason = 'thread';
  }

  // Step 2 — open ticket for this identity on this channel
  if (!ticket && identity) {
    ticket = await findOpenByIdentity(msg.orgId, msg.channel, identity);
    if (ticket) matchReason = 'identity';
  }

  // Step 3 — contact resolution, then cross-channel open ticket
  const contactId = await resolveContact(msg.orgId, msg.identity);
  if (!ticket && contactId) {
    ticket = await findOpenByContact(msg.orgId, contactId);
    if (ticket) matchReason = 'contact';
  }

  // Step 4 — create a fresh ticket
  if (!ticket) {
    const [fresh] = await db
      .insert(helpdeskTickets)
      .values({
        orgId: msg.orgId,
        contactId: contactId ?? null,
        subject: msg.subject ?? `Inbound ${msg.channel} message`,
        channel: msg.channel,
        externalThreadId: msg.externalThreadId ?? null,
        externalIdentity: identity,
        channelMetadata: msg.channelMetadata ?? {},
        status: 'open',
      })
      .returning();
    ticket = fresh!;
    created = true;
  } else {
    // Backfill identifying fields on older tickets
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (!ticket.externalThreadId && msg.externalThreadId)
      patch.externalThreadId = msg.externalThreadId;
    if (!ticket.externalIdentity && identity) patch.externalIdentity = identity;
    if (!ticket.contactId && contactId) patch.contactId = contactId;
    await db.update(helpdeskTickets).set(patch).where(eq(helpdeskTickets.id, ticket.id));
  }

  // Idempotent message insert — if this externalMessageId has already been
  // recorded against this ticket, reuse the existing row instead of duplicating.
  if (msg.externalMessageId) {
    const [existing] = await db
      .select()
      .from(ticketMessages)
      .where(
        and(
          eq(ticketMessages.ticketId, ticket.id),
          eq(ticketMessages.externalMessageId, msg.externalMessageId),
        ),
      )
      .limit(1);
    if (existing) {
      return { ticket, message: existing, matchReason, created };
    }
  }

  const [inserted] = await db
    .insert(ticketMessages)
    .values({
      ticketId: ticket.id,
      sender: 'customer',
      direction: 'inbound',
      externalMessageId: msg.externalMessageId ?? null,
      body: msg.body,
      attachments: msg.attachments ?? [],
    })
    .returning();
  const message: TicketMessage = inserted!;

  await db
    .update(helpdeskTickets)
    .set({ updatedAt: new Date(), status: ticket.status === 'closed' ? 'open' : ticket.status })
    .where(eq(helpdeskTickets.id, ticket.id));

  return { ticket, message, matchReason, created };
}

// ─── Outbound helper (agent reply) ───────────────────────────────────────────

export async function recordOutbound(
  orgId: string,
  ticketId: string,
  input: {
    agentUserId?: string;
    body: string;
    externalMessageId?: string;
    attachments?: Array<{ url: string; name: string }>;
    internal?: boolean;
  },
): Promise<TicketMessage> {
  const [ticket] = await db
    .select()
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)))
    .limit(1);
  if (!ticket) throw new Error('Ticket not found');

  const [msg] = await db
    .insert(ticketMessages)
    .values({
      ticketId,
      sender: input.internal ? 'system' : 'agent',
      direction: input.internal ? 'internal' : 'outbound',
      externalMessageId: input.externalMessageId ?? null,
      body: input.body,
      attachments: input.attachments ?? [],
    })
    .returning();

  await db
    .update(helpdeskTickets)
    .set({ updatedAt: new Date() })
    .where(eq(helpdeskTickets.id, ticketId));

  return msg!;
}

// ─── Unified thread listing ──────────────────────────────────────────────────

export interface UnifiedThread {
  ticket: HelpdeskTicket;
  lastMessage: TicketMessage | null;
  contact: { id: string; email: string | null; phone: string | null } | null;
}

/**
 * List the inbox for an agent: newest-activity-first, across every channel,
 * with the last message and contact row pre-joined.
 */
export async function listInbox(
  orgId: string,
  opts: {
    channel?: InboxChannel;
    status?: 'open' | 'pending' | 'closed';
    assignedTo?: string;
    limit?: number;
    cursor?: string; // ISO updatedAt
  } = {},
): Promise<{ data: UnifiedThread[]; cursor: string | null; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions = [eq(helpdeskTickets.orgId, orgId)];
  if (opts.channel) conditions.push(eq(helpdeskTickets.channel, opts.channel));
  if (opts.status) conditions.push(eq(helpdeskTickets.status, opts.status));
  if (opts.assignedTo) conditions.push(eq(helpdeskTickets.assignedTo, opts.assignedTo));
  if (opts.cursor)
    conditions.push(
      sql`${helpdeskTickets.updatedAt} < ${sql.param(new Date(opts.cursor), helpdeskTickets.updatedAt)}`,
    );

  const tickets = await db
    .select()
    .from(helpdeskTickets)
    .where(and(...conditions))
    .orderBy(desc(helpdeskTickets.updatedAt))
    .limit(limit + 1);

  const hasMore = tickets.length > limit;
  const rows = tickets.slice(0, limit);

  // Fetch last message per ticket in a single pass
  const ticketIds = rows.map((t) => t.id);
  const lastMessages =
    ticketIds.length > 0
      ? await db
          .select()
          .from(ticketMessages)
          .where(
            and(
              sql`${ticketMessages.ticketId} IN (${sql.join(
                ticketIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})`,
              isNotNull(ticketMessages.id),
            ),
          )
          .orderBy(desc(ticketMessages.createdAt))
      : [];
  const lastByTicket = new Map<string, TicketMessage>();
  for (const m of lastMessages) {
    if (!lastByTicket.has(m.ticketId)) lastByTicket.set(m.ticketId, m);
  }

  // Fetch contacts in a single pass
  const contactIds = Array.from(new Set(rows.map((t) => t.contactId).filter(Boolean) as string[]));
  const contactRows =
    contactIds.length > 0
      ? await db
          .select({
            id: contacts.id,
            email: contacts.email,
            phone: contacts.phone,
          })
          .from(contacts)
          .where(
            sql`${contacts.id} IN (${sql.join(
              contactIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`,
          )
      : [];
  const contactMap = new Map(contactRows.map((c) => [c.id, c]));

  const data: UnifiedThread[] = rows.map((ticket) => ({
    ticket,
    lastMessage: lastByTicket.get(ticket.id) ?? null,
    contact: ticket.contactId ? (contactMap.get(ticket.contactId) ?? null) : null,
  }));

  return {
    data,
    hasMore,
    cursor: hasMore && rows.length > 0 ? rows[rows.length - 1]!.updatedAt.toISOString() : null,
  };
}

export async function getUnifiedContactHistory(
  orgId: string,
  contactId: string,
  limit = 100,
): Promise<HelpdeskTicket[]> {
  return db
    .select()
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.orgId, orgId), eq(helpdeskTickets.contactId, contactId)))
    .orderBy(desc(helpdeskTickets.updatedAt))
    .limit(limit);
}
