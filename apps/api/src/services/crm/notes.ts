import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { crmNotes, type CrmNote } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

type NoteInsert = typeof crmNotes.$inferInsert;

export async function createNote(orgId: string, input: {
  body: string;
  contactId?: string | null;
  dealId?: string | null;
  accountId?: string | null;
  authorUserId?: string | null;
}): Promise<CrmNote> {
  if (!input.body.trim()) throw AppError.badRequest('Note body cannot be empty');

  const [row] = await db.insert(crmNotes).values({
    orgId,
    body: input.body,
    contactId: input.contactId ?? null,
    dealId: input.dealId ?? null,
    accountId: input.accountId ?? null,
    authorUserId: input.authorUserId ?? null,
  } satisfies NoteInsert).returning();
  return row!;
}

export async function getNote(orgId: string, id: string): Promise<CrmNote> {
  const [row] = await db.select().from(crmNotes)
    .where(and(eq(crmNotes.id, id), eq(crmNotes.orgId, orgId), isNull(crmNotes.deletedAt)));
  if (!row) throw AppError.notFound('Note not found');
  return row;
}

export async function listNotes(orgId: string, opts: {
  contactId?: string;
  dealId?: string;
  accountId?: string;
  limit?: number;
  cursor?: string;
} = {}): Promise<{ data: CrmNote[]; cursor: string | null }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions = [eq(crmNotes.orgId, orgId), isNull(crmNotes.deletedAt)];

  if (opts.contactId) conditions.push(eq(crmNotes.contactId, opts.contactId));
  if (opts.dealId) conditions.push(eq(crmNotes.dealId, opts.dealId));
  if (opts.accountId) conditions.push(eq(crmNotes.accountId, opts.accountId));
  if (opts.cursor) {
    conditions.push(sql`${crmNotes.createdAt} < (SELECT created_at FROM crm_notes WHERE id = ${opts.cursor})`);
  }

  const rows = await db.select().from(crmNotes)
    .where(and(...conditions))
    .orderBy(desc(crmNotes.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, cursor: hasMore ? data[data.length - 1]!.id : null };
}

export async function updateNote(orgId: string, id: string, input: { body: string }): Promise<CrmNote> {
  await getNote(orgId, id);
  if (!input.body.trim()) throw AppError.badRequest('Note body cannot be empty');

  const [row] = await db.update(crmNotes)
    .set({ body: input.body, updatedAt: new Date() })
    .where(and(eq(crmNotes.id, id), eq(crmNotes.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteNote(orgId: string, id: string): Promise<void> {
  await getNote(orgId, id);
  await db.update(crmNotes)
    .set({ deletedAt: new Date() })
    .where(and(eq(crmNotes.id, id), eq(crmNotes.orgId, orgId)));
}
