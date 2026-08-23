/**
 * The image editor's route, through the real HTTP layer.
 *
 * The case that matters most is the one with no picture in it: an asset id
 * belongs to whoever owns it, the caller supplies that id in the URL, and this
 * repository has no row-level security — isolation is `eq(orgId)` in the query
 * and nothing else. So the boundary is asserted from both sides: the attempt
 * is refused, AND the other organisation's asset is untouched and no new row
 * appeared anywhere.
 *
 * The refusals are also the cheap proof that nothing downstream runs for a
 * request that should not have been made: a 404 here means no fetch of the
 * source bytes, no decode, no upload. Pixel-level behaviour and the decoder
 * limits live in services/media/image-transform.test.ts, where a hostile
 * buffer can be handed straight to the function.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { mediaAssets, organizations, users } from '../db/schema/index.js';

let app: FastifyInstance;
let session: Session;

const tag = randomUUID().slice(0, 8);
let orgId: string;
let otherOrg: string;
/** An image asset owned by the other organisation. Nothing here may touch it. */
let theirAsset: string;
const created: string[] = [];

async function makeAsset(owner: string, opts: { mimeType?: string; url?: string } = {}) {
  const [row] = await db
    .insert(mediaAssets)
    .values({
      orgId: owner,
      filename: `pic-${tag}.png`,
      mimeType: opts.mimeType ?? 'image/png',
      sizeBytes: 1234,
      width: 800,
      height: 600,
      storageUrl: opts.url ?? `https://images.example.com/${tag}.png`,
    })
    .returning({ id: mediaAssets.id });
  created.push(row!.id);
  return row!.id;
}

const transform = (id: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/media/${id}/transform`,
    headers: { cookie: session.cookie },
    payload: body,
  });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  orgId = session.orgId;

  const [other] = await db
    .insert(organizations)
    .values({ name: `media-other-${tag}`, slug: `media-other-${tag}` })
    .returning({ id: organizations.id });
  otherOrg = other!.id;
  theirAsset = await makeAsset(otherOrg);
}, 60_000);

afterAll(async () => {
  if (created.length) await db.delete(mediaAssets).where(inArray(mediaAssets.id, created));
  await db.delete(mediaAssets).where(eq(mediaAssets.orgId, otherOrg));
  await db.delete(users).where(eq(users.orgId, otherOrg));
  await db.delete(organizations).where(eq(organizations.id, otherOrg));
  await app?.close();
}, 60_000);

describe('the tenancy boundary', () => {
  it("another organisation's image cannot be transformed", async () => {
    const res = await transform(theirAsset, { resize: { width: 100 } });
    // 404 rather than 403: the answer must not reveal that the id exists.
    expect(res.statusCode).toBe(404);
  });

  it('and nothing was created or changed on their side', async () => {
    await transform(theirAsset, { crop: { left: 0, top: 0, width: 10, height: 10 } });

    const theirs = await db.select().from(mediaAssets).where(eq(mediaAssets.orgId, otherOrg));

    // Still exactly the one asset we seeded, still unedited, and no derivative
    // was filed under either organisation.
    expect(theirs).toHaveLength(1);
    expect(theirs[0]!.id).toBe(theirAsset);
    expect(theirs[0]!.derivedFromId).toBeNull();
    expect(theirs[0]!.transform).toBeNull();

    const derivedFromTheirs = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.derivedFromId, theirAsset));
    expect(derivedFromTheirs, 'a derivative of their asset exists').toHaveLength(0);
  });

  it('an id that belongs to nobody is the same 404', async () => {
    const res = await transform(randomUUID(), { rotate: 90 });
    expect(res.statusCode).toBe(404);
  });
});

describe('what the route refuses before it touches any bytes', () => {
  it('a request that asks for nothing', async () => {
    const mine = await makeAsset(orgId);
    const res = await transform(mine, {});
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Nothing to do/);
  });

  it('an asset that is not an image', async () => {
    const pdf = await makeAsset(orgId, { mimeType: 'application/pdf' });
    const res = await transform(pdf, { resize: { width: 100 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/is not an image/);
  });

  it('a rotation that is not a right angle', async () => {
    const mine = await makeAsset(orgId);
    const res = await transform(mine, { rotate: 45 });
    expect(res.statusCode).toBe(400);
  });

  it('a quality outside 1–100', async () => {
    const mine = await makeAsset(orgId);
    expect((await transform(mine, { quality: 0 })).statusCode).toBe(400);
    expect((await transform(mine, { quality: 101 })).statusCode).toBe(400);
  });

  it('a crop with a negative origin', async () => {
    const mine = await makeAsset(orgId);
    const res = await transform(mine, { crop: { left: -1, top: 0, width: 10, height: 10 } });
    expect(res.statusCode).toBe(400);
  });
});

describe('the SSRF guard on the source URL', () => {
  it('an asset pointing at link-local metadata is refused, not fetched', async () => {
    // storage_url is a free-form column: this is a URL a caller could register
    // through POST /api/v1/media and then ask us to "edit".
    const evil = await makeAsset(orgId, { url: 'http://169.254.169.254/latest/meta-data/' });
    const res = await transform(evil, { resize: { width: 10 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/could not be fetched/i);
  });

  it('and so is one pointing at the loopback API', async () => {
    const evil = await makeAsset(orgId, { url: 'http://127.0.0.1:3001/api/v1/internal/contacts' });
    const res = await transform(evil, { resize: { width: 10 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/could not be fetched/i);
  });
});
