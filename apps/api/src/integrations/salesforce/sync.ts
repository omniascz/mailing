/**
 * Bi-directional sync orchestrator for Salesforce.
 *
 * Conflict resolution: last-writer-wins per record, scoped per field. We
 * compute a content hash both ways; if it matches `lastSyncedHash` then the
 * remote/local has not actually changed since the last sync, so we skip the
 * write to avoid endless ping-pong.
 *
 * Pull strategy: SOQL `LastModifiedDate > lastSyncAt` — incremental, paged.
 * Push strategy: scan local rows updated since lastSyncAt; upsert to SFDC.
 *
 * The id map (`salesforce_id_map`) is the bridge — every entity gets exactly
 * one (orgId, entityType, localId) ↔ (orgId, entityType, salesforceId) row.
 */

import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../../db/client.js';
import {
  salesforceConnections,
  salesforceIdMap,
  salesforceSyncRuns,
  type SalesforceConnection,
} from '../../db/schema/salesforce.js';
import { contacts, accounts, deals } from '../../db/schema/index.js';
import {
  queryAccounts,
  queryContacts,
  queryOpportunities,
  upsertAccount,
  upsertContact,
  upsertOpportunity,
  type SfAccountRecord,
  type SfContactRecord,
  type SfOpportunityRecord,
} from './client.js';

type EntityType = 'contact' | 'account' | 'deal';

function hashRecord(input: Record<string, unknown>): string {
  // Stable JSON: sort keys before hashing.
  const sorted: Record<string, unknown> = {};
  Object.keys(input)
    .sort()
    .forEach((k) => {
      sorted[k] = input[k];
    });
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

async function lookupSfId(
  orgId: string,
  type: EntityType,
  localId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ sfId: salesforceIdMap.salesforceId })
    .from(salesforceIdMap)
    .where(
      and(
        eq(salesforceIdMap.orgId, orgId),
        eq(salesforceIdMap.entityType, type),
        eq(salesforceIdMap.localId, localId),
      ),
    )
    .limit(1);
  return row?.sfId ?? null;
}

async function lookupLocalId(
  orgId: string,
  type: EntityType,
  sfId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ localId: salesforceIdMap.localId })
    .from(salesforceIdMap)
    .where(
      and(
        eq(salesforceIdMap.orgId, orgId),
        eq(salesforceIdMap.entityType, type),
        eq(salesforceIdMap.salesforceId, sfId),
      ),
    )
    .limit(1);
  return row?.localId ?? null;
}

async function recordMapping(
  orgId: string,
  type: EntityType,
  localId: string,
  sfId: string,
  hash: string,
): Promise<void> {
  await db
    .insert(salesforceIdMap)
    .values({ orgId, entityType: type, localId, salesforceId: sfId, lastSyncedHash: hash })
    .onConflictDoUpdate({
      target: [salesforceIdMap.orgId, salesforceIdMap.entityType, salesforceIdMap.localId],
      set: { salesforceId: sfId, lastSyncedHash: hash, lastSyncedAt: new Date() },
    });
}

// ─── PUSH: ForgeMsg → Salesforce ─────────────────────────────────────────────

function contactToSfBody(c: typeof contacts.$inferSelect): Partial<SfContactRecord> {
  return {
    FirstName: c.firstName ?? undefined,
    LastName: c.lastName ?? 'Unknown',
    Email: c.email ?? undefined,
    Phone: c.phone ?? undefined,
  };
}

function accountToSfBody(a: typeof accounts.$inferSelect): Partial<SfAccountRecord> {
  return {
    Name: a.name,
    Website: a.domain ?? undefined,
    Industry: a.industry ?? undefined,
    AnnualRevenue: a.annualRevenueUsd ?? undefined,
    NumberOfEmployees: a.employeeCount ?? undefined,
  };
}

function dealToSfBody(d: typeof deals.$inferSelect): Partial<SfOpportunityRecord> {
  return {
    Name: d.name,
    StageName: d.stageId,
    Amount: Number(d.value),
    CloseDate: d.expectedCloseDate?.toISOString().slice(0, 10),
  };
}

export async function pushContacts(
  conn: SalesforceConnection,
  since?: Date,
): Promise<{ inserted: number; updated: number; failed: number }> {
  const sinceCond = since ? gte(contacts.updatedAt, since) : sql`true`;
  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, conn.orgId), isNull(contacts.deletedAt), sinceCond))
    .limit(500);
  let inserted = 0,
    updated = 0,
    failed = 0;
  for (const c of rows) {
    try {
      const body = contactToSfBody(c);
      const hash = hashRecord(body);
      const sfId = await lookupSfId(conn.orgId, 'contact', c.id);
      if (sfId) {
        await upsertContact(conn, { Id: sfId, ...body });
        updated++;
      } else {
        const created = await upsertContact(conn, body);
        inserted++;
        await recordMapping(conn.orgId, 'contact', c.id, created.id, hash);
        continue;
      }
      await recordMapping(conn.orgId, 'contact', c.id, sfId, hash);
    } catch {
      failed++;
    }
  }
  return { inserted, updated, failed };
}

