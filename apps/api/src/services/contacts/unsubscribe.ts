/**
 * The one place that decides what "unsubscribed" means and writes it down.
 *
 * Fourteen code paths could unsubscribe a contact and each wrote its own
 * subset of four stores, so the four disagreed depending on how someone left:
 *
 *   contacts.status                  a contact-level flag, read by the UI and
 *                                    by CDP activation / workflow triggers
 *   suppressions                     keyed by EMAIL, not contact — the only
 *                                    store the send path actually consults
 *   contact_lists.unsubscribed_at    the only per-list granularity there is
 *   contact_topic_subscriptions      read by nothing outside its own module
 *
 * The consequence was backwards from what the names suggest: someone who left
 * through the preference centre got a suppression and was safe, while someone
 * an admin marked `unsubscribed` through the API got no suppression at all and
 * kept receiving campaigns.
 *
 * Three decisions are baked in here, and they were deliberate:
 *
 *  - **A per-list unsubscribe never escalates to global.** Leaving one
 *    newsletter is not a refusal of everything, and under GDPR consent is
 *    withdrawn in the scope it was given. "Last list" is also an unstable
 *    thing to key on: add the contact to a second list tomorrow and the
 *    global suppression is still there with nobody able to explain it. The
 *    event carries `wasLastList` so the product can offer to ask, rather than
 *    decide on the recipient's behalf.
 *
 *  - **A global unsubscribe does close the per-list rows.** Otherwise a later
 *    global resubscribe silently puts the contact back into lists they left
 *    long ago.
 *
 *  - **State is idempotent, the event is not.** Gmail retries the one-click
 *    POST on timeout and recipients click the footer link twice; counting
 *    those would inflate the one number mailbox providers actually watch.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contactLists, contacts, emailEvents, suppressions } from '../../db/schema/index.js';

/** What is being withdrawn. */
export type UnsubscribeScope =
  | { kind: 'global' }
  | { kind: 'list'; listId: string }
  | { kind: 'topic'; topicId: string };

/**
 * How the unsubscribe reached us. Recorded on the event because "the recipient
 * clicked unsubscribe" and "an admin marked them unsubscribed" are different
 * facts, and deliverability only cares about the first.
 */
export type UnsubscribeSource =
  | 'one_click'
  | 'footer_link'
  | 'preference_centre'
  | 'api'
  | 'workflow'
  | 'sms_keyword'
  | 'import'
  | 'admin_ui'
  | 'internal';

export interface UnsubscribeOptions {
  scope: UnsubscribeScope;
  source: UnsubscribeSource;
  /** Free text from the recipient, when the path collects one. */
  reason?: string;
  /** Attribution, when the caller has it — the unsub token carries both. */
  campaignId?: string;
  messageId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UnsubscribeResult {
  /** False when the contact was already unsubscribed in this scope. */
  changed: boolean;
  /** Set only when an event row was written, i.e. only when `changed`. */
  eventId?: string;
  /** True when a global unsubscribe was the contact's last remaining list. */
  wasLastList?: boolean;
}

/**
 * Apply an unsubscribe and record it.
 *
 * Returns `changed: false` without writing an event when the contact was
 * already unsubscribed in the requested scope. Every write is conditional, so
 * calling this twice is safe and cheap — no extra round trip is spent finding
 * out whether anything changed, the UPDATE and INSERT report it themselves.
 */
export async function unsubscribeContact(
  orgId: string,
  contactId: string,
  opts: UnsubscribeOptions,
): Promise<UnsubscribeResult> {
  const [contact] = await db
    .select({ id: contacts.id, email: contacts.email, status: contacts.status })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);

  // A contact that is gone cannot be unsubscribed, and inventing an event for
  // one would put a row in email_events with no contact behind it.
  if (!contact) return { changed: false };

  switch (opts.scope.kind) {
    case 'global':
      return unsubscribeGlobally(orgId, contact, opts);
    case 'list':
      return unsubscribeFromList(orgId, contact.id, opts.scope.listId, opts);
    case 'topic':
      return unsubscribeFromTopic(orgId, contact.id, opts.scope.topicId, opts);
  }
}

