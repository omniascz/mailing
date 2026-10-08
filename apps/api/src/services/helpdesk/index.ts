/**
 * Helpdesk — minimal ticket store with messages. Klaviyo-style integration:
 * while a contact has any open ticket, marketing sends are paused
 * (see `hasOpenTicket` for the gate used by smart-sending).
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  helpdeskTickets,
  ticketMessages,
  type HelpdeskTicket,
  type TicketMessage,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export type TicketStatus = 'open' | 'pending' | 'closed';

export async function openTicket(
  orgId: string,
  input: {
    subject: string;
    contactId?: string;
    channel?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    body: string;
    tags?: string[];
    /** Source-channel id of the first message — the email Message-ID, so replies can find it. */
    externalMessageId?: string;
    metadata?: TicketMessage['metadata'];
  },
): Promise<HelpdeskTicket> {
  const [ticket] = await db
    .insert(helpdeskTickets)
    .values({
      orgId,
      subject: input.subject,
      contactId: input.contactId ?? null,
      channel: input.channel ?? 'email',
      priority: input.priority ?? 'normal',
      tags: input.tags ?? [],
    })
    .returning();
  await db.insert(ticketMessages).values({
    ticketId: ticket!.id,
    sender: 'customer',
    body: input.body,
    externalMessageId: input.externalMessageId ?? null,
    metadata: input.metadata ?? {},
  });
  return ticket!;
}

export async function listTickets(
  orgId: string,
  opts?: {
    status?: TicketStatus;
    limit?: number;
  },
): Promise<HelpdeskTicket[]> {
  const conds = [eq(helpdeskTickets.orgId, orgId)];
  if (opts?.status) conds.push(eq(helpdeskTickets.status, opts.status));
  return db
    .select()
    .from(helpdeskTickets)
    .where(and(...conds))
    .orderBy(desc(helpdeskTickets.updatedAt))
    .limit(opts?.limit ?? 50);
}

export async function getTicket(
  orgId: string,
  ticketId: string,
): Promise<{
  ticket: HelpdeskTicket;
  messages: TicketMessage[];
}> {
  const [ticket] = await db
    .select()
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)))
    .limit(1);
  if (!ticket) throw AppError.notFound('Ticket');
  const messages = await db
    .select()
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(ticketMessages.createdAt);
  return { ticket, messages };
}

export type MessageDirection = 'inbound' | 'outbound' | 'internal';

/**
 * Where a message goes when the caller does not say. It used to be the column
 * default, 'inbound', for every sender — so an agent's reply was stored as a
 * message from the customer, and a 'system' note as something the live chat
 * visitor is shown (#231 filters on direction). 'system' is the one sender
 * this route had for "not for the customer", so it defaults to internal.
 */
const DEFAULT_DIRECTION: Record<'customer' | 'agent' | 'system', MessageDirection> = {
  customer: 'inbound',
  agent: 'outbound',
  system: 'internal',
};

export async function appendMessage(
  orgId: string,
  ticketId: string,
  input: {
    sender: 'customer' | 'agent' | 'system';
    body: string;
    attachments?: Array<{ url: string; name: string }>;
    direction?: MessageDirection;
  },
): Promise<TicketMessage> {
  const [ticket] = await db
    .select()
    .from(helpdeskTickets)
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)))
    .limit(1);
  if (!ticket) throw AppError.notFound('Ticket');
  const [msg] = await db
    .insert(ticketMessages)
    .values({
      ticketId,
      sender: input.sender,
      direction: input.direction ?? DEFAULT_DIRECTION[input.sender],
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

export async function updateStatus(
  orgId: string,
  ticketId: string,
  status: TicketStatus,
): Promise<HelpdeskTicket> {
  const [row] = await db
    .update(helpdeskTickets)
    .set({
      status,
      closedAt: status === 'closed' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Ticket');
  return row;
}

export async function assignTicket(
  orgId: string,
  ticketId: string,
  userId: string | null,
): Promise<HelpdeskTicket> {
  const [row] = await db
    .update(helpdeskTickets)
    .set({ assignedTo: userId, updatedAt: new Date() })
    .where(and(eq(helpdeskTickets.id, ticketId), eq(helpdeskTickets.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Ticket');
  return row;
}

/** True when the contact has any non-closed ticket — caller pauses marketing. */
export async function hasOpenTicket(orgId: string, contactId: string): Promise<boolean> {
  const [row] = (await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM helpdesk_tickets
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid AND status <> 'closed'
  `)) as unknown as Array<{ n: string }>;
  return Number(row?.n ?? 0) > 0;
}
