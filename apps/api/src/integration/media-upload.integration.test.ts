/**
 * Uploading a file, end to end: the real route, a real multipart body, real
 * bytes in a real object store, and a real row.
 *
 * The mocked version of this would prove nothing worth proving. The claims are
 * that the bytes reach OUR storage, that the row describes the file rather
 * than the request, and that the object comes back out at the URL we put in
 * the row — an email client fetches that URL with no session, so if it is not
 * publicly readable the picture is missing from the mail.
 *
 * Skipped when no object store is reachable, and it says so rather than
 * passing quietly: a green run that never wrote a byte is the failure this
 * file exists to avoid.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { mediaAssets, organizations, users } from '../db/schema/index.js';
import { storageEndpoint } from '../services/media/storage.js';

let app: FastifyInstance;
let session: Session;
let orgId: string;
let otherOrg: string;
let theirAsset: string;

const tag = randomUUID().slice(0, 8);
const created: string[] = [];

/** Does this deployment have somewhere to put bytes? */
async function storeIsUp(): Promise<boolean> {
  const { host, port, useSsl } = storageEndpoint();
  const base = `${useSsl ? 'https' : 'http'}://${host}:${port}`;
  try {
    const res = await fetch(`${base}/minio/health/live`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Create the bucket and make it anonymously readable.
 *
 * Done here rather than in the CI workflow so the suite needs no setup to run
 * anywhere — a bare `minio/minio server /data` is enough, locally and in CI.
 * Public read is not a convenience: it is the property under test, because an
 * email client fetches the image with no session.
 */
async function ensureBucket(): Promise<void> {
  const { bucket } = storageEndpoint();
  const { host, port, useSsl } = storageEndpoint();
  const { S3Client, CreateBucketCommand, PutBucketPolicyCommand } =
    await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    endpoint: `${useSsl ? 'https' : 'http'}://${host}:${port}`,
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: true,
  });
  // Already there on a re-run; that is not an error.
  await s3.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => undefined);
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      }),
    }),
  );
}

let haveStore = false;

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 9, g: 90, b: 200 } } })
    .png()
    .toBuffer();

/**
 * A multipart body, hand-built.
 *
 * Written out rather than pulled from a library so the test can lie the way a
 * real client would: a filename and a Content-Type that do not match the
 * bytes, and extra fields alongside.
 */
function multipart(
  fileBytes: Buffer,
  opts: { filename: string; contentType: string; fields?: Record<string, string> },
) {
  const boundary = `----fm${randomUUID().replace(/-/g, '')}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(opts.fields ?? {})) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${opts.filename}"\r\n` +
        `Content-Type: ${opts.contentType}\r\n\r\n`,
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function upload(
  bytes: Buffer,
  opts: { filename: string; contentType: string; fields?: Record<string, string> },
) {
  const { payload, headers } = multipart(bytes, opts);
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/media',
    headers: { ...headers, cookie: session.cookie },
    payload,
  });
  if (res.statusCode === 201) created.push((res.json() as { data: { id: string } }).data.id);
  return res;
}

beforeAll(async () => {
  haveStore = await storeIsUp();
  if (haveStore) await ensureBucket();
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  orgId = session.orgId;

  const [other] = await db
    .insert(organizations)
    .values({ name: `upload-other-${tag}`, slug: `upload-other-${tag}` })
    .returning({ id: organizations.id });
  otherOrg = other!.id;

  const [theirs] = await db
    .insert(mediaAssets)
    .values({
      orgId: otherOrg,
      filename: 'their-secret.png',
      mimeType: 'image/png',
      sizeBytes: 4242,
      width: 800,
      height: 600,
      storageUrl: 'https://images.example.com/theirs.png',
    })
    .returning({ id: mediaAssets.id });
  theirAsset = theirs!.id;
}, 120_000);

afterAll(async () => {
  if (created.length) await db.delete(mediaAssets).where(inArray(mediaAssets.id, created));
  await db.delete(mediaAssets).where(eq(mediaAssets.orgId, otherOrg));
  await db.delete(users).where(eq(users.orgId, otherOrg));
  await db.delete(organizations).where(eq(organizations.id, otherOrg));
  await app?.close();
}, 120_000);