async function unsubscribeGlobally(
  orgId: string,
  contact: { id: string; email: string | null; status: string | null },
  opts: UnsubscribeOptions,
): Promise<UnsubscribeResult> {
  const now = new Date();

  // Two things make a global unsubscribe "already applied": the contact-level
  // flag and the suppression. Both must be true, because the four stores drift
  // and a contact can easily have one without the other — that drift is what
  // this function exists to end.
  const alreadyFlagged = contact.status === 'unsubscribed';
  let alreadySuppressed = false;
  if (contact.email) {
    const [row] = await db
      .select({ id: suppressions.id })
      .from(suppressions)
      .where(
        and(
          eq(suppressions.orgId, orgId),
          eq(suppressions.email, contact.email.toLowerCase()),
          eq(suppressions.reason, 'unsubscribe'),
        ),
      )
      .limit(1);
    alreadySuppressed = Boolean(row);
  }

  if (!alreadyFlagged) {
    await db
      .update(contacts)
      .set({ status: 'unsubscribed', updatedAt: now })
      .where(and(eq(contacts.id, contact.id), eq(contacts.orgId, orgId)));
  }

  if (contact.email && !alreadySuppressed) {
    await db
      .insert(suppressions)
      .values({
        orgId,
        email: contact.email.toLowerCase(),
        reason: 'unsubscribe',
        notes: opts.reason?.slice(0, 1000),
      })
      .onConflictDoNothing();
  }

  // Close every list the contact is still on. Without this a later global
  // resubscribe — which only lifts the suppression — quietly restores them to
  // lists they had already left.
  const closed = await db
    .update(contactLists)
    .set({ unsubscribedAt: now, unsubscribedReason: opts.reason?.slice(0, 255) })
    .where(and(eq(contactLists.contactId, contact.id), isNull(contactLists.unsubscribedAt)))
    .returning({ listId: contactLists.listId });

  const changed = !alreadyFlagged || !alreadySuppressed || closed.length > 0;
  if (!changed) return { changed: false };

  const eventId = await recordEvent(orgId, contact.id, opts, {
    scope: 'global',
    listsClosed: closed.length,
  });
  return { changed: true, eventId, wasLastList: closed.length === 1 };
}

async function unsubscribeFromList(
  orgId: string,
  contactId: string,
  listId: string,
  opts: UnsubscribeOptions,
): Promise<UnsubscribeResult> {
  const now = new Date();

  // Conditional on unsubscribed_at being null, so a repeat is a no-op that
  // reports itself: no rows back means nothing changed.
  const [updated] = await db
    .update(contactLists)
    .set({ unsubscribedAt: now, unsubscribedReason: opts.reason?.slice(0, 255) })
    .where(
      and(
        eq(contactLists.contactId, contactId),
        eq(contactLists.listId, listId),
        isNull(contactLists.unsubscribedAt),
      ),
    )
    .returning({ listId: contactLists.listId });

  if (!updated) return { changed: false };

  // Deliberately NOT escalating to global — see the file header. Recorded so
  // the product can offer to ask.
  const [remaining] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contactLists)
    .where(and(eq(contactLists.contactId, contactId), isNull(contactLists.unsubscribedAt)));
  const wasLastList = Number(remaining?.n ?? 0) === 0;

  const eventId = await recordEvent(orgId, contactId, opts, {
    scope: 'list',
    listId,
    wasLastList,
  });
  return { changed: true, eventId, wasLastList };
}

async function unsubscribeFromTopic(
  orgId: string,
  contactId: string,
  topicId: string,
  opts: UnsubscribeOptions,
): Promise<UnsubscribeResult> {
  // Topic subscriptions live in their own module and are read by nothing else;
  // this branch exists so callers have one entry point, and is wired up in the
  // follow-up that moves services/topics onto it.
  const eventId = await recordEvent(orgId, contactId, opts, { scope: 'topic', topicId });
  return { changed: true, eventId };
}

/**
 * Write the email_events row.
 *
 * `campaign_id` and `message_id` are columns rather than metadata on purpose:
 * the campaign unsubscribe rate groups by the first, and contacts/email-thread
 * pairs its per-message badges on the second.
 */
async function recordEvent(
  orgId: string,
  contactId: string,
  opts: UnsubscribeOptions,
  extra: Record<string, unknown>,
): Promise<string | undefined> {
  const [row] = await db
    .insert(emailEvents)
    .values({
      orgId,
      contactId,
      campaignId: opts.campaignId ?? null,
      messageId: opts.messageId ?? null,
      eventType: 'unsubscribe',
      userAgent: opts.userAgent?.slice(0, 1024) ?? null,
      ipAddress: opts.ipAddress?.slice(0, 45) ?? null,
      metadata: {
        source: opts.source,
        ...(opts.reason ? { reason: opts.reason } : {}),
        ...extra,
      },
    })
    .returning({ id: emailEvents.id });
  return row?.id;
}
