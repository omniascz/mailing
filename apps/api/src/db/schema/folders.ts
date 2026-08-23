import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { folderKindEnum } from './enums.js';

/**
 * User-created folders for campaigns and saved templates.
 *
 * One flat level, deliberately. At a few hundred campaigns a tree costs more
 * in navigation than it saves in tidiness, and every level multiplies the
 * questions a move has to answer.
 *
 * One table for both kinds rather than two: the shape, the CRUD, the org
 * scoping and the tests are identical, and `kind` is the only thing that
 * differs. Two tables would mean two copies of all of it. The one risk that
 * buys — a campaign pointed at a template folder — is a check on assignment,
 * because the foreign key cannot express it either way (it cannot express the
 * org match either, which is the check that actually matters).
 *
 * Names are unique per organisation AND kind, so "Black Friday" can exist once
 * for campaigns and once for templates without colliding.
 */
export const folders = pgTable(
  'folders',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: folderKindEnum('kind').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('folders_org_kind_name_idx').on(t.orgId, t.kind, t.name),
    index('folders_org_kind_idx').on(t.orgId, t.kind),
  ],
);

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
