import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { accounts } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

type AccountInsert = typeof accounts.$inferInsert;

export async function createAccount(
  orgId: string,
  input: Omit<AccountInsert, 'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
) {
  if (input.parentAccountId) {
    const [parent] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, input.parentAccountId),
          eq(accounts.orgId, orgId),
          isNull(accounts.deletedAt),
        ),
      );
    if (!parent) throw AppError.badRequest('Parent account not found');
  }

  const [row] = await db
    .insert(accounts)
    .values({ ...input, orgId })
    .returning();
  return row!;
}

export async function getAccount(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.orgId, orgId), isNull(accounts.deletedAt)));
  if (!row) throw AppError.notFound('Account not found');
  return row;
}

export async function listAccounts(
  orgId: string,
  opts: {
    search?: string;
    industry?: string;
    ownerUserId?: string;
    limit?: number;
  } = {},
) {
  const { search, industry, ownerUserId, limit = 50 } = opts;
  const conditions = [eq(accounts.orgId, orgId), isNull(accounts.deletedAt)];
  if (industry) conditions.push(eq(accounts.industry, industry));
  if (ownerUserId) conditions.push(eq(accounts.ownerUserId, ownerUserId));
  if (search)
    conditions.push(
      sql`(${accounts.name} ILIKE ${'%' + search + '%'} OR ${accounts.domain} ILIKE ${'%' + search + '%'})`,
    );

  return db
    .select()
    .from(accounts)
    .where(and(...conditions))
    .orderBy(desc(accounts.createdAt))
    .limit(limit);
}

export async function updateAccount(
  orgId: string,
  id: string,
  patch: Partial<Omit<AccountInsert, 'id' | 'orgId' | 'createdAt'>>,
) {
  await getAccount(orgId, id); // ensures existence + org scope
  if (patch.parentAccountId === id) throw AppError.badRequest('Account cannot be its own parent');

  const [row] = await db
    .update(accounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteAccount(orgId: string, id: string) {
  await getAccount(orgId, id);
  await db
    .update(accounts)
    .set({ deletedAt: new Date() })
    .where(and(eq(accounts.id, id), eq(accounts.orgId, orgId)));
}

export async function listChildAccounts(orgId: string, parentId: string) {
  return db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.orgId, orgId),
        eq(accounts.parentAccountId, parentId),
        isNull(accounts.deletedAt),
      ),
    )
    .orderBy(accounts.name);
}
