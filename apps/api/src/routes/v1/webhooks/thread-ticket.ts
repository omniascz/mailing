/**
 * The ticket a social-channel conversation lives in: found, created or
 * reopened in one statement.
 *
 * The Instagram and Messenger handlers used to look for the ticket and insert
 * one when there was none. Two first messages from one sender processed at the
 * same time both looked, both found nothing, and both inserted — and the
 * partial unique index on (org_id, channel, external_thread_id) refused the
 * second. Its transaction rolled back, the error went to a `.catch` that only
 * logs, Meta had already been answered 200, and the second message was lost.
 *
 * An upsert on that index cannot lose the race: the second insert waits for
 * the first to commit and then takes the conflict branch, which is the reopen
 * the handlers already did for an existing ticket. One statement both callers
 * share, so the two channels cannot drift apart again.
 *
 * `externalThreadId` is required here, never null: the index is partial on it
 * being non-null, so a null would never conflict and would open a new ticket
 * every time. Both callers skip a message with no sender id before they get
 * here.
 */
import { sql } from 'drizzle-orm';
import type { db } from '../../../db/client.js';
import { helpdeskTickets } from '../../../db/schema/helpdesk.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ThreadTicket {
  orgId: string;
  subject: string;
  channel: 'instagram' | 'messenger';
  externalThreadId: string;
  externalIdentity: string;
  channelMetadata: Record<string, unknown>;
}

/** Returns the id of the conversation's ticket, now open. */
export async function upsertThreadTicket(tx: Tx, ticket: ThreadTicket): Promise<string> {
  const [row] = await tx
    .insert(helpdeskTickets)
    .values({
      orgId: ticket.orgId,
      subject: ticket.subject,
      channel: ticket.channel,
      externalThreadId: ticket.externalThreadId,
      externalIdentity: ticket.externalIdentity,
      channelMetadata: ticket.channelMetadata,
    })
    .onConflictDoUpdate({
      target: [helpdeskTickets.orgId, helpdeskTickets.channel, helpdeskTickets.externalThreadId],
      targetWhere: sql`external_thread_id IS NOT NULL`,
      // Exactly what the handlers did to an existing ticket: reopen it. The
      // subject, identity and metadata stay as the first message set them.
      set: { status: 'open', updatedAt: new Date() },
    })
    .returning({ id: helpdeskTickets.id });
  return row!.id;
}
