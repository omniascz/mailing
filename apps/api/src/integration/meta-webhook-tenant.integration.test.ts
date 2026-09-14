/**
 * Whose inbox an incoming Meta message lands in.
 *
 * `resolveOrgId` (routes/v1/webhooks/meta.ts) does look the page up in
 * meta_page_mappings, and that table is the right answer — it exists for this,
 * and its own header says so. Two things were wrong with how it was consulted.
 *
 * ─── 1. The env fallback ─────────────────────────────────────────────────────
 *
 *     // Fallback to env var (single-tenant / dev)
 *     return process.env['META_ORG_ID'] ?? null;
 *
 * A page nobody registered was therefore not unknown — it was attributed to
 * whichever organisation META_ORG_ID names. On a multi-tenant installation that
 * is a stranger's Messenger conversation, with its sender id and text, stored
 * in a customer's inbox. The variable is a leftover from before the mapping
 * table existed; the schema comment for meta_page_mappings describes itself as
 * the replacement for "hardcoded META_ORG_ID env var".
 *
 * ─── 2. The missing channel ──────────────────────────────────────────────────
 *
 * The unique key is (page_id, channel), so the SAME page id can legitimately be
 * registered twice — once for instagram, once for messenger — and by different
 * organisations. The lookup filtered on page_id and active only, with limit 1,
 * so which organisation got a messenger event for a doubly-registered id was
 * whichever row Postgres returned first. The payload says which channel it is:
 * `object: 'page'` is Messenger, `object: 'instagram'` is Instagram — the same
 * discriminator handlePayload already switches on.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * This endpoint answers 200 to everything it accepts, before and after, and an
 * empty table is also what a rejected signature or a disabled route look like.
 * So each refusal case is followed by one that must write, and the case that
 * matters most asserts the row field by field in the organisation that owns the
 * page — not merely that the wrong one stayed empty.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, inboxMessages, metaPageMappings } from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);
const APP_SECRET = `itest-meta-tenant-${tag}`;

/** Registered by the fallback org as instagram, and by the owner as messenger. */
const PAGE_SHARED = `9200${tag}`;
/** Registered only by the owner org. */
const PAGE_OWNED = `9300${tag}`;
/** Registered by nobody. */
const PAGE_UNKNOWN = `9900${tag}`;

const PSID = `psid-${tag}`;
const MID_SHARED = `mid-shared-${tag}`;
const MID_OWNED = `mid-owned-${tag}`;
const MID_UNKNOWN = `mid-unknown-${tag}`;

let app: FastifyInstance;
/** The organisation META_ORG_ID names — the one that used to collect everything. */
let fallbackOrg: string;
/** The organisation that actually registered the page for Messenger. */
let ownerOrg: string;

const messagesFor = async (mid: string) =>
  db.select().from(inboxMessages).where(eq(inboxMessages.providerMessageId, mid));

const allMessagesOf = async (orgId: string) =>
  db.select({ id: inboxMessages.id }).from(inboxMessages).where(eq(inboxMessages.orgId, orgId));

/** handlePayload is dispatched with `void`, so rows are waited for. */
async function waitForMessage(
  mid: string,
  timeoutMs = 4000,
): Promise<Array<{ [k: string]: unknown }>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = (await messagesFor(mid)) as Array<{ [k: string]: unknown }>;
    if (rows.length > 0) return rows;
    if (Date.now() > deadline) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const messengerEvent = (pageId: string, mid: string) => ({
  object: 'page',
  entry: [
    {
      id: pageId,
      time: Date.now(),
      messaging: [
        {
          sender: { id: PSID },
          recipient: { id: pageId },
          timestamp: Date.now(),
          message: { mid, text: 'dobry den, mate to skladem?' },
        },
      ],
    },
  ],
});

