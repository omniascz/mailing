/**
 * The archive writes to object storage and then deletes the only other copy.
 *
 * That is the whole risk. `uploadNdjson` used to build a raw `fetch` PUT with
 * no AWS signature — a real MinIO answers 403 to that, measured — and it did
 * not read the response, so the very next statement deleted from Postgres the
 * rows it had just failed to store. `archiveAllOrgs` then turned the throw
 * into a row of zeros and the route summed those into
 * `{ totalArchived: 0 }` with a 200: a successful answer over destroyed data.
 *
 * Checking the PUT status is necessary and not sufficient. A 200 that stored
 * nothing, or a truncated body, or a proxy that ate the payload, all look
 * identical at that point. So the object is fetched back and compared before
 * the delete runs, and these are the assertions that hold that in place:
 *
 *   - a failed upload deletes nothing, tested against a real MinIO with
 *     credentials that do not work;
 *   - what was archived can be read back and matches, line for line.
 *
 * Real storage on purpose. A mocked S3 would have been perfectly happy with
 * the unsigned PUT that started all this.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { organizations, emailEvents } from '../db/schema/index.js';
import { archiveOldEvents, listArchivedFiles } from '../services/archive/email-events.js';
import { getObjectStore, resetObjectStore } from '../lib/object-store.js';

const BUCKET = process.env.MINIO_BUCKET ?? 'forgemsg-recordings';
const GOOD_KEY = process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
const GOOD_SECRET = process.env.MINIO_SECRET_KEY ?? 'minioadmin';

let orgId: string;

/** Rows older than the cutoff, so the archive has something to move. */
async function seedOldEvents(count: number): Promise<void> {
  const old = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  await db.insert(emailEvents).values(
    Array.from({ length: count }, () => ({
      orgId,
      eventType: 'open' as const,
      createdAt: old,
    })),
  );
}

const remaining = async () =>
  (await db.select({ id: emailEvents.id }).from(emailEvents).where(eq(emailEvents.orgId, orgId)))
    .length;

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: 'archive itest', slug: `archive-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  // The bucket has to exist before anything can be verified against it.
  resetObjectStore();
  const s3 = await getObjectStore();
  const { CreateBucketCommand } = await import('@aws-sdk/client-s3');
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET })).catch(() => {
    /* already there */
  });
}, 120_000);

afterAll(async () => {
  await db.delete(emailEvents).where(eq(emailEvents.orgId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  resetObjectStore();
}, 60_000);

beforeEach(async () => {
  await db.delete(emailEvents).where(eq(emailEvents.orgId, orgId));
  process.env.MINIO_ACCESS_KEY = GOOD_KEY;
  process.env.MINIO_SECRET_KEY = GOOD_SECRET;
  resetObjectStore();
});

describe('the archive proves the write before destroying the original', () => {
  it('deletes nothing when the upload is refused', async () => {
    await seedOldEvents(25);
    expect(await remaining()).toBe(25);

    // Credentials MinIO will reject. This is the case that shipped: the
    // unsigned PUT drew a 403 and the rows went anyway.
    process.env.MINIO_ACCESS_KEY = 'wrong-key';
    process.env.MINIO_SECRET_KEY = 'wrong-secret';
    resetObjectStore();

    await expect(archiveOldEvents(orgId, 30)).rejects.toThrow();

    // The point of the whole change.
    expect(await remaining()).toBe(25);
  }, 120_000);

  it('archives, and what comes back is what went in', async () => {
    await seedOldEvents(40);

    const result = await archiveOldEvents(orgId, 30);
    expect(result.rowsArchived).toBe(40);
    expect(result.rowsDeleted).toBe(40);
    expect(result.s3Keys).toHaveLength(1);
    expect(await remaining()).toBe(0);

    // Read the object back out of storage rather than trusting the return
    // value, which is what the code under test now does too.
    const s3 = await getObjectStore();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: result.s3Keys[0]! }));
    const body = await got.Body!.transformToString('utf8');

    const lines = body.split(String.fromCharCode(10)).filter((l) => l.length > 0);
    expect(lines).toHaveLength(40);

    const parsed = lines.map((l) => JSON.parse(l) as { orgId: string; eventType: string });
    expect(parsed.every((r) => r.orgId === orgId)).toBe(true);
    expect(parsed.every((r) => r.eventType === 'open')).toBe(true);
  }, 120_000);

  it('lists what it wrote — a listing failure is not an empty archive', async () => {
    // listS3Keys was unsigned too and swallowed the 403 into [], so "no
    // archives for this org" and "not allowed to look" read the same.
    await seedOldEvents(5);
    const result = await archiveOldEvents(orgId, 30);

    const listed = await listArchivedFiles(orgId);
    expect(listed).toContain(result.s3Keys[0]);
  }, 120_000);

  it('leaves recent events where they are', async () => {
    await seedOldEvents(10);
    await db.insert(emailEvents).values(
      Array.from({ length: 7 }, () => ({
        orgId,
        eventType: 'click' as const,
        createdAt: new Date(),
      })),
    );

    const result = await archiveOldEvents(orgId, 30);
    expect(result.rowsArchived).toBe(10);
    expect(await remaining()).toBe(7);
  }, 120_000);
});
