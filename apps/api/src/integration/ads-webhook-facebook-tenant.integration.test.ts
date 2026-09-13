/**
 * The Facebook lead webhook does derive the organisation from the payload — it
 * matches the page id Meta sends against ad_accounts.platform_account_id. What
 * it did not do is notice when that match is not unique:
 *
 *     const [account] = await db.select().from(adAccounts)
 *       .where(and(eq(platform, 'facebook_ads'), eq(platformAccountId, pageId)))
 *       .limit(1);
 *
 * ad_accounts is unique on (org_id, platform, platform_account_id) — per
 * organisation. Nothing stops two of them from registering the same identifier,
 * and when they do, `limit 1` hands the lead to whichever row Postgres returns
 * first. That is the same defect as the LinkedIn one, one degree quieter: it
 * needs two organisations to claim one identifier rather than none to claim
 * any, and the loser never learns that its leads went elsewhere.
 *
 * On silent green: this endpoint answers 200 to everything it accepts, and 401
 * to an unsigned request, so "no contact was created" is also what a rejected
 * signature, a 404 and a handler that does nothing all look like. Every case
 * here therefore either asserts the contact that WAS created or pins the status
 * code that proves the request got past verification.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, contacts, adAccounts } from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);
const APP_SECRET = `itest-meta-secret-${tag}`;

/** One address per case, so no assertion can be satisfied by another's row. */
const EMAIL_SHARED = `fb-shared-${tag}@example.invalid`;
const EMAIL_OWNED = `fb-owned-${tag}@example.invalid`;
const EMAIL_UNKNOWN = `fb-unknown-${tag}@example.invalid`;

/** Page ids, as Meta numbers them. */
const PAGE_SHARED = `7100${tag}`;
const PAGE_OWNED = `7200${tag}`;
const PAGE_UNKNOWN = `7900${tag}`;

let app: FastifyInstance;
/** Two organisations that both registered PAGE_SHARED. */
let orgA: string;
let orgB: string;

const contactsFor = async (orgId: string, email: string) =>
  db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)));

const allContactsOf = async (orgId: string) =>
  db.select({ id: contacts.id }).from(contacts).where(eq(contacts.orgId, orgId));

async function connectFacebook(orgId: string, platformAccountId: string): Promise<void> {
  await db.insert(adAccounts).values({
    orgId,
    platform: 'facebook_ads',
    platformAccountId,
    accountName: `facebook ${platformAccountId}`,
    accessToken: `token-${platformAccountId}`,
    active: true,
  });
}

/** A lead-ads change notification as Meta sends it: entry.id is the page. */
const leadNotification = (pageId: string, email: string) => ({
  object: 'page',
  entry: [
    {
      id: pageId,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: 'leadgen',
          value: {
            leadgen_id: `lead-${tag}`,
            page_id: pageId,
            form_id: `form-${tag}`,
            created_time: Math.floor(Date.now() / 1000),
            field_data: [
              { name: 'email', values: [email] },
              { name: 'first_name', values: ['Ada'] },
              { name: 'last_name', values: ['Lovelace'] },
            ],
          },
        },
      ],
    },
  ],
});

/** Signs exactly the bytes it sends — Meta signs the raw body, not the object. */
const webhook = async (body: Record<string, unknown>, sign = true) => {
  const payload = JSON.stringify(body);
  const signature = `sha256=${createHmac('sha256', APP_SECRET).update(payload).digest('hex')}`;
  return app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/ads/facebook/leads',
    headers: {
      'content-type': 'application/json',
      ...(sign ? { 'x-hub-signature-256': signature } : {}),
    },
    payload,
  });
};

