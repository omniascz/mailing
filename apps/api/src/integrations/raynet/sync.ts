/**
 * Raynet bi-directional sync (#370/#391).
 *
 * Pull direction:
 *   - Fetch contacts/companies/deals from Raynet
 *   - Upsert into MailForge DB, keyed by raynet_*_map for external-id lookup
 *
 * Push direction (future):
 *   - When a MailForge contact/deal is created/updated and `syncContacts`
 *     / `syncDeals` flags are set, push the change to Raynet
 *
 * This module is organised so the pull side is testable; the push side is
 * left as typed stubs to be filled in with paging + conflict resolution
 * during integration hardening.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  raynetConnections,
  raynetContactMap,
  raynetCompanyMap,
  raynetDealMap,
  type RaynetConnection,
} from '../../db/schema/raynet.js';
import { contacts } from '../../db/schema/contacts.js';
import { accounts } from '../../db/schema/accounts.js';
import { deals } from '../../db/schema/deals.js';
import { listContacts, listCompanies, listDeals } from './client.js';
import type {
  RaynetNormalizedContact,
  RaynetNormalizedCompany,
  RaynetNormalizedDeal,
} from './pure.js';

// ─── Pull: Raynet → MailForge ────────────────────────────────────────────────

export async function pullContacts(conn: RaynetConnection, limit = 200): Promise<number> {
  const rows = await listContacts(conn, { limit });
  let processed = 0;
  for (const row of rows) {
    await upsertContact(conn, row);
    processed++;
  }
  await markSynced(conn.orgId);
  return processed;
}

export async function pullCompanies(conn: RaynetConnection, limit = 200): Promise<number> {
  const rows = await listCompanies(conn, { limit });
  let processed = 0;
  for (const row of rows) {
    await upsertCompany(conn, row);
    processed++;
  }
  await markSynced(conn.orgId);
  return processed;
}

export async function pullDeals(conn: RaynetConnection, limit = 200): Promise<number> {
  const rows = await listDeals(conn, { limit });
  let processed = 0;
  for (const row of rows) {
    await upsertDeal(conn, row);
    processed++;
  }
  await markSynced(conn.orgId);
  return processed;
}

// ─── Upsert helpers ──────────────────────────────────────────────────────────

async function upsertContact(conn: RaynetConnection, row: RaynetNormalizedContact): Promise<void> {
  // Find existing mapping
  const [existing] = await db
    .select({ contactId: raynetContactMap.contactId })
    .from(raynetContactMap)
    .where(
      and(
        eq(raynetContactMap.orgId, conn.orgId),
        eq(raynetContactMap.raynetContactId, row.externalId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(contacts)
      .set({
        email: row.email ?? undefined,
        firstName: row.firstName ?? undefined,
        lastName: row.lastName ?? undefined,
        phone: row.phone ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.orgId, conn.orgId), eq(contacts.id, existing.contactId)));
    await db
      .update(raynetContactMap)
      .set({ syncedAt: new Date() })
      .where(
        and(
          eq(raynetContactMap.orgId, conn.orgId),
          eq(raynetContactMap.raynetContactId, row.externalId),
        ),
      );
    return;
  }

  // Create new contact
  const [inserted] = await db
    .insert(contacts)
    .values({
      orgId: conn.orgId,
      email: row.email ?? `raynet-${row.externalId}@placeholder.local`,
      firstName: row.firstName ?? undefined,
      lastName: row.lastName ?? undefined,
      phone: row.phone ?? undefined,
      source: 'raynet_sync',
      status: 'active',
    })
    .onConflictDoNothing()
    .returning({ id: contacts.id });
  if (!inserted) return; // email conflict — skip for now
  await db.insert(raynetContactMap).values({
    orgId: conn.orgId,
    contactId: inserted.id,
    raynetContactId: row.externalId,
  });
}

async function upsertCompany(conn: RaynetConnection, row: RaynetNormalizedCompany): Promise<void> {
  const [existing] = await db
    .select({ accountId: raynetCompanyMap.accountId })
    .from(raynetCompanyMap)
    .where(
      and(
        eq(raynetCompanyMap.orgId, conn.orgId),
        eq(raynetCompanyMap.raynetCompanyId, row.externalId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(accounts)
      .set({
        name: row.name,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.orgId, conn.orgId), eq(accounts.id, existing.accountId)));
    return;
  }

  const [inserted] = await db
    .insert(accounts)
    .values({
      orgId: conn.orgId,
      name: row.name,
    })
    .returning({ id: accounts.id });
  if (!inserted) return;
  await db.insert(raynetCompanyMap).values({
    orgId: conn.orgId,
    accountId: inserted.id,
    raynetCompanyId: row.externalId,
  });
}

async function upsertDeal(conn: RaynetConnection, row: RaynetNormalizedDeal): Promise<void> {
  const [existing] = await db
    .select({ dealId: raynetDealMap.dealId })
    .from(raynetDealMap)
    .where(
      and(
        eq(raynetDealMap.orgId, conn.orgId),
        eq(raynetDealMap.raynetBusinessCaseId, row.externalId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(deals)
      .set({
        name: row.name,
        value: row.amount != null ? String(row.amount) : undefined,
        currency: row.currency,
        updatedAt: new Date(),
      })
      .where(and(eq(deals.orgId, conn.orgId), eq(deals.id, existing.dealId)));
    return;
  }

  // TODO: resolve org's default pipeline + stage before insert (Raynet sync #391)
  const [inserted] = await db
    .insert(deals)
    .values({
      orgId: conn.orgId,
      name: row.name,
      value: row.amount != null ? String(row.amount) : '0',
      currency: row.currency,
    } as unknown as typeof deals.$inferInsert)
    .returning({ id: deals.id });
  if (!inserted) return;
  await db.insert(raynetDealMap).values({
    orgId: conn.orgId,
    dealId: inserted.id,
    raynetBusinessCaseId: row.externalId,
  });
}

async function markSynced(orgId: string): Promise<void> {
  await db
    .update(raynetConnections)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(raynetConnections.orgId, orgId));
}
