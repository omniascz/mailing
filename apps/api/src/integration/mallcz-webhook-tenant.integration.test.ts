/**
 * The Mall.cz webhook let the caller pick which organisation to write into.
 *
 *     const orgId = String(event['shop_id'] ?? '');
 *     createContact(orgId, { email, source: 'mallcz' })
 *
 * `shop_id` is Mall.cz's identifier for a shop, not our organisation id, and
 * nothing checked it against anything. Every route in that plugin sits behind a
 * plugin-wide `app.requireAuth` (routes/v1/integrations/mallcz.ts:63), so the
 * caller was always an authenticated user — but any of them, in any
 * organisation and any role, could put another organisation's UUID in the body
 * and have a contact created there. No foreign secret was needed: a login of
 * one's own and the victim's org id were enough.
 *
 * The contact row is not the end of it. createContact emits
 * `contact.created` for the organisation it writes into
 * (services/contacts/index.ts:174), which queues a delivery to that
 * organisation's own configured webhooks carrying the address the caller chose.
 *
 * On silent green: the endpoint answers `{ received: true }` whatever happens —
 * it did before the fix and it does after. A test that only checked the victim
 * would pass just as well against a handler that stopped doing anything at all,
 * so the first case also pins that the caller's own contact WAS created, which
 * is the evidence the request reached the write.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, contacts, socialAccounts } from '../db/schema/index.js';

const tag = randomUUID().slice(0, 8);

/** Addresses, one per case, so no assertion can be satisfied by another's row. */
const EMAIL_CROSS = `mall-cross-${tag}@example.invalid`;
const EMAIL_OWN = `mall-own-${tag}@example.invalid`;
const EMAIL_NOCONN = `mall-noconn-${tag}@example.invalid`;

let app: FastifyInstance;
/** The seeded org — the caller, and the only identity used here. */
let caller: Session;
let victimOrg: string;

const contactsFor = async (orgId: string, email: string) =>
  db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.email, email)));

const allContactsOf = async (orgId: string) =>
  db.select({ id: contacts.id }).from(contacts).where(eq(contacts.orgId, orgId));

async function connectMall(orgId: string, clientId: string): Promise<void> {
  await db.insert(socialAccounts).values({
    orgId,
    platform: 'mallcz',
    platformUserId: 'mallcz',
    platformUsername: clientId,
    accessToken: `key-${clientId}`,
    metadata: { clientId },
    active: true,
  });
}

const webhook = async (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/integrations/mallcz/webhooks',
    headers: { cookie: caller.cookie },
    payload: body,
  });

const orderEvent = (email: string, shopId?: string) => ({
  event: 'order.created',
  ...(shopId === undefined ? {} : { shop_id: shopId }),
  data: { customer: { email, firstName: 'Ada', lastName: 'Lovelace' } },
});

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  caller = await login(app);

  const [org] = await db
    .insert(organizations)
    .values({ name: 'mall victim', slug: `mall-victim-${tag}` })
    .returning({ id: organizations.id });
  victimOrg = org!.id;

  // Both organisations have connected Mall.cz, so "has a connection" cannot be
  // what separates them — only whose request it is.
  await connectMall(caller.orgId, `caller-shop-${tag}`);
  await connectMall(victimOrg, `victim-shop-${tag}`);
}, 60_000);

afterAll(async () => {
  for (const email of [EMAIL_CROSS, EMAIL_OWN, EMAIL_NOCONN]) {
    await db.delete(contacts).where(eq(contacts.email, email));
  }
  await db.delete(socialAccounts).where(eq(socialAccounts.orgId, victimOrg));
  await db
    .delete(socialAccounts)
    .where(and(eq(socialAccounts.orgId, caller.orgId), eq(socialAccounts.platform, 'mallcz')));
  await db.delete(contacts).where(eq(contacts.orgId, victimOrg));
  await db.delete(organizations).where(eq(organizations.id, victimOrg));
  await app?.close();
}, 60_000);

describe('a Mall.cz webhook writes into the caller organisation, whatever the body says', () => {
  it('naming another organisation in shop_id creates nothing there', async () => {
    const victimBefore = await allContactsOf(victimOrg);
    expect(await contactsFor(victimOrg, EMAIL_CROSS)).toHaveLength(0);

    // The whole attack: a valid login of one's own, and the victim's org id.
    const res = await webhook(orderEvent(EMAIL_CROSS, victimOrg));
    expect(res.statusCode, `body: ${res.body}`).toBe(200);
    expect(res.json()).toEqual({ received: true });

    // The victim first, because that is where the damage lands: no such row at
    // all, and the organisation's contact set is exactly what it was.
    expect(
      await contactsFor(victimOrg, EMAIL_CROSS),
      'a contact was created in the organisation named by shop_id',
    ).toHaveLength(0);
    const victimAfter = await allContactsOf(victimOrg);
    expect(victimAfter.map((r) => r.id).sort()).toEqual(victimBefore.map((r) => r.id).sort());

    // Then: did the handler reach the write at all? It did — into the caller's
    // own organisation, which is where the row belongs. Without this the
    // assertion above would also hold for a handler that does nothing.
    const own = await contactsFor(caller.orgId, EMAIL_CROSS);
    expect(own, 'the handler never reached createContact').toHaveLength(1);
    expect(own[0]!.orgId).toBe(caller.orgId);
    expect(own[0]!.source).toBe('mallcz');
  });

  it('a legitimate event with no shop_id creates the contact in the caller org', async () => {
    // Negative control: the scope must not turn the feature off.
    const res = await webhook(orderEvent(EMAIL_OWN));
    expect(res.statusCode).toBe(200);

    const rows = await contactsFor(caller.orgId, EMAIL_OWN);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.orgId).toBe(caller.orgId);
    expect(rows[0]!.email).toBe(EMAIL_OWN);
    expect(rows[0]!.source).toBe('mallcz');
    expect(await contactsFor(victimOrg, EMAIL_OWN)).toHaveLength(0);
  });

  it('an organisation with no Mall.cz connection gets nothing, and the answer still comes', async () => {
    // Negative control: the mapping is what authorises the write, so an
    // organisation that never connected Mall.cz must not receive its contacts —
    // and the endpoint must still answer, because senders retry on anything else.
    await db
      .update(socialAccounts)
      .set({ active: false })
      .where(and(eq(socialAccounts.orgId, caller.orgId), eq(socialAccounts.platform, 'mallcz')));

    const res = await webhook(orderEvent(EMAIL_NOCONN));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });

    expect(await contactsFor(caller.orgId, EMAIL_NOCONN)).toHaveLength(0);
    expect(await contactsFor(victimOrg, EMAIL_NOCONN)).toHaveLength(0);

    // Put it back, so the file leaves the seeded org as it found it.
    await db
      .update(socialAccounts)
      .set({ active: true })
      .where(and(eq(socialAccounts.orgId, caller.orgId), eq(socialAccounts.platform, 'mallcz')));
  });
});
