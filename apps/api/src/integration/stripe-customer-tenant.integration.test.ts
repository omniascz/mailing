/**
 * A Stripe customer becomes a contact in the org the event names, not in
 * whichever org already held the address.
 *
 * ─── The other half of the same defect ───────────────────────────────────────
 *
 * `upsertContactWithPurchase` had an unscoped contact lookup and it was fixed;
 * `handleCustomerUpsert`, twenty lines above it, has the identical `where(eq(
 * contacts.email, email))` and a different consequence. It never writes to the
 * row it finds — it only branches on whether one exists:
 *
 *     if (!existing) { insert into orgId }
 *
 * So when another org already holds the address, the condition is false and the
 * function does nothing at all. The org named by the event gets no contact,
 * silently, and the foreign row is neither read from nor written to. The
 * failure is an absence, which is why it survives every test that looks for a
 * wrong write.
 *
 * ─── Why the org in the event can be trusted here ────────────────────────────
 *
 * This endpoint is not a Connect endpoint. `event.account` is never read (the
 * parse at billing/index.ts is `{ type, data: { object } }` and nothing else),
 * there is no Stripe-Account header, no connected-account onboarding, and no
 * `acct_` anywhere in the repository. One account, one secret key, one webhook
 * secret. Metadata on objects in that account is written by our own server —
 * and the payload carrying it is HMAC-gated before any handler runs. So
 * `metadata.orgId` names the org our code named, and scoping the lookup to it
 * is a narrowing, not a new trust assumption.
 *
 * ─── What this asserts ───────────────────────────────────────────────────────
 *
 * Through the real route, so the raw body and the signature are part of the
 * path. Org B holds the address, org A is named by the event; org A must end
 * up with a contact of its own and org B's row must be untouched field for
 * field. The negative control is the direction that a filter can break: when
 * the named org already has the address, no second row may appear.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts } from '../db/schema/index.js';

const SECRET = 'whsec_test_stripe_customer_probe';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let bContactId: string;
const SHARED = `cust-${randomUUID().slice(0, 8)}@tenant.test`;

async function registerOrg(label: string): Promise<string> {
  const tag = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.103.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `stripe-cust-${tag}@example.test`,
      password: 'StripeCust1234!',
      name: 'Stripe Cust',
      orgName: `Stripe Cust ${tag}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { user?: { orgId?: string } };
  const id = body.user?.orgId;
  if (!id) throw new Error(`register returned no org id: ${res.body}`);
  return id;
}

/** A signed customer.created, the way Stripe presents one. */
function postCustomer(namedOrgId: string, email: string, name = 'Ada Lovelace') {
  const payload = JSON.stringify({
    type: 'customer.created',
    data: {
      object: {
        id: `cus_${randomUUID().slice(0, 12)}`,
        email,
        name,
        metadata: { orgId: namedOrgId },
      },
    },
  });
  const ts = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', SECRET).update(`${ts}.${payload}`, 'utf8').digest('hex');
  return app.inject({
    method: 'POST',
    url: '/api/v1/billing/webhook',
    headers: { 'stripe-signature': `t=${ts},v1=${v1}`, 'content-type': 'application/json' },
    payload,
  });
}

const contactRow = (id: string) => db.select().from(contacts).where(eq(contacts.id, id)).limit(1);

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  app = await createTestApp();
  orgA = await registerOrg('a');
  orgB = await registerOrg('b');

  const [row] = await db
    .insert(contacts)
    .values({ orgId: orgB, email: SHARED, firstName: 'Belongs', lastName: 'ToB' })
    .returning({ id: contacts.id });
  bContactId = row!.id;
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('a Stripe customer lands in the org the event names', () => {
  it('creates the contact for org A even though org B already holds the address', async () => {
    const before = (await contactRow(bContactId))[0];

    const res = await postCustomer(orgA, SHARED);
    expect(res.statusCode, `webhook rejected: ${res.body}`).toBe(200);

    const [mine] = await db
      .select({ id: contacts.id, source: contacts.source, firstName: contacts.firstName })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, SHARED)))
      .limit(1);

    expect(
      mine,
      'the event named org A, but org A got no contact — handleCustomerUpsert looked the ' +
        'address up without an org filter, found org B’s row, and took the "already exists" ' +
        'branch, which writes nothing anywhere',
    ).toBeDefined();
    expect(mine!.source).toBe('stripe');
    expect(mine!.firstName).toBe('Ada');

    // Org B's row is untouched, field for field.
    const after = (await contactRow(bContactId))[0];
    expect(after).toEqual(before);
  }, 120_000);
});

describe('negative control — the named org does not get a duplicate', () => {
  it('does nothing when the named org already holds the address', async () => {
    const email = `own-${randomUUID().slice(0, 8)}@tenant.test`;
    const [own] = await db
      .insert(contacts)
      .values({ orgId: orgA, email, firstName: 'Already', lastName: 'Here' })
      .returning({ id: contacts.id });
    const before = (await contactRow(own!.id))[0];

    const res = await postCustomer(orgA, email, 'Someone Else');
    expect(res.statusCode, `webhook rejected: ${res.body}`).toBe(200);

    // Exactly one row, and it is the original — the filter must narrow the
    // lookup, not defeat it into inserting a second copy every time.
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, email)));
    expect(rows.map((r) => r.id)).toEqual([own!.id]);
    expect((await contactRow(own!.id))[0]).toEqual(before);
  }, 120_000);
});