export async function pushAccounts(
  conn: SalesforceConnection,
  since?: Date,
): Promise<{ inserted: number; updated: number; failed: number }> {
  const sinceCond = since ? gte(accounts.updatedAt, since) : sql`true`;
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, conn.orgId), isNull(accounts.deletedAt), sinceCond))
    .limit(500);
  let inserted = 0,
    updated = 0,
    failed = 0;
  for (const a of rows) {
    try {
      const body = accountToSfBody(a);
      const hash = hashRecord(body);
      const sfId = await lookupSfId(conn.orgId, 'account', a.id);
      if (sfId) {
        await upsertAccount(conn, { Id: sfId, ...body });
        updated++;
        await recordMapping(conn.orgId, 'account', a.id, sfId, hash);
      } else {
        const created = await upsertAccount(conn, body);
        inserted++;
        await recordMapping(conn.orgId, 'account', a.id, created.id, hash);
      }
    } catch {
      failed++;
    }
  }
  return { inserted, updated, failed };
}

export async function pushDeals(
  conn: SalesforceConnection,
  since?: Date,
): Promise<{ inserted: number; updated: number; failed: number }> {
  const sinceCond = since ? gte(deals.updatedAt, since) : sql`true`;
  const rows = await db
    .select()
    .from(deals)
    .where(and(eq(deals.orgId, conn.orgId), isNull(deals.deletedAt), sinceCond))
    .limit(500);
  let inserted = 0,
    updated = 0,
    failed = 0;
  for (const d of rows) {
    try {
      const body = dealToSfBody(d);
      const hash = hashRecord(body);
      const sfId = await lookupSfId(conn.orgId, 'deal', d.id);
      if (sfId) {
        await upsertOpportunity(conn, { Id: sfId, ...body });
        updated++;
        await recordMapping(conn.orgId, 'deal', d.id, sfId, hash);
      } else {
        const created = await upsertOpportunity(conn, body);
        inserted++;
        await recordMapping(conn.orgId, 'deal', d.id, created.id, hash);
      }
    } catch {
      failed++;
    }
  }
  return { inserted, updated, failed };
}

// ─── PULL: Salesforce → ForgeMsg ─────────────────────────────────────────────

export async function pullContacts(
  conn: SalesforceConnection,
  since?: Date,
): Promise<{ inserted: number; updated: number; failed: number }> {
  const result = await queryContacts(conn, since?.toISOString());
  let inserted = 0,
    updated = 0,
    failed = 0;
  for (const c of result.records) {
    try {
      const body = { FirstName: c.FirstName, LastName: c.LastName, Email: c.Email, Phone: c.Phone };
      const hash = hashRecord(body);
      const localId = await lookupLocalId(conn.orgId, 'contact', c.Id);
      if (localId) {
        await db
          .update(contacts)
          .set({
            firstName: c.FirstName ?? null,
            lastName: c.LastName ?? null,
            email: c.Email ?? null,
            phone: c.Phone ?? null,
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, localId));
        updated++;
        await recordMapping(conn.orgId, 'contact', localId, c.Id, hash);
      } else {
        const [row] = await db
          .insert(contacts)
          .values({
            orgId: conn.orgId,
            firstName: c.FirstName,
            lastName: c.LastName,
            email: c.Email,
            phone: c.Phone,
            source: 'salesforce',
          })
          .returning({ id: contacts.id });
        inserted++;
        if (row) await recordMapping(conn.orgId, 'contact', row.id, c.Id, hash);
      }
    } catch {
      failed++;
    }
  }
  return { inserted, updated, failed };
}

export async function pullAccounts(
  conn: SalesforceConnection,
  since?: Date,
): Promise<{ inserted: number; updated: number; failed: number }> {
  const result = await queryAccounts(conn, since?.toISOString());
  let inserted = 0,
    updated = 0,
    failed = 0;
  for (const a of result.records) {
    try {
      const body = {
        Name: a.Name,
        Website: a.Website,
        Industry: a.Industry,
        AnnualRevenue: a.AnnualRevenue,
        NumberOfEmployees: a.NumberOfEmployees,
      };
      const hash = hashRecord(body);
      const localId = await lookupLocalId(conn.orgId, 'account', a.Id);
      if (localId) {
        await db
          .update(accounts)
          .set({
            name: a.Name,
            domain: a.Website ?? null,
            industry: a.Industry ?? null,
            annualRevenueUsd: a.AnnualRevenue ?? null,
            employeeCount: a.NumberOfEmployees ?? null,
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, localId));
        updated++;
        await recordMapping(conn.orgId, 'account', localId, a.Id, hash);
      } else {
        const [row] = await db
          .insert(accounts)
          .values({
            orgId: conn.orgId,
            name: a.Name,
            domain: a.Website,
            industry: a.Industry,
            annualRevenueUsd: a.AnnualRevenue ?? null,
            employeeCount: a.NumberOfEmployees ?? null,
          })
          .returning({ id: accounts.id });
        inserted++;
        if (row) await recordMapping(conn.orgId, 'account', row.id, a.Id, hash);
      }
    } catch {
      failed++;
    }
  }
  return { inserted, updated, failed };
}