describe('the bytes go through us', () => {
  it('an upload lands in our own object store and is readable without a session', async () => {
    if (!haveStore) {
      expect.fail(
        'No object store reachable at MINIO_ENDPOINT:MINIO_PORT. This case has to write ' +
          'real bytes; skipping it silently would let a broken upload path go green.',
      );
    }

    const bytes = await png(640, 480);
    const res = await upload(bytes, { filename: 'foto.png', contentType: 'image/png' });
    expect(res.statusCode, res.body.slice(0, 300)).toBe(201);
    const asset = (res.json() as { data: Record<string, unknown> }).data;

    // The URL is ours, not something a caller supplied.
    const { host, port, bucket } = storageEndpoint();
    expect(String(asset.storageUrl)).toContain(`${host}:${port}/${bucket}/`);
    expect(String(asset.storageUrl)).toContain(`media/${orgId}/`);

    // And an unauthenticated GET returns the same bytes — this is what a mail
    // client does.
    const fetched = await fetch(String(asset.storageUrl));
    expect(fetched.status, 'the stored object is not publicly readable').toBe(200);
    const back = Buffer.from(await fetched.arrayBuffer());
    expect(back.length).toBe(bytes.length);
    expect(back.equals(bytes), 'the stored bytes differ from what was uploaded').toBe(true);
  }, 120_000);

  it('a thumbnail is generated and is smaller than the original', async () => {
    if (!haveStore) expect.fail('No object store reachable — see the case above.');

    const bytes = await png(1600, 1200);
    const res = await upload(bytes, { filename: 'velke.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(201);
    const asset = (res.json() as { data: Record<string, unknown> }).data;

    expect(asset.thumbnailUrl, 'no thumbnail was generated').toBeTruthy();
    const thumb = await fetch(String(asset.thumbnailUrl));
    expect(thumb.status).toBe(200);
    const thumbBytes = Buffer.from(await thumb.arrayBuffer());
    // The grid used to pull the full-size original for every tile.
    expect(thumbBytes.length).toBeLessThan(bytes.length);
    const meta = await sharp(thumbBytes).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(320);
  }, 120_000);
});

describe('the row describes the file, not the request', () => {
  it('the format comes from the bytes even when the name and header disagree', async () => {
    if (!haveStore) expect.fail('No object store reachable — see the first case.');

    // A real JPEG, announced as a PNG, called .png. Both are caller-written.
    const bytes = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .jpeg()
      .toBuffer();

    const res = await upload(bytes, { filename: 'lzivy.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(201);
    const asset = (res.json() as { data: Record<string, unknown> }).data;

    expect(asset.mimeType, 'the declared Content-Type was believed').toBe('image/jpeg');
    expect(asset.filename, 'the declared extension was kept').toBe('lzivy.jpg');
    expect([asset.width, asset.height]).toEqual([300, 200]);
    expect(asset.sizeBytes).toBe(bytes.length);
  }, 120_000);

  it('the size in the row is the real one, whatever the client claimed', async () => {
    if (!haveStore) expect.fail('No object store reachable — see the first case.');

    const bytes = await png(200, 200);
    const res = await upload(bytes, {
      filename: 'foto.png',
      contentType: 'image/png',
      // The old route took these from the body and wrote them straight in.
      fields: {
        sizeBytes: '1',
        width: '99999',
        height: '99999',
        storageUrl: 'https://evil.test/x.png',
      },
    });
    expect(res.statusCode).toBe(201);
    const asset = (res.json() as { data: Record<string, unknown> }).data;

    expect(asset.sizeBytes).toBe(bytes.length);
    expect(asset.sizeBytes).not.toBe(1);
    expect([asset.width, asset.height]).toEqual([200, 200]);
    expect(String(asset.storageUrl)).not.toContain('evil.test');
  }, 120_000);

  it('a folder and alt text supplied alongside the file are kept', async () => {
    if (!haveStore) expect.fail('No object store reachable — see the first case.');
    const res = await upload(await png(64, 64), {
      filename: 'ikona.png',
      contentType: 'image/png',
      fields: { folder: '/loga', altText: 'Logo obchodu' },
    });
    expect(res.statusCode).toBe(201);
    const asset = (res.json() as { data: Record<string, unknown> }).data;
    expect(asset.folder).toBe('/loga');
    expect(asset.altText).toBe('Logo obchodu');
  }, 120_000);
});

describe('what the route refuses', () => {
  it('a JSON body with a storageUrl — the shape that used to be accepted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/media',
      headers: { cookie: session.cookie },
      payload: {
        filename: 'x.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        storageUrl: 'https://images.example.com/anything.png',
      },
    });
    expect(res.statusCode).toBe(400);
  }, 60_000);

  it('an SVG', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const res = await upload(svg, { filename: 'logo.svg', contentType: 'image/svg+xml' });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/SVG cannot be uploaded/);
  }, 60_000);

  it('a PDF renamed to .png', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>');
    const res = await upload(pdf, { filename: 'faktura.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(400);
  }, 60_000);

  it('and nothing is written to the library when the file is refused', async () => {
    const before = await db.select().from(mediaAssets).where(eq(mediaAssets.orgId, orgId));
    await upload(Buffer.from('nope'), { filename: 'x.png', contentType: 'image/png' });
    const after = await db.select().from(mediaAssets).where(eq(mediaAssets.orgId, orgId));
    expect(after.length, 'a refused upload still created a row').toBe(before.length);
  }, 60_000);
});

describe('the tenancy boundary', () => {
  it("another organisation's asset is not readable", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${theirAsset}`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('their-secret');
  });

  it('nor listed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/media',
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('their-secret');
  });

  it('nor deletable — and their row is untouched by the attempt', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/media/${theirAsset}`,
      headers: { cookie: session.cookie },
    });
    // The delete is org-scoped, so it matches nothing and reports success.
    expect([204, 404]).toContain(res.statusCode);

    const [still] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, theirAsset));
    expect(still, 'their asset was deleted').toBeTruthy();
    expect(still!.deletedAt, 'their asset was soft-deleted from another org').toBeNull();
    expect(still!.orgId).toBe(otherOrg);
  });

  it('an upload is filed under the caller, and only the caller sees it', async () => {
    if (!haveStore) expect.fail('No object store reachable — see the first case.');
    const res = await upload(await png(50, 50), { filename: 'moje.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(201);
    const id = (res.json() as { data: { id: string } }).data.id;

    const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
    expect(row!.orgId).toBe(orgId);
    // …and the key is org-prefixed, so a bucket listing does not mix tenants.
    expect(row!.storageUrl).toContain(`media/${orgId}/`);
    expect(row!.storageUrl).not.toContain(otherOrg);
  }, 120_000);
});
