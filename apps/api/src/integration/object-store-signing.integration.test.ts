/**
 * Everything that writes to object storage now signs, and the signature works.
 *
 * Four places built their own S3 request and three of them did not sign it:
 *
 *   - `services/phone/voicemail.ts` — a hand-built PUT, status checked, so it
 *     failed loudly; against a real store the status was always 403 and no
 *     voicemail was ever stored.
 *   - `services/phone/recording.ts` — a function called `getPresignedPutUrl`
 *     that took an access key and a secret and returned a plain URL without
 *     touching either.
 *   - `services/video/recorder.ts` — the object's plain address handed to the
 *     browser, with `expiresInSeconds: 900` beside it promising an expiry that
 *     nothing enforced.
 *   - `services/digital-assets/index.ts` — a hand-written SigV4 query signer
 *     whose X-Amz-Date dropped a digit (`.slice(0, 15) + 'Z'`), so the date
 *     never matched the scope the signature was computed over.
 *
 * These run against real MinIO, deliberately. Every one of those four passes a
 * mocked S3 without complaint — an unsigned request is only wrong when
 * something checks the signature.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { organizations, users, videoMessages } from '../db/schema/index.js';
import {
  putObject,
  getObjectBytes,
  presignUrl,
  listObjectKeys,
  resetObjectStore,
} from '../lib/object-store.js';
import { requestUpload } from '../services/video/recorder.js';

const BUCKET = process.env.MINIO_BUCKET ?? 'forgemsg';
const VIDEO_BUCKET = process.env.MINIO_VIDEO_BUCKET ?? 'forgemsg-videos';
const GOOD_KEY = process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
const GOOD_SECRET = process.env.MINIO_SECRET_KEY ?? 'minioadmin';

let orgId: string;
let userId: string;

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: 'store itest', slug: `store-itest-${randomUUID().slice(0, 8)}` })
    .returning({ id: organizations.id });
  orgId = org!.id;

  // video_messages.user_id has a foreign key; a random uuid will not do.
  const [user] = await db
    .insert(users)
    .values({
      orgId,
      email: `store-itest-${randomUUID().slice(0, 8)}@example.test`,
      passwordHash: 'x',
      name: 'Store Itest',
    })
    .returning({ id: users.id });
  userId = user!.id;

  resetObjectStore();
  const s3 = await (await import('../lib/object-store.js')).getObjectStore();
  const { CreateBucketCommand } = await import('@aws-sdk/client-s3');
  // Video messages live in their own bucket (MINIO_VIDEO_BUCKET), which is
  // itself worth asserting: the code reads a different variable than the rest.
  for (const b of [BUCKET, VIDEO_BUCKET]) {
    await s3.send(new CreateBucketCommand({ Bucket: b })).catch(() => {
      /* already there */
    });
  }
}, 120_000);

afterAll(async () => {
  await db.delete(videoMessages).where(eq(videoMessages.orgId, orgId));
  await db.delete(users).where(eq(users.orgId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  resetObjectStore();
}, 60_000);

beforeEach(() => {
  process.env.MINIO_ACCESS_KEY = GOOD_KEY;
  process.env.MINIO_SECRET_KEY = GOOD_SECRET;
  resetObjectStore();
});

describe('a signed write lands, and reads back as itself', () => {
  it('round-trips bytes through the shared client', async () => {
    // The path voicemail, recording, media, analytics and the archive all take.
    const key = `itest/${randomUUID()}.bin`;
    const body = Buffer.from('hlasova zprava — sedmnáct bajtů navíc', 'utf8');

    await putObject(BUCKET, key, body, 'audio/mpeg');
    const back = await getObjectBytes(BUCKET, key);

    expect(back.equals(body)).toBe(true);
    expect(await listObjectKeys(BUCKET, 'itest/')).toContain(key);
  }, 120_000);

  it('a presigned GET is fetchable by something holding no credentials', async () => {
    // What storeVoicemail and storeRecording now return. The consumer is a
    // transcription provider fetching over the internet, so an unsigned URL
    // only worked against a world-readable bucket.
    const key = `itest/${randomUUID()}.mp3`;
    const body = Buffer.from('audio-bytes', 'utf8');
    await putObject(BUCKET, key, body, 'audio/mpeg');

    const url = await presignUrl('get', BUCKET, key, 900);
    expect(url).toContain('X-Amz-Signature');

    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(body)).toBe(true);
  }, 120_000);

  it('a presigned PUT lets the browser upload, and the bytes are ours', async () => {
    // services/video/recorder.ts: the bytes are in the browser and never pass
    // through this process, so a presigned URL is genuinely the right shape
    // here — it just had to be signed.
    const upload = await requestUpload(orgId, {
      userId,
      mimeType: 'video/webm',
      sizeBytes: 1024,
    });

    expect(upload.uploadUrl).toContain('X-Amz-Signature');
    expect(upload.expiresInSeconds).toBe(900);

    const bytes = Buffer.from('pretend-this-is-webm', 'utf8');
    const put = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/webm' },
      body: bytes,
    });
    expect(put.status).toBe(200);

    const [row] = await db
      .select({ key: videoMessages.originalObjectKey })
      .from(videoMessages)
      .where(eq(videoMessages.id, upload.videoId));
    const stored = await getObjectBytes(VIDEO_BUCKET, row!.key!);
    expect(stored.equals(bytes)).toBe(true);
  }, 120_000);
});

describe('a rejected credential fails loudly and leaves nothing behind', () => {
  const broken = () => {
    process.env.MINIO_ACCESS_KEY = 'wrong-key';
    process.env.MINIO_SECRET_KEY = 'wrong-secret';
    resetObjectStore();
  };

  it('a write with bad credentials throws, and stores nothing under the key', async () => {
    const key = `itest/${randomUUID()}.bin`;
    broken();
    await expect(
      putObject(BUCKET, key, Buffer.from('x'), 'application/octet-stream'),
    ).rejects.toThrow();

    // Nothing half-written: the key is not there at all.
    process.env.MINIO_ACCESS_KEY = GOOD_KEY;
    process.env.MINIO_SECRET_KEY = GOOD_SECRET;
    resetObjectStore();
    await expect(getObjectBytes(BUCKET, key)).rejects.toThrow();
  }, 120_000);

  it('a URL signed with bad credentials is refused by the store', async () => {
    // The case that decides whether "presigned" means anything: a signature
    // MinIO computes differently is a 403, not a shrug.
    const key = `itest/${randomUUID()}.bin`;
    broken();
    const url = await presignUrl('put', BUCKET, key, 900, 'application/octet-stream');

    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('x'),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  }, 120_000);

  it('a listing failure is an error, not an empty archive', async () => {
    broken();
    await expect(listObjectKeys(BUCKET, 'itest/')).rejects.toThrow();
  }, 120_000);
});
