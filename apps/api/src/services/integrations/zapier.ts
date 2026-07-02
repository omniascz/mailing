/**
 * Zapier bridge service (#6 CC-gap).
 *
 * Backs the polling triggers and actions exposed at /api/v1/zapier/*. Zapier
 * authenticates with a ForgeMsg API key (same as the REST API), so all calls
 * are already org-scoped by the auth layer — these helpers take orgId.
 */

import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, tags, contactTags } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export interface ZapierContact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
}

function toZapierContact(row: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string;
  createdAt: Date | null;
}): ZapierContact {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    status: row.status,
    // Zapier de-dupes polling triggers by `id`; ISO timestamp helps ordering.
    createdAt: (row.createdAt ?? new Date(0)).toISOString(),
  };
}

/**
 * Recent contacts for the "new contact" polling trigger, newest first.
 * Optional `sinceIso` returns only contacts created after that instant.
 */
export async function listRecentContacts(
  orgId: string,
  opts: { sinceIso?: string; limit?: number } = {},
): Promise<ZapierContact[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const conds = [eq(contacts.orgId, orgId), isNull(contacts.deletedAt)];
  if (opts.sinceIso) {
    const since = new Date(opts.sinceIso);
    if (!Number.isNaN(since.getTime())) conds.push(gt(contacts.createdAt, since));
  }
  const rows = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      status: contacts.status,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(and(...conds))
    .orderBy(desc(contacts.createdAt))
    .limit(limit);
  return rows.map(toZapierContact);
}

/**
 * Add a tag (by name) to a contact — find-or-create the tag, link it, and fire
 * the tag_added workflow trigger. Used by the Zapier "add tag" action.
 */
export async function zapierAddTagByName(
  orgId: string,
  contactId: string,
  tagName: string,
): Promise<{ contactId: string; tag: string }> {
  const name = tagName.trim();
  if (!name) throw AppError.badRequest('Tag name is required');

  // Verify the contact belongs to this org.
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
    .limit(1);
  if (!contact) throw AppError.notFound('Contact');

  // Find or create the tag.
  let [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.orgId, orgId), eq(tags.name, name)))
    .limit(1);
  if (!tag) {
    [tag] = await db.insert(tags).values({ orgId, name }).returning({ id: tags.id });
  }

  await db.insert(contactTags).values({ contactId, tagId: tag!.id }).onConflictDoNothing();

  // Fire the workflow trigger (fire-and-forget).
  void import('../workflows/triggers.js')
    .then((m) => m.onTagAdded(orgId, contactId, name).catch(() => {}))
    .catch(() => {});

  return { contactId, tag: name };
}
