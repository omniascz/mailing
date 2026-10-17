/**
 * What a merge of contacts carries to the winner, so that the merge does not
 * bring back a refusal (Z174, položka 6). One place for both merges: the
 * identity graph (services/cdp/identity-graph.ts mergeContacts — the route and
 * the automatic merge of ingestSignals) and duplicates (services/list-hygiene
 * mergeDuplicates).
 *
 *  - The winner's status becomes the strictest of the merged contacts
 *    (strictestMergeStatus, @forgemsg/shared). Before Z174 the winner kept its
 *    own: an active winner merged with an unsubscribed loser got the next
 *    campaign (measured, Z173: 54/54 merges).
 *  - A per-list unsubscribe of a loser (contact_lists.unsubscribed_at) is
 *    carried to the winner's membership of the same list. Before Z174 it was
 *    lost: the winner got the campaign to a list the loser had left (9/9).
 *    Lists the winner is not on are not added; the loser's rows stay as they
 *    are.
 */
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { strictestMergeStatus, type ContactStatus } from '@forgemsg/shared';
import { db } from '../../db/client.js';
import { contactLists, contacts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import { heldStatus } from './consent-hold.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface MergedContact {
  id: string;
  status: ContactStatus;
  archivedFrom: ContactStatus | null;
  email: string | null;
}

/**
 * Every id a live (not soft-deleted) contact of `orgId`, read before anything
 * of a merge is written; otherwise 404 NOT_FOUND. Before Z174 a merge with an
 * id of another organisation went through: duplicates moved e-mail events
 * across organisations and identity-graph wrote identity_merges with a
 * foreign id (Z173 O1–O4). The same check guards every write that takes a
 * contact id from the caller (Z182: a list membership, an invoice, a
 * subscription, a product page view): a contact of another organisation, an id
 * no contact has and a deleted contact all answer the same 404.
 */
export async function liveContactsOfOrg(
  orgId: string,
  ids: readonly string[],
): Promise<Map<string, MergedContact>> {
  const unique = [...new Set(ids)];
  const rows = await db
    .select({
      id: contacts.id,
      status: contacts.status,
      archivedFrom: contacts.archivedFrom,
      email: contacts.email,
    })
    .from(contacts)
    .where(
      and(eq(contacts.orgId, orgId), inArray(contacts.id, unique), isNull(contacts.deletedAt)),
    );
  if (rows.length !== unique.length) throw AppError.notFound('Contact');
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Carry the losers' refusals to the winner, inside the merge's transaction.
 *
 * The status is written by a direct UPDATE, NOT through updateContact. That is
 * the operator's edit: its consent hold (./consent-hold.ts) judges an edit and
 * answers 409 to the ones it refuses, it cannot set the archived_from of an
 * archived winner, an edit to 'unsubscribed' runs unsubscribeContact (a new
 * unsubscribe row for the winner's address, every list closed, a consent
 * event), and it writes outside this transaction. A merge records no new
 * refusal; it keeps one the person already gave under the other record.
 */
export async function carryRefusalsToWinner(
  tx: Tx,
  orgId: string,
  winner: MergedContact,
  losers: readonly MergedContact[],
): Promise<void> {
  if (losers.length === 0) return;

  // An archive whose archived_from is NULL (one made before 0033) replaced the
  // status its suppression rows speak for — read it as consent-hold does.
  const own =
    winner.status === 'archived' && !winner.archivedFrom
      ? { status: winner.status, archivedFrom: await heldStatus(orgId, winner) }
      : { status: winner.status, archivedFrom: winner.archivedFrom };
  const next = strictestMergeStatus(own, losers);
  if (next.status !== own.status || next.archivedFrom !== own.archivedFrom) {
    await tx
      .update(contacts)
      .set({ status: next.status, archivedFrom: next.archivedFrom, updatedAt: new Date() })
      .where(and(eq(contacts.id, winner.id), eq(contacts.orgId, orgId)));
  }

  // The oldest unsubscribe of a loser per list, onto the winner's open row.
  const unsubscribed = await tx
    .select({
      listId: contactLists.listId,
      unsubscribedAt: contactLists.unsubscribedAt,
      reason: contactLists.unsubscribedReason,
    })
    .from(contactLists)
    .where(
      and(
        inArray(
          contactLists.contactId,
          losers.map((l) => l.id),
        ),
        isNotNull(contactLists.unsubscribedAt),
      ),
    )
    .orderBy(asc(contactLists.unsubscribedAt));
  const oldest = new Map<string, (typeof unsubscribed)[number]>();
  for (const r of unsubscribed) if (!oldest.has(r.listId)) oldest.set(r.listId, r);
  for (const r of oldest.values()) {
    await tx
      .update(contactLists)
      .set({ unsubscribedAt: r.unsubscribedAt, unsubscribedReason: r.reason })
      .where(
        and(
          eq(contactLists.contactId, winner.id),
          eq(contactLists.listId, r.listId),
          isNull(contactLists.unsubscribedAt),
        ),
      );
  }
}
