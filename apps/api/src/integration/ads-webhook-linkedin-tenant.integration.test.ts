/**
 * The LinkedIn lead webhook handed every incoming lead to whichever
 * organisation happened to sit first in ad_accounts.
 *
 *     const campaignId = String(lead.campaignId ?? '');   // read, never used
 *     const [account] = await db.select().from(adAccounts)
 *       .where(eq(adAccounts.platform, 'linkedin_ads'))   // no identifier at all
 *       .limit(1);
 *     await handleLinkedInLead(account.orgId, { ... });
 *
 * There is no org filter and no account filter — the only condition is the
 * platform. Every customer's LinkedIn lead therefore became a contact in one
 * arbitrary organisation, which then fired that organisation's
 * `ad_lead_form_submit` automations (services/ads/lead-sync.ts:86) on a
 * stranger's name, e-mail address and phone number.
 *
 * The payload does carry the answer. LinkedIn's lead notification names the
 * `owner` of the lead, and for `leadType: SPONSORED` that owner is a sponsored
 * ad account URN — `urn:li:sponsoredAccount:<id>` — whose id is exactly what
 * services/ads/accounts.ts:127-133 reads from /adAccounts and stores in
 * ad_accounts.platform_account_id for linkedin_ads (:195).
 *
 * On silent green: the endpoint answers 200 whatever happens, before and after,
 * and an unregistered route would answer 404 with the same empty tables. So the
 * first case does not only check that the wrong organisation stayed empty — it
 * pins that the contact WAS created, in the organisation the payload names.
 * Without that half, every assertion here would also hold for a handler that
 * was never reached.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { organizations, contacts, adAccounts } from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);

/** One address per case, so no assertion can be satisfied by another's row. */
const EMAIL_OWNED = `li-owned-${tag}@example.invalid`;
const EMAIL_UNKNOWN = `li-unknown-${tag}@example.invalid`;
const EMAIL_NOOWNER = `li-noowner-${tag}@example.invalid`;

/** The sponsored ad account ids, as LinkedIn numbers them. */
const ACCOUNT_FIRST = `5100${tag}`;
const ACCOUNT_OWNER = `5200${tag}`;
const ACCOUNT_STRANGER = `5900${tag}`;

let app: FastifyInstance;
/** The organisation that sits first in ad_accounts — the one that used to win. */
let firstOrg: string;
/** The organisation whose ad account the lead actually belongs to. */
let ownerOrg: string;

const contactsFor = async (orgId: string, email: string) =>
  db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)));

const allContactsOf = async (orgId: string) =>
  db.select({ id: contacts.id }).from(contacts).where(eq(contacts.orgId, orgId));

async function connectLinkedIn(orgId: string, platformAccountId: string): Promise<void> {
  await db.insert(adAccounts).values({
    orgId,
    platform: 'linkedin_ads',
    platformAccountId,
    accountName: `linkedin ${platformAccountId}`,
    accessToken: `token-${platformAccountId}`,
    active: true,
  });
}

/** A lead notification as LinkedIn sends it: the owner names the ad account. */
const leadNotification = (email: string, owner?: string) => ({
  leads: [
    {
      ...(owner === undefined ? {} : { owner: { sponsoredAccount: owner } }),
      leadId: `urn:li:leadGenFormResponse:${tag}`,
      campaignId: '4000001',
      formId: 'urn:li:leadGenForm:818',
      fieldValues: [
        { name: 'email', value: email },
        { name: 'first_name', value: 'Ada' },
        { name: 'last_name', value: 'Lovelace' },
      ],
    },
  ],
});