const post = async (pageId: string, mid: string) => {
  const payload = JSON.stringify(messengerEvent(pageId, mid));
  return app.inject({
    method: 'POST',
    url: '/webhook/meta',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${createHmac('sha256', APP_SECRET).update(payload).digest('hex')}`,
    },
    payload,
  });
};

const prev = {
  enable: process.env.ENABLE_META_WEBHOOK,
  secret: process.env.META_APP_SECRET,
  orgEnv: process.env.META_ORG_ID,
};

beforeAll(async () => {
  process.env.ENABLE_META_WEBHOOK = 'true';
  process.env.META_APP_SECRET = APP_SECRET;

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();

  const [fb] = await db
    .insert(organizations)
    .values({ name: 'meta fallback', slug: `meta-fb-${tag}` })
    .returning({ id: organizations.id });
  fallbackOrg = fb!.id;

  const [own] = await db
    .insert(organizations)
    .values({ name: 'meta owner', slug: `meta-own-${tag}` })
    .returning({ id: organizations.id });
  ownerOrg = own!.id;

  // META_ORG_ID names the fallback organisation, as a single-tenant deployment
  // that later gained a second tenant would have left it.
  process.env.META_ORG_ID = fallbackOrg;

  // The collision the unique key allows: one page id, two organisations, two
  // channels. The fallback org's instagram row is inserted first so that an
  // unfiltered `limit 1` lands on it rather than on the right one by accident.
  await db.insert(metaPageMappings).values({
    orgId: fallbackOrg,
    pageId: PAGE_SHARED,
    channel: 'instagram',
    pageName: `ig ${PAGE_SHARED}`,
    active: true,
  });
  await db.insert(metaPageMappings).values({
    orgId: ownerOrg,
    pageId: PAGE_SHARED,
    channel: 'messenger',
    pageName: `fb ${PAGE_SHARED}`,
    active: true,
  });
  await db.insert(metaPageMappings).values({
    orgId: ownerOrg,
    pageId: PAGE_OWNED,
    channel: 'messenger',
    pageName: `fb ${PAGE_OWNED}`,
    active: true,
  });
}, 120_000);

afterAll(async () => {
  for (const mid of [MID_SHARED, MID_OWNED, MID_UNKNOWN]) {
    await db.delete(inboxMessages).where(eq(inboxMessages.providerMessageId, mid));
  }
  for (const orgId of [fallbackOrg, ownerOrg]) {
    if (!orgId) continue;
    await db.delete(metaPageMappings).where(eq(metaPageMappings.orgId, orgId));
    await db.delete(inboxMessages).where(eq(inboxMessages.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  for (const [k, v] of Object.entries({
    ENABLE_META_WEBHOOK: prev.enable,
    META_APP_SECRET: prev.secret,
    META_ORG_ID: prev.orgEnv,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await app?.close();
}, 120_000);

describe('an incoming Meta message belongs to the org that registered the page', () => {
  it('a Messenger event goes to the org that registered the page for Messenger', async () => {
    // The page id is registered twice — instagram by one org, messenger by
    // another — and the payload says which this is (`object: 'page'`).
    const fallbackBefore = await allMessagesOf(fallbackOrg);

    const res = await post(PAGE_SHARED, MID_SHARED);
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const rows = await waitForMessage(MID_SHARED);
    expect(rows, 'the handler never reached the inbox insert').toHaveLength(1);
    expect(rows[0]!.orgId, 'the message landed in the wrong organisation').toBe(ownerOrg);
    expect(rows[0]!.channel).toBe('messenger');
    expect(rows[0]!.threadId).toBe(PSID);
    expect(rows[0]!.senderId).toBe(PSID);
    expect(rows[0]!.providerMessageId).toBe(MID_SHARED);
    expect(rows[0]!.content).toBe('dobry den, mate to skladem?');
    expect(rows[0]!.isOutbound).toBe(false);

    // And the other claimant's inbox is exactly what it was.
    expect((await allMessagesOf(fallbackOrg)).map((r) => r.id).sort()).toEqual(
      fallbackBefore.map((r) => r.id).sort(),
    );
  });

  it('an unregistered page writes nothing, anywhere, and the answer still comes', async () => {
    // The env fallback: with META_ORG_ID set, this used to be stored as if it
    // belonged to that organisation. The answer stays a 200 — Meta retries and
    // eventually disables a subscription that keeps failing — but it says the
    // page is not registered.
    const fallbackBefore = await allMessagesOf(fallbackOrg);
    const ownerBefore = await allMessagesOf(ownerOrg);

    const res = await post(PAGE_UNKNOWN, MID_UNKNOWN);
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', warning: 'Page not registered' });

    expect(
      await waitForMessage(MID_UNKNOWN, 1500),
      'a stranger’s message was filed under META_ORG_ID',
    ).toHaveLength(0);
    expect((await allMessagesOf(fallbackOrg)).map((r) => r.id).sort()).toEqual(
      fallbackBefore.map((r) => r.id).sort(),
    );
    expect((await allMessagesOf(ownerOrg)).map((r) => r.id).sort()).toEqual(
      ownerBefore.map((r) => r.id).sort(),
    );
  });

  it('a page only one org registered still works', async () => {
    // Negative control: the channel filter and the removed fallback must not
    // turn the ordinary case off.
    const res = await post(PAGE_OWNED, MID_OWNED);
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const rows = await waitForMessage(MID_OWNED);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.orgId).toBe(ownerOrg);
    expect(rows[0]!.channel).toBe('messenger');
    expect(rows[0]!.content).toBe('dobry den, mate to skladem?');
  });
});