beforeAll(async () => {
  // The plugin is off by default and needs both the switch and the secret
  // (lib/webhook-switches.ts:52); the secret is also what the signature is
  // checked against, so the test owns it rather than inheriting one.
  process.env.ENABLE_META_LEAD_ADS_WEBHOOK = 'true';
  process.env.META_APP_SECRET = APP_SECRET;

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();

  const [a] = await db
    .insert(organizations)
    .values({ name: 'facebook a', slug: `fb-a-${tag}` })
    .returning({ id: organizations.id });
  orgA = a!.id;

  const [b] = await db
    .insert(organizations)
    .values({ name: 'facebook b', slug: `fb-b-${tag}` })
    .returning({ id: organizations.id });
  orgB = b!.id;

  // The collision: one page id, two organisations. The unique index is per
  // organisation, so the database accepts both rows.
  await connectFacebook(orgA, PAGE_SHARED);
  await connectFacebook(orgB, PAGE_SHARED);
  // And one page only B registered, for the case that must keep working.
  await connectFacebook(orgB, PAGE_OWNED);
}, 120_000);

afterAll(async () => {
  for (const email of [EMAIL_SHARED, EMAIL_OWNED, EMAIL_UNKNOWN]) {
    await db.delete(contacts).where(eq(contacts.email, email));
  }
  for (const orgId of [orgA, orgB]) {
    if (!orgId) continue;
    await db.delete(adAccounts).where(eq(adAccounts.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  await app?.close();
}, 120_000);

describe('a Facebook lead is written only when the page identifies one organisation', () => {
  it('a page id two organisations claim writes into neither', async () => {
    const aBefore = await allContactsOf(orgA);
    const bBefore = await allContactsOf(orgB);

    const res = await webhook(leadNotification(PAGE_SHARED, EMAIL_SHARED));
    // 200, not 401: the signature was accepted, so the handler ran and the
    // emptiness below is a decision it made, not a rejected request.
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    expect(
      await contactsFor(orgA, EMAIL_SHARED),
      'the lead was handed to one of the two claimants',
    ).toHaveLength(0);
    expect(
      await contactsFor(orgB, EMAIL_SHARED),
      'the lead was handed to one of the two claimants',
    ).toHaveLength(0);
    expect((await allContactsOf(orgA)).map((r) => r.id).sort()).toEqual(
      aBefore.map((r) => r.id).sort(),
    );
    expect((await allContactsOf(orgB)).map((r) => r.id).sort()).toEqual(
      bBefore.map((r) => r.id).sort(),
    );
  });

  it('a page id one organisation claims still creates the contact there', async () => {
    // Negative control: the ambiguity check must not turn the feature off. This
    // is also the evidence that the request reaches the contact upsert at all.
    const aBefore = await allContactsOf(orgA);

    const res = await webhook(leadNotification(PAGE_OWNED, EMAIL_OWNED));
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    const owned = await contactsFor(orgB, EMAIL_OWNED);
    expect(owned, 'the handler never reached the contact upsert').toHaveLength(1);
    expect(owned[0]!.orgId).toBe(orgB);
    expect(owned[0]!.firstName).toBe('Ada');
    expect(owned[0]!.source).toBe('facebook_lead_ads');

    expect(await contactsFor(orgA, EMAIL_OWNED)).toHaveLength(0);
    expect((await allContactsOf(orgA)).map((r) => r.id).sort()).toEqual(
      aBefore.map((r) => r.id).sort(),
    );
  });

  it('a page nobody registered writes nothing, and the answer still comes', async () => {
    // Negative control: no mapping, no organisation — and still a 2xx, because
    // Meta disables a subscription that keeps failing.
    const res = await webhook(leadNotification(PAGE_UNKNOWN, EMAIL_UNKNOWN));
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    expect(await contactsFor(orgA, EMAIL_UNKNOWN)).toHaveLength(0);
    expect(await contactsFor(orgB, EMAIL_UNKNOWN)).toHaveLength(0);
  });

  it('an unsigned request is refused before any of this', async () => {
    // The counterweight to the cases above: they assert 200 to show the
    // handler ran, and this is what a request that does NOT get past
    // verification looks like, so the two can never be confused.
    const res = await webhook(leadNotification(PAGE_OWNED, EMAIL_UNKNOWN), false);
    expect(res.statusCode).toBe(401);
    expect(await contactsFor(orgB, EMAIL_UNKNOWN)).toHaveLength(0);
  });
});
