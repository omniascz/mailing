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
import { putObjectS3, type S3Config } from './s3.js';
import { insertAllBigQuery, type BigQueryConfig } from './bigquery.js';

function toJsonl(rows: unknown[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
}

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
    sql`SELECT * FROM contacts WHERE org_id = ${orgId}::uuid AND updated_at >= ${since.toISOString()}::timestamptz`,
  email_events: (orgId, since) =>
    sql`SELECT * FROM email_events WHERE org_id = ${orgId} AND created_at >= ${since.toISOString()}::timestamptz`,
  revenue_events: (orgId, since) =>
    sql`SELECT * FROM revenue_events WHERE org_id = ${orgId}::uuid AND created_at >= ${since.toISOString()}::timestamptz`,
  campaigns: (orgId, since) =>
    sql`SELECT * FROM campaigns WHERE org_id = ${orgId}::uuid AND updated_at >= ${since.toISOString()}::timestamptz`,
  workflow_runs: (orgId, since) =>
    sql`SELECT * FROM workflow_runs WHERE org_id = ${orgId}::uuid AND started_at >= ${since.toISOString()}::timestamptz`,
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

const FREQUENCY_MS: Record<string, number> = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
};

/** Run every sync whose frequency interval has elapsed since its last run. */
export async function runDueSyncs(nowMs: number = Date.now()): Promise<{
  ran: number;
  ok: number;
  failed: number;
}> {
  const all = await db.select().from(warehouseSyncs);
  let ran = 0;
  let ok = 0;
  let failed = 0;
  for (const s of all) {
    const interval = FREQUENCY_MS[s.frequency ?? 'daily'] ?? FREQUENCY_MS.daily!;
    const last = s.lastSyncAt ? s.lastSyncAt.getTime() : 0;
    if (nowMs - last < interval) continue;
    ran++;
    try {
      const r = await runSync(s.id, s.orgId);
      if (r.status === 'ok') ok++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { ran, ok, failed };
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

    const cfg = sync.config as Record<string, unknown>;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (sync.destination === 'webhook') {
      const url = cfg.url as string | undefined;
      if (!url) throw new Error('webhook destination missing config.url');
      await postWebhook(url, { syncId: sync.id, since, payload });
    } else if (sync.destination === 's3') {
      const s3 = cfg as unknown as S3Config;
      if (!s3.bucket || !s3.accessKeyId) throw new Error('s3 destination missing credentials');
      for (const [ent, rows] of Object.entries(payload)) {
        await putObjectS3(s3, `${ent}/${stamp}.jsonl`, toJsonl(rows));
      }
    } else if (sync.destination === 'bigquery') {
      const bq = cfg as unknown as BigQueryConfig;
      if (!bq.projectId || !bq.accessToken) throw new Error('bigquery destination missing config');
      for (const [ent, rows] of Object.entries(payload)) {
        await insertAllBigQuery(bq, ent, rows as Array<Record<string, unknown>>);
      }
    } else if (sync.destination === 'snowflake' || sync.destination === 'redshift') {
      // Snowflake/Redshift ingest by COPY from an object-storage stage. Land the
      // JSONL in the configured S3 staging bucket; the COPY/auto-ingest pipe
      // (Snowpipe / Redshift COPY job) consumes from there. No more silent 'ok'.
      const s3 = cfg.s3 as S3Config | undefined;
      if (!s3?.bucket || !s3.accessKeyId) {
        throw new Error(`${sync.destination} destination requires config.s3 staging credentials`);
      }
      for (const [ent, rows] of Object.entries(payload)) {
        await putObjectS3(s3, `${sync.destination}/${ent}/${stamp}.jsonl`, toJsonl(rows));
      }
    } else {
      throw new Error(`unsupported destination: ${sync.destination}`);
    }

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
