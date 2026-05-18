import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  groupCategories, groups, contactGroups,
  type GroupCategory, type Group,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export async function createCategory(orgId: string, data: {
  name: string; kind?: 'checkboxes' | 'radio' | 'dropdown' | 'hidden'; visible?: boolean;
}): Promise<GroupCategory> {
  const [row] = await db.insert(groupCategories).values({
    orgId, name: data.name, kind: data.kind ?? 'checkboxes', visible: data.visible ?? true,
  }).returning();
  return row!;
}

export async function listCategories(orgId: string): Promise<GroupCategory[]> {
  return db.select().from(groupCategories).where(eq(groupCategories.orgId, orgId));
}

export async function createGroup(orgId: string, data: { categoryId: string; name: string }): Promise<Group> {
  const [cat] = await db.select().from(groupCategories)
    .where(and(eq(groupCategories.id, data.categoryId), eq(groupCategories.orgId, orgId))).limit(1);
  if (!cat) throw AppError.notFound('GroupCategory');

  const [row] = await db.insert(groups).values({
    orgId, categoryId: data.categoryId, name: data.name,
  }).returning();
  return row!;
}

export async function listGroups(orgId: string, categoryId?: string): Promise<Group[]> {
  const where = categoryId
    ? and(eq(groups.orgId, orgId), eq(groups.categoryId, categoryId))
    : eq(groups.orgId, orgId);
  return db.select().from(groups).where(where);
}

export async function addContactToGroup(contactId: string, groupId: string, orgId: string): Promise<void> {
  const [grp] = await db.select().from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.orgId, orgId))).limit(1);
  if (!grp) throw AppError.notFound('Group');
  await db.insert(contactGroups).values({ contactId, groupId }).onConflictDoNothing();
}

export async function removeContactFromGroup(contactId: string, groupId: string): Promise<void> {
  await db.delete(contactGroups).where(
    and(eq(contactGroups.contactId, contactId), eq(contactGroups.groupId, groupId)),
  );
}

export async function getContactGroups(contactId: string): Promise<Group[]> {
  const rs = await db.execute<{ id: string; name: string; category_id: string; org_id: string; created_at: Date }>(sql`
    SELECT g.* FROM groups g
    JOIN contact_groups cg ON cg.group_id = g.id
    WHERE cg.contact_id = ${contactId}::uuid
  `);
  return (rs as unknown as Array<{ id: string; name: string; category_id: string; org_id: string; created_at: Date }>).map((r) => ({
    id: r.id, name: r.name, categoryId: r.category_id, orgId: r.org_id, createdAt: r.created_at,
  })) as Group[];
}
