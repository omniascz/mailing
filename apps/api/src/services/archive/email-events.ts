/**
 * Long-term email event log archiving (#279).
 *
 * Archives email_events older than N days to S3-compatible storage (MinIO/AWS S3)
 * as NDJSON files (partitioned by org + date). Archived rows are then deleted from PG.
 *
 * S3 key format: archives/email-events/{orgId}/year={Y}/month={MM}/day={DD}/{batchId}.ndjson
 *
 * Workers run this as a nightly BullMQ job (ARCHIVE_CUTOFF_DAYS env, default 30).
 */

import { lt, and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';

const BATCH_SIZE = 5_000;

export interface ArchiveResult {
  orgId: string;
  rowsArchived: number;
  rowsDeleted: number;
  s3Keys: string[];
  cutoffDate: Date;
}

// ─── Archive old events ───────────────────────────────────────────────────────

export async function archiveOldEvents(orgId: string, cutoffDays = 30): Promise<ArchiveResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);
  cutoff.setHours(0, 0, 0, 0);

  const s3Keys: string[] = [];
  let totalArchived = 0;
  let totalDeleted = 0;

  // Process in batches to avoid locking the table
  let hasMore = true;
  while (hasMore) {
    const rows = await db
      .select()
      .from(emailEvents)
      .where(and(eq(emailEvents.orgId, orgId), lt(emailEvents.createdAt, cutoff)))
      .limit(BATCH_SIZE);

    if (rows.length === 0) {
      hasMore = false;
      break;
    }

    // Group by date for partitioned S3 keys
    const byDate = new Map<string, typeof rows>();
    for (const row of rows) {
      const day = row.createdAt.toISOString().slice(0, 10);
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day)!.push(row);
    }

    for (const [day, batch] of byDate) {
      const key = buildS3Key(orgId, day);
      await uploadNdjson(key, batch);
      s3Keys.push(key);
    }

    // Delete archived rows
    const ids = rows.map((r) => r.id);
    await db.execute(sql`DELETE FROM email_events WHERE id = ANY(${sql.param(ids)}::uuid[])`);

    totalArchived += rows.length;
    totalDeleted += rows.length;
    hasMore = rows.length === BATCH_SIZE;
  }

  return {
    orgId,
    rowsArchived: totalArchived,
    rowsDeleted: totalDeleted,
    s3Keys,
    cutoffDate: cutoff,
  };
}

// ─── Archive all orgs ─────────────────────────────────────────────────────────

export async function archiveAllOrgs(cutoffDays = 30): Promise<ArchiveResult[]> {
  const orgs = await db.execute<{ id: string }>(
    sql`SELECT DISTINCT org_id AS id FROM email_events WHERE created_at < NOW() - INTERVAL '${sql.raw(String(cutoffDays))} days' LIMIT 1000`,
  );

  const results: ArchiveResult[] = [];
  for (const { id } of orgs ?? []) {
    const result = await archiveOldEvents(id, cutoffDays).catch((err) => ({
      orgId: id,
      rowsArchived: 0,
      rowsDeleted: 0,
      s3Keys: [],
      cutoffDate: new Date(),
      error: String(err),
    }));
    results.push(result as ArchiveResult);
  }
  return results;
}

// ─── List archived files ──────────────────────────────────────────────────────

export async function listArchivedFiles(
  orgId: string,
  fromDate?: Date,
  toDate?: Date,
): Promise<string[]> {
  const prefix = `archives/email-events/${orgId}/`;
  const keys = await listS3Keys(prefix);

  if (!fromDate && !toDate) return keys;

  return keys.filter((key) => {
    const match = key.match(/year=(\d{4})\/month=(\d{2})\/day=(\d{2})/);
    if (!match) return true;
    const keyDate = new Date(`${match[1]}-${match[2]}-${match[3]}`);
    if (fromDate && keyDate < fromDate) return false;
    if (toDate && keyDate > toDate) return false;
    return true;
  });
}

// ─── S3 helpers ───────────────────────────────────────────────────────────────

function buildS3Key(orgId: string, day: string): string {
  const [year, month, dayStr] = day.split('-');
  const batchId = Date.now();
  return `archives/email-events/${orgId}/year=${year}/month=${month}/day=${dayStr}/${batchId}.ndjson`;
}

async function uploadNdjson(key: string, rows: unknown[]): Promise<void> {
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const bucket = process.env.MINIO_BUCKET ?? 'forgemsg-recordings';
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const scheme = useSSL ? 'https' : 'http';

  const ndjson = rows.map((r) => JSON.stringify(r)).join('\n');
  const body = Buffer.from(ndjson, 'utf8');

  await fetch(`${scheme}://${endpoint}:${port}/${bucket}/${key}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Content-Length': String(body.byteLength),
    },
    body,
  });
}

async function listS3Keys(prefix: string): Promise<string[]> {
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const bucket = process.env.MINIO_BUCKET ?? 'forgemsg-recordings';
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const scheme = useSSL ? 'https' : 'http';

  // MinIO S3-compatible ListObjectsV2
  const res = await fetch(
    `${scheme}://${endpoint}:${port}/${bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`,
  ).catch(() => null);
  if (!res?.ok) return [];

  const xml = await res.text();
  const keys: string[] = [];
  const matches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
  for (const m of matches) if (m[1]) keys.push(m[1]);
  return keys;
}
