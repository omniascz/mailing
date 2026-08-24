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

import { createHash } from 'node:crypto';
import { lt, and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { emailEvents } from '../../db/schema/email-events.js';
import { getObjectStore } from '../../lib/object-store.js';

const BATCH_SIZE = 5_000;

/** NDJSON record separator. */
const NEWLINE = String.fromCharCode(10);

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

    // Upload, read back, and only then delete — one day at a time, so a
    // failure on the third day cannot take the first two days' rows with it.
    //
    // The delete used to be one statement for the whole 5000-row batch, run
    // after a loop of uploads whose responses were never examined. Checking the
    // PUT status is necessary and not sufficient: a 200 that stored nothing, or
    // stored a truncated body, is indistinguishable from success at that point.
    // So the object is fetched back and its contents compared before the rows
    // it came from are removed. This costs one GET per file; the alternative
    // costs the events.
    for (const [day, batch] of byDate) {
      const key = buildS3Key(orgId, day);
      const ndjson = batch.map((r) => JSON.stringify(r)).join(NEWLINE);

      await uploadNdjson(key, ndjson);
      await verifyArchive(key, ndjson);

      const ids = batch.map((r) => r.id);
      await db.execute(sql`DELETE FROM email_events WHERE id = ANY(${sql.param(ids)}::uuid[])`);

      s3Keys.push(key);
      totalArchived += batch.length;
      totalDeleted += batch.length;
    }

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
  const failures: string[] = [];
  for (const { id } of orgs ?? []) {
    try {
      results.push(await archiveOldEvents(id, cutoffDays));
    } catch (err) {
      failures.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // A failed org used to be pushed back as a row of zeros, which the route then
  // summed into a cheerful `{ totalArchived: 0 }`. With no storage reachable
  // that is what every run returned, so the nightly job would have reported
  // success forever while email_events kept growing.
  if (failures.length) {
    throw new Error(
      `Archive failed for ${failures.length} of ${(orgs ?? []).length} orgs — ${failures.join('; ')}`,
    );
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

function archiveBucket(): string {
  return process.env.MINIO_BUCKET ?? 'forgemsg-recordings';
}

/**
 * Write the file, signed.
 *
 * This built a raw `fetch` PUT with no AWS signature. A real MinIO answers 403
 * to that — measured — and the response was not examined, so the caller went
 * straight on to delete the rows it had just failed to store. The SDK signs,
 * and throws on any non-2xx, so there is no status left to forget to check.
 */
async function uploadNdjson(key: string, ndjson: string): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await getObjectStore();
  await s3.send(
    new PutObjectCommand({
      Bucket: archiveBucket(),
      Key: key,
      Body: Buffer.from(ndjson, 'utf8'),
      ContentType: 'application/x-ndjson',
    }),
  );
}

/**
 * Read the file back and prove it is the file we sent.
 *
 * A successful PUT is a claim about a request, not about what the store holds.
 * A bucket with a lifecycle rule, a proxy that swallowed the body, a
 * quota-truncated write — each returns 200 and leaves something else, or
 * nothing, behind. Since the next statement destroys the only other copy, the
 * check has to be on the stored bytes: same length, same SHA-256, same line
 * count. An empty object fails all three, which is the case worth naming
 * because it is the one a silent failure most often produces.
 */
export async function verifyArchive(key: string, expected: string): Promise<void> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await getObjectStore();

  const res = await s3.send(new GetObjectCommand({ Bucket: archiveBucket(), Key: key }));
  const stored = await res.Body?.transformToString('utf8');

  if (stored === undefined || stored.length === 0) {
    throw new Error(
      `Archive verification failed for ${key}: the stored object is empty. ` +
        'Rows left in place rather than deleted.',
    );
  }

  const expectedLines = expected.split(NEWLINE).length;
  const storedLines = stored.split(NEWLINE).length;
  if (storedLines !== expectedLines) {
    throw new Error(
      `Archive verification failed for ${key}: stored ${storedLines} lines, sent ${expectedLines}. ` +
        'Rows left in place rather than deleted.',
    );
  }

  const digest = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
  if (digest(stored) !== digest(expected)) {
    throw new Error(
      `Archive verification failed for ${key}: the stored bytes differ from what was sent. ` +
        'Rows left in place rather than deleted.',
    );
  }
}

async function listS3Keys(prefix: string): Promise<string[]> {
  // Also unsigned before, and it swallowed the 403 into an empty list — so
  // "this org has no archives" and "we are not allowed to look" read the same.
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const s3 = await getObjectStore();

  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: archiveBucket(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const item of res.Contents ?? []) if (item.Key) keys.push(item.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return keys;
}
