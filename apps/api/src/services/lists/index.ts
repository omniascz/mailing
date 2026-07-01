/**
 * List admin CRUD (Sprint backfill).
 *
 * Lists are audience containers — campaigns and workflows reference them
 * via `listId`. Subscribers join via `contact_lists` (composite PK).
 *
 * Soft-delete via `deletedAt` because dangling references in campaigns
 * shouldn't break sends — we treat a deleted list as "empty audience".
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { lists, contactLists, type List } from '../../db/schema/lists.js';
import { AppError } from '../../lib/app-error.js';

export interface CreateListInput {
  name: string;
  description?: string;
  doubleOptIn?: boolean;
  thankYouUrl?: string;
}

export interface UpdateListInput {
  name?: string;
  description?: string | null;
  doubleOptIn?: boolean;
  thankYouUrl?: string | null;
}

export async function listLists(
  orgId: string,
): Promise<Array<List & { liveContactCount: number }>> {
  const rows = await db
    .select()
    .from(lists)
    .where(and(eq(lists.orgId, orgId), isNull(lists.deletedAt)))
    .orderBy(desc(lists.createdAt));

  // The denormalized count on `lists.contactCount` can lag if subscribe
  // and unsubscribe traffic races the increment. The live count below
  // resolves that for the admin list view (one extra query per list is
  // acceptable here — list catalogs are short, dozens not millions).
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const counts = (await db.execute<{ list_id: string; count: string }>(sql`
    SELECT list_id, COUNT(*)::text AS count
    FROM contact_lists
    WHERE list_id IN (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
      AND unsubscribed_at IS NULL
    GROUP BY list_id
  `)) as unknown as Array<{ list_id: string; count: string }>;

  const byId = new Map(counts.map((c) => [c.list_id, Number(c.count)]));
  return rows.map((r) => ({ ...r, liveContactCount: byId.get(r.id) ?? 0 }));
}

export async function getList(
  orgId: string,
  id: string,
): Promise<List & { liveContactCount: number }> {
  const [row] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, id), eq(lists.orgId, orgId), isNull(lists.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound('List');

  const [count] = (await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM contact_lists
    WHERE list_id = ${id}::uuid AND unsubscribed_at IS NULL
  `)) as unknown as Array<{ count: string }>;

  return { ...row, liveContactCount: Number(count?.count ?? 0) };
}

export async function createList(orgId: string, input: CreateListInput): Promise<List> {
  if (!input.name?.trim()) throw AppError.badRequest('List name is required');
  const [row] = await db
    .insert(lists)
    .values({
      orgId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      doubleOptIn: input.doubleOptIn ? 1 : 0,
      thankYouUrl: input.thankYouUrl?.trim() || null,
    })
    .returning();
  return row!;
}

export async function updateList(orgId: string, id: string, patch: UpdateListInput): Promise<List> {
  // Existence + ownership check
  await getList(orgId, id);

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.doubleOptIn !== undefined) set.doubleOptIn = patch.doubleOptIn ? 1 : 0;
  if (patch.thankYouUrl !== undefined) set.thankYouUrl = patch.thankYouUrl?.trim() || null;

  const [row] = await db
    .update(lists)
    .set(set)
    .where(and(eq(lists.id, id), eq(lists.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteList(orgId: string, id: string): Promise<void> {
  await getList(orgId, id);
  await db
    .update(lists)
    .set({ deletedAt: new Date() })
    .where(and(eq(lists.id, id), eq(lists.orgId, orgId)));
}

/**
 * Add an already-existing contact to a list. Idempotent via PK ON CONFLICT.
 * Doesn't re-trigger DOI — admin adds skip the confirmation flow.
 */
export async function addContactToList(
  orgId: string,
  listId: string,
  contactId: string,
): Promise<void> {
  await getList(orgId, listId);
  await db
    .insert(contactLists)
    .values({ contactId, listId, confirmedAt: new Date() })
    .onConflictDoNothing();

  // Bump denormalized count (best-effort; the live count is authoritative)
  await db
    .update(lists)
    .set({ contactCount: sql`${lists.contactCount} + 1`, updatedAt: new Date() })
    .where(eq(lists.id, listId));

  // Fire the `list_subscribe` workflow trigger (fire-and-forget; dynamic import
  // avoids a circular dependency between lists ↔ workflow triggers).
  import('../workflows/triggers.js')
    .then((m) => m.onListSubscribe(orgId, contactId, listId))
    .catch(() => {});
}

export async function removeContactFromList(
  orgId: string,
  listId: string,
  contactId: string,
): Promise<void> {
  await getList(orgId, listId);
  await db
    .delete(contactLists)
    .where(and(eq(contactLists.listId, listId), eq(contactLists.contactId, contactId)));
}
