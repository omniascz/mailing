/**
 * The event archive does not belong in the bucket the whole internet can read.
 *
 * `MINIO_BUCKET` has to allow anonymous GetObject: the media URL written into
 * an email template is unsigned (`services/media/storage.ts`), and the
 * recipient's mail client fetches it with nothing to authenticate with. That is
 * fine for an image. It was not fine for what shared the bucket with it — the
 * email-event archive is every column of `email_events`, including each
 * recipient's `ip_address`, `user_agent`, geo and the link they clicked, and
 * call recordings and voicemail sat there too.
 *
 * Their only protection was that the keys are unguessable, which is secrecy of
 * a URL rather than access control, and it collapses the moment the bucket also
 * allows listing. They move to `MINIO_PRIVATE_BUCKET`, which is never made
 * public.
 *
 * These assertions are on the bucket an object actually LANDS in — fetched back
 * out of a real MinIO by name — not on what the configuration says. And each
 * one first pins that the write happened at all: "it is not in the public
 * bucket" is equally true of an archive run that stored nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  CreateBucketCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { db } from '../db/client.js';
import { organizations, contacts, emailEvents } from '../db/schema/index.js';
import { archiveOldEvents } from '../services/archive/email-events.js';
import { putMediaObject } from '../services/media/storage.js';
import { objectStoreConfig } from '../lib/object-store.js';

const tag = randomUUID().slice(0, 8);

const PUBLIC_BUCKET = process.env.MINIO_BUCKET ?? 'forgemsg';
const PRIVATE_BUCKET = process.env.MINIO_PRIVATE_BUCKET ?? 'forgemsg-private';

let orgId: string;
let contactId: string;
let s3: S3Client;
const writtenKeys: string[] = [];

/** Reads an object, or reports the S3 error name instead of throwing. */
async function fetchObject(bucket: string, key: string): Promise<string | { error: string }> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await res.Body!.transformToString()) as string;
  } catch (err) {
    return { error: (err as Error).name };
  }
}

beforeAll(async () => {
  const cfg = objectStoreConfig();
  s3 = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true,
  });
  for (const b of [PUBLIC_BUCKET, PRIVATE_BUCKET]) {
    await s3.send(new CreateBucketCommand({ Bucket: b })).catch(() => {
      /* already there */
    });
  }

  const [org] = await db
    .insert(organizations)
    .values({ name: 'bucket split', slug: `bucket-split-${tag}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `split-${tag}@example.invalid` })
    .returning({ id: contacts.id });
  contactId = c!.id;

  // Two events old enough for the 30-day cutoff to take them.
  const old = new Date(Date.now() - 45 * 86_400_000);
  await db.insert(emailEvents).values([
    {
      orgId,
      contactId,
      eventType: 'open',
      createdAt: old,
      ipAddress: '203.0.113.7',
      userAgent: `probe-agent-${tag}`,
    },
    {
      orgId,
      contactId,
      eventType: 'click',
      createdAt: old,
      linkUrl: `https://example.invalid/clicked-${tag}`,
    },
  ]);
}, 60_000);

afterAll(async () => {
  for (const key of writtenKeys) {
    for (const b of [PUBLIC_BUCKET, PRIVATE_BUCKET]) {
      await s3.send(new DeleteObjectCommand({ Bucket: b, Key: key })).catch(() => undefined);
    }
  }
  await db.delete(emailEvents).where(eq(emailEvents.orgId, orgId));
  await db.delete(contacts).where(eq(contacts.orgId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  s3?.destroy();
}, 60_000);

describe('sensitive objects land in the private bucket, media stays in the public one', () => {
  it('archives the event dump to the private bucket and not the public one', async () => {
    const result = await archiveOldEvents(orgId);

    // The write happened. Without this, "not in the public bucket" would hold
    // for a run that archived nothing at all.
    expect(result.rowsArchived, 'the archive run stored nothing').toBeGreaterThan(0);
    expect(result.s3Keys.length).toBeGreaterThan(0);
    const key = result.s3Keys[0]!;
    writtenKeys.push(key);

    // Where it landed — asked of the store by bucket name, not of the config.
    const inPrivate = await fetchObject(PRIVATE_BUCKET, key);
    expect(typeof inPrivate, `not in ${PRIVATE_BUCKET}: ${JSON.stringify(inPrivate)}`).toBe(
      'string',
    );

    // And where it did not.
    const inPublic = await fetchObject(PUBLIC_BUCKET, key);
    expect(
      typeof inPublic,
      'the event archive is sitting in the publicly readable bucket',
    ).not.toBe('string');

    // Roundtrip: what comes back is the dump, with the personal columns in it —
    // which is the reason the bucket it sits in matters.
    const ndjson = inPrivate as string;
    const lines = ndjson.trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(parsed.every((r) => r['orgId'] === orgId || r['org_id'] === orgId)).toBe(true);
    expect(ndjson).toContain('203.0.113.7');
    expect(ndjson).toContain(`probe-agent-${tag}`);
    expect(ndjson).toContain(`https://example.invalid/clicked-${tag}`);
  });

  it('still puts media in the public bucket, with an unsigned URL', async () => {
    // Negative control: the split must not sweep media along with it. Media is
    // the reason the public bucket is public.
    const key = `media/${orgId}/split-${tag}.png`;
    const url = await putMediaObject(key, Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');
    writtenKeys.push(key);

    expect(url).toContain(`/${PUBLIC_BUCKET}/`);
    expect(url).not.toContain(`/${PRIVATE_BUCKET}/`);
    // Unsigned: a presigned URL would carry the signature in the query string.
    expect(url).not.toContain('X-Amz-Signature');

    expect(typeof (await fetchObject(PUBLIC_BUCKET, key))).toBe('string');
    expect(typeof (await fetchObject(PRIVATE_BUCKET, key))).not.toBe('string');
  });

  it('reads the archive back out of the private bucket, the way the service does', async () => {
    // Negative control: the archive is server-read, so the move is only safe if
    // the read path follows it. listArchivedKeys/readArchive go through the
    // same archiveBucket() seam.
    const { listArchivedFiles } = await import('../services/archive/email-events.js');
    const files = await listArchivedFiles(orgId);
    expect(
      files.length,
      'the archive cannot be listed back out of the private bucket',
    ).toBeGreaterThan(0);
  });
});