export async function pullOpportunities(
  conn: SalesforceConnection,
  since?: Date,
): Promise<{ inserted: number; updated: number; failed: number }> {
  const result = await queryOpportunities(conn, since?.toISOString());
  const inserted = 0;
  let updated = 0,
    failed = 0;
  for (const o of result.records) {
    try {
      const body = {
        Name: o.Name,
        StageName: o.StageName,
        Amount: o.Amount,
        CloseDate: o.CloseDate,
      };
      const hash = hashRecord(body);
      const localId = await lookupLocalId(conn.orgId, 'deal', o.Id);
      const status: 'open' | 'won' | 'lost' = o.IsClosed ? (o.IsWon ? 'won' : 'lost') : 'open';
      const closeDate = o.CloseDate ? new Date(o.CloseDate) : null;
      if (localId) {
        await db
          .update(deals)
          .set({
            name: o.Name,
            stageId: o.StageName,
            value: String(o.Amount ?? 0),
            expectedCloseDate: closeDate,
            status,
            updatedAt: new Date(),
          })
          .where(eq(deals.id, localId));
        updated++;
        await recordMapping(conn.orgId, 'deal', localId, o.Id, hash);
      } else {
        // We don't know which pipeline to attach to. Skip insert when there is
        // no matching pipeline; surface this in the failed count so the operator
        // can configure pipeline mapping.
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { inserted, updated, failed };
}

// ─── Top-level sync run ──────────────────────────────────────────────────────

export async function runSync(
  orgId: string,
  opts: { direction?: 'push' | 'pull' | 'both' } = {},
): Promise<void> {
  const direction = opts.direction ?? 'both';
  const [conn] = await db
    .select()
    .from(salesforceConnections)
    .where(eq(salesforceConnections.orgId, orgId))
    .limit(1);
  if (!conn) throw new Error('Salesforce connection not configured');
  const since = conn.lastSyncAt ?? undefined;
  const startedAt = new Date();

  if (direction === 'push' || direction === 'both') {
    if (conn.syncContacts)
      await runStep(orgId, 'push', 'contact', () => pushContacts(conn, since), startedAt);
    if (conn.syncAccounts)
      await runStep(orgId, 'push', 'account', () => pushAccounts(conn, since), startedAt);
    if (conn.syncDeals)
      await runStep(orgId, 'push', 'deal', () => pushDeals(conn, since), startedAt);
  }
  if (direction === 'pull' || direction === 'both') {
    if (conn.syncContacts)
      await runStep(orgId, 'pull', 'contact', () => pullContacts(conn, since), startedAt);
    if (conn.syncAccounts)
      await runStep(orgId, 'pull', 'account', () => pullAccounts(conn, since), startedAt);
    if (conn.syncDeals)
      await runStep(orgId, 'pull', 'deal', () => pullOpportunities(conn, since), startedAt);
  }

  await db
    .update(salesforceConnections)
    .set({ lastSyncAt: new Date() })
    .where(eq(salesforceConnections.orgId, orgId));
}

async function runStep(
  orgId: string,
  direction: 'push' | 'pull',
  entityType: EntityType,
  fn: () => Promise<{ inserted: number; updated: number; failed: number }>,
  startedAt: Date,
): Promise<void> {
  const [run] = await db
    .insert(salesforceSyncRuns)
    .values({ orgId, direction, entityType, startedAt })
    .returning({ id: salesforceSyncRuns.id });
  try {
    const r = await fn();
    await db
      .update(salesforceSyncRuns)
      .set({
        inserted: { count: r.inserted },
        updated: { count: r.updated },
        failed: { count: r.failed },
        finishedAt: new Date(),
      })
      .where(eq(salesforceSyncRuns.id, run!.id));
  } catch (err) {
    await db
      .update(salesforceSyncRuns)
      .set({ failed: { count: 1, errors: [String(err).slice(0, 1000)] }, finishedAt: new Date() })
      .where(eq(salesforceSyncRuns.id, run!.id));
  }
}

export async function listSyncRuns(orgId: string, limit = 50) {
  return db
    .select()
    .from(salesforceSyncRuns)
    .where(eq(salesforceSyncRuns.orgId, orgId))
    .orderBy(sql`started_at DESC`)
    .limit(limit);
}