const webhook = async (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/ads/linkedin/leads',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  });

beforeAll(async () => {
  // The plugin is off by default (lib/webhook-switches.ts:52) and is registered
  // as the beyond-core group `ads-webhook` (index.ts:650). Both have to be on
  // for the route to exist at all; buildApp() reads the switch when it runs.
  process.env.ENABLE_META_LEAD_ADS_WEBHOOK = 'true';
  process.env.META_APP_SECRET = process.env.META_APP_SECRET ?? `itest-meta-secret-${tag}`;

  const { createTestApp } = await import('./setup/harness.js');
  app = await createTestApp();
  await app.ready();

  const [first] = await db
    .insert(organizations)
    .values({ name: 'linkedin first', slug: `li-first-${tag}` })
    .returning({ id: organizations.id });
  firstOrg = first!.id;

  const [owner] = await db
    .insert(organizations)
    .values({ name: 'linkedin owner', slug: `li-owner-${tag}` })
    .returning({ id: organizations.id });
  ownerOrg = owner!.id;

  // Both organisations have connected LinkedIn Ads, so "has a connection"
  // cannot be what separates them — only whose ad account the lead names. The
  // first organisation is seeded first, and with several accounts, so that the
  // unfiltered `limit 1` lands on it rather than on the right one by accident.
  await connectLinkedIn(firstOrg, ACCOUNT_FIRST);
  await connectLinkedIn(firstOrg, `${ACCOUNT_FIRST}-b`);
  await connectLinkedIn(firstOrg, `${ACCOUNT_FIRST}-c`);
  await connectLinkedIn(ownerOrg, ACCOUNT_OWNER);
}, 120_000);

afterAll(async () => {
  for (const email of [EMAIL_OWNED, EMAIL_UNKNOWN, EMAIL_NOOWNER]) {
    await db.delete(contacts).where(eq(contacts.email, email));
  }
  for (const orgId of [firstOrg, ownerOrg]) {
    if (!orgId) continue;
    await db.delete(adAccounts).where(eq(adAccounts.orgId, orgId));
    await db.delete(contacts).where(eq(contacts.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  await app?.close();
}, 120_000);

describe('a LinkedIn lead belongs to the organisation that owns the ad account', () => {
  it('the lead lands in the owner organisation, not in the first row of the table', async () => {
    const firstBefore = await allContactsOf(firstOrg);

    const res = await webhook(
      leadNotification(EMAIL_OWNED, `urn:li:sponsoredAccount:${ACCOUNT_OWNER}`),
    );
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    // Where the damage lands first: the organisation that merely sits first in
    // ad_accounts must not have received a stranger's lead, and its contact set
    // must be exactly what it was.
    expect(
      await contactsFor(firstOrg, EMAIL_OWNED),
      'the lead was written into the first organisation in ad_accounts',
    ).toHaveLength(0);
    const firstAfter = await allContactsOf(firstOrg);
    expect(firstAfter.map((r) => r.id).sort()).toEqual(firstBefore.map((r) => r.id).sort());

    // And the evidence that the handler reached the write at all: the contact
    // exists, in the organisation whose ad account the payload names.
    const owned = await contactsFor(ownerOrg, EMAIL_OWNED);
    expect(owned, 'the handler never reached the contact upsert').toHaveLength(1);
    expect(owned[0]!.orgId).toBe(ownerOrg);
    expect(owned[0]!.firstName).toBe('Ada');
    expect(owned[0]!.lastName).toBe('Lovelace');
    expect(owned[0]!.source).toBe('linkedin_lead_gen');
  });

  it('an ad account nobody has connected writes nothing, and the answer still comes', async () => {
    // Negative control: the mapping is what says whose lead this is, so an
    // identifier that maps to no row must not fall back on anything. The answer
    // still has to be a 2xx — LinkedIn retries anything else, forever.
    const firstBefore = await allContactsOf(firstOrg);
    const ownerBefore = await allContactsOf(ownerOrg);

    const res = await webhook(
      leadNotification(EMAIL_UNKNOWN, `urn:li:sponsoredAccount:${ACCOUNT_STRANGER}`),
    );
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    expect(await contactsFor(firstOrg, EMAIL_UNKNOWN)).toHaveLength(0);
    expect(await contactsFor(ownerOrg, EMAIL_UNKNOWN)).toHaveLength(0);
    expect((await allContactsOf(firstOrg)).map((r) => r.id).sort()).toEqual(
      firstBefore.map((r) => r.id).sort(),
    );
    expect((await allContactsOf(ownerOrg)).map((r) => r.id).sort()).toEqual(
      ownerBefore.map((r) => r.id).sort(),
    );
  });

  it('a notification with no owner writes nothing, and the answer still comes', async () => {
    // Negative control on the other side: nothing in the payload says whose
    // lead it is, so there is no organisation to write into.
    const firstBefore = await allContactsOf(firstOrg);
    const ownerBefore = await allContactsOf(ownerOrg);

    const res = await webhook(leadNotification(EMAIL_NOOWNER));
    expect(res.statusCode, `body: ${res.body}`).toBe(200);

    expect(await contactsFor(firstOrg, EMAIL_NOOWNER)).toHaveLength(0);
    expect(await contactsFor(ownerOrg, EMAIL_NOOWNER)).toHaveLength(0);
    expect((await allContactsOf(firstOrg)).map((r) => r.id).sort()).toEqual(
      firstBefore.map((r) => r.id).sort(),
    );
    expect((await allContactsOf(ownerOrg)).map((r) => r.id).sort()).toEqual(
      ownerBefore.map((r) => r.id).sort(),
    );
  });
});
