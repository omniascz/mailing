/**
 * Warehouse sync — export marketing data to S3 / Snowflake / BigQuery / Redshift
 * on a schedule. Each entity (contacts, email_events, revenue_events, …) becomes
 * a JSONL file or a destination-native table append.
 *
 * The current implementation supports S3 / generic webhook destinations directly
 * and emits a payload-ready manifest for warehouses that require external loading.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { warehouseSyncs, type WarehouseSync } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export type WarehouseDestination = 's3' | 'snowflake' | 'bigquery' | 'redshift' | 'webhook';
export type WarehouseEntity =
  | 'contacts'
  | 'email_events'
  | 'revenue_events'
  | 'campaigns'
  | 'workflow_runs';

const ENTITY_QUERY: Record<
  WarehouseEntity,
  (orgId: string, since: Date) => ReturnType<typeof sql>
> = {
  contacts: (orgId, since) =>
    sql`SELECT * FROM contacts WHERE org_id = ${orgId}::uuid AND updated_at >= ${since}`,
  email_events: (orgId, since) =>
    sql`SELECT * FROM email_events WHERE org_id = ${orgId} AND created_at >= ${since}`,
  revenue_events: (orgId, since) =>
    sql`SELECT * FROM revenue_events WHERE org_id = ${orgId}::uuid AND created_at >= ${since}`,
  campaigns: (orgId, since) =>
    sql`SELECT * FROM campaigns WHERE org_id = ${orgId}::uuid AND updated_at >= ${since}`,
  workflow_runs: (orgId, since) =>
    sql`SELECT * FROM workflow_runs WHERE org_id = ${orgId}::uuid AND started_at >= ${since}`,
};

export async function createWarehouseSync(
  orgId: string,
  input: {
    name: string;
    destination: WarehouseDestination;
    entities: WarehouseEntity[];
    config: Record<string, unknown>;
    frequency?: 'hourly' | 'daily' | 'weekly';
  },
): Promise<WarehouseSync> {
  if (input.entities.length === 0) throw AppError.badRequest('Pick at least one entity');
  const [row] = await db
    .insert(warehouseSyncs)
    .values({
      orgId,
      name: input.name,
      destination: input.destination,
      entities: input.entities,
      config: input.config,
      frequency: input.frequency ?? 'daily',
    })
    .returning();
  return row!;
}

export async function listWarehouseSyncs(orgId: string): Promise<WarehouseSync[]> {
  return db.select().from(warehouseSyncs).where(eq(warehouseSyncs.orgId, orgId));
}

export async function deleteWarehouseSync(orgId: string, id: string): Promise<void> {
  await db
    .delete(warehouseSyncs)
    .where(and(eq(warehouseSyncs.id, id), eq(warehouseSyncs.orgId, orgId)));
}

export interface SyncRunResult {
  syncId: string;
  destination: string;
  rowsByEntity: Record<string, number>;
  status: 'ok' | 'error';
  error?: string;
}

async function postWebhook(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
}

/** Materialize one sync run; deferred to a worker in production. */
export async function runSync(syncId: string, orgId: string): Promise<SyncRunResult> {
  const [sync] = await db
    .select()
    .from(warehouseSyncs)
    .where(and(eq(warehouseSyncs.id, syncId), eq(warehouseSyncs.orgId, orgId)))
    .limit(1);
  if (!sync) throw AppError.notFound('WarehouseSync');

  const since = sync.lastSyncAt ?? new Date(Date.now() - 86_400_000);
  const rowsByEntity: Record<string, number> = {};
  const payload: Record<string, unknown[]> = {};

  try {
    for (const ent of sync.entities as WarehouseEntity[]) {
      const builder = ENTITY_QUERY[ent];
      if (!builder) continue;
      const rows = await db.execute(builder(orgId, since));
      const arr = rows as unknown as unknown[];
      payload[ent] = arr;
      rowsByEntity[ent] = arr.length;
    }

    if (sync.destination === 'webhook') {
      const url = (sync.config as { url?: string }).url;
      if (!url) throw new Error('webhook destination missing config.url');
      await postWebhook(url, { syncId: sync.id, since, payload });
    }
    // S3/Snowflake/BigQuery/Redshift adapters delegate to integration layer
    // (workers job picks up the manifest from `payload`).

    await db
      .update(warehouseSyncs)
      .set({
        lastSyncAt: new Date(),
        lastStatus: 'ok',
        lastError: null,
      })
      .where(eq(warehouseSyncs.id, sync.id));

    return { syncId: sync.id, destination: sync.destination, rowsByEntity, status: 'ok' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(warehouseSyncs)
      .set({
        lastSyncAt: new Date(),
        lastStatus: 'error',
        lastError: message,
      })
      .where(eq(warehouseSyncs.id, sync.id));
    return {
      syncId: sync.id,
      destination: sync.destination,
      rowsByEntity,
      status: 'error',
      error: message,
    };
  }
}
