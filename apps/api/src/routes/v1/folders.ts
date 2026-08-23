/**
 * Folders — user-created drawers for campaigns and saved templates.
 *
 *  - GET    /api/v1/folders?kind=campaign   — list, with item counts
 *  - POST   /api/v1/folders                 — create
 *  - PATCH  /api/v1/folders/:id             — rename
 *  - DELETE /api/v1/folders/:id             — delete; items are released, not deleted
 *
 * Every query is scoped by the caller's organisation, the same way tags.ts
 * does it: the id from the URL is never trusted on its own, it is always
 * `id AND org_id`, so a folder belonging to another organisation reads as
 * missing rather than as forbidden.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { folders, campaigns, templates } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const UNIQUE_NAME_INDEX = 'folders_org_kind_name_idx';

/**
 * Whether a failed write is the unique-name index complaining.
 *
 * Not `err.message.includes(...)`: the driver's error is wrapped in a
 * DrizzleQueryError whose own message is the SQL, and the constraint name only
 * appears on the cause. Reading the message alone turns a duplicate name into
 * a 500. Walk the chain instead.
 */
function isDuplicateName(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    const cur = e as { message?: string; constraint_name?: string; cause?: unknown };
    if (cur.constraint_name === UNIQUE_NAME_INDEX) return true;
    if (typeof cur.message === 'string' && cur.message.includes(UNIQUE_NAME_INDEX)) return true;
    e = cur.cause;
  }
  return false;
}

const folderKinds = ['campaign', 'template'] as const;
export type FolderKind = (typeof folderKinds)[number];

const listQuerySchema = z.object({ kind: z.enum(folderKinds).optional() });
const createSchema = z.object({
  kind: z.enum(folderKinds),
  name: z.string().trim().min(1).max(100),
});
const renameSchema = z.object({ name: z.string().trim().min(1).max(100) });
const idParam = z.object({ id: z.string().uuid() });

/**
 * The folder a caller may point an item at, or null for "unfiled".
 *
 * Three things have to hold and none of them is expressible as a foreign key:
 * the folder exists, it belongs to the caller's organisation, and it is a
 * folder for this kind of item. A campaign filed under a template folder would
 * simply vanish from both lists.
 *
 * A folder that fails any of them reads as not found — the answer must not
 * differ between "no such folder" and "someone else's folder", or the id space
 * becomes an oracle for what other organisations have.
 */
export async function assertFolderAssignable(
  orgId: string,
  kind: FolderKind,
  folderId: string | null,
): Promise<string | null> {
  if (folderId === null) return null;
  const [row] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.orgId, orgId), eq(folders.kind, kind)))
    .limit(1);
  if (!row) throw AppError.notFound('Folder');
  return row.id;
}

/** Item counts per folder, so the list can render "Black Friday (12)". */
async function countsFor(orgId: string, kind: FolderKind): Promise<Map<string, number>> {
  const table = kind === 'campaign' ? campaigns : templates;
  const rows = await db
    .select({ folderId: table.folderId, n: sql<number>`count(*)::int` })
    .from(table)
    .where(
      and(
        eq(table.orgId, orgId),
        sql`${table.folderId} IS NOT NULL`,
        sql`${table.deletedAt} IS NULL`,
      ),
    )
    .groupBy(table.folderId);
  return new Map(rows.filter((r) => r.folderId).map((r) => [r.folderId as string, r.n]));
}

export default async function folderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/api/v1/folders',
    { schema: { tags: ['Folders'], summary: 'List folders' } },
    async (req) => {
      const { kind } = listQuerySchema.parse(req.query);
      const where = kind
        ? and(eq(folders.orgId, req.user!.orgId), eq(folders.kind, kind))
        : eq(folders.orgId, req.user!.orgId);

      const rows = await db.select().from(folders).where(where).orderBy(asc(folders.name));

      // Counting is per kind; do it once per kind actually present.
      const kinds = kind ? [kind] : [...new Set(rows.map((r) => r.kind))];
      const counts = new Map<string, number>();
      for (const k of kinds) {
        for (const [id, n] of await countsFor(req.user!.orgId, k)) counts.set(id, n);
      }

      return { data: rows.map((r) => ({ ...r, itemCount: counts.get(r.id) ?? 0 })) };
    },
  );

  app.post(
    '/api/v1/folders',
    { schema: { tags: ['Folders'], summary: 'Create folder' } },
    async (req, reply) => {
      const body = createSchema.parse(req.body);
      const [row] = await db
        .insert(folders)
        .values({ orgId: req.user!.orgId, kind: body.kind, name: body.name })
        .returning()
        .catch((err: unknown) => {
          if (isDuplicateName(err)) {
            throw AppError.conflict(`Folder "${body.name}" already exists`);
          }
          throw err;
        });
      return reply.code(201).send({ data: { ...row!, itemCount: 0 } });
    },
  );

  app.patch(
    '/api/v1/folders/:id',
    { schema: { tags: ['Folders'], summary: 'Rename folder' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const { name } = renameSchema.parse(req.body);
      const [row] = await db
        .update(folders)
        .set({ name, updatedAt: new Date() })
        .where(and(eq(folders.id, id), eq(folders.orgId, req.user!.orgId)))
        .returning()
        .catch((err: unknown) => {
          if (isDuplicateName(err)) {
            throw AppError.conflict(`Folder "${name}" already exists`);
          }
          throw err;
        });
      if (!row) throw AppError.notFound('Folder');
      return { data: row };
    },
  );

  /**
   * Delete a folder. What is inside it is released, never deleted.
   *
   * The alternatives were to refuse while the folder has contents, which at a
   * few hundred campaigns means emptying it by hand first, or to cascade,
   * which would let one careless click on a label destroy the work it was
   * labelling. Released items show up under "Unfiled", so nothing disappears
   * from any list. The count of what was released comes back so the caller can
   * say so.
   */
  app.delete(
    '/api/v1/folders/:id',
    { schema: { tags: ['Folders'], summary: 'Delete folder' } },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const [folder] = await db
        .select()
        .from(folders)
        .where(and(eq(folders.id, id), eq(folders.orgId, req.user!.orgId)))
        .limit(1);
      if (!folder) throw AppError.notFound('Folder');

      const table = folder.kind === 'campaign' ? campaigns : templates;
      const released = await db
        .update(table)
        .set({ folderId: null, updatedAt: new Date() })
        .where(and(eq(table.orgId, req.user!.orgId), eq(table.folderId, id)))
        .returning({ id: table.id });

      await db.delete(folders).where(and(eq(folders.id, id), eq(folders.orgId, req.user!.orgId)));

      return { data: { id, released: released.length } };
    },
  );
}
