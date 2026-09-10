/**
 * A Stripe purchase attaches to a contact in the paying org, not to whoever
 * happens to share the address.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * `upsertContactWithPurchase` in services/billing/index.ts resolved the contact
 * with `where(eq(contacts.email, email))` and nothing else. Every other read of
 * that table in the send path carries `org_id`; this one did not, and it is
 * reached from a route anyone on the internet can POST to — the signature is
 * the only gate, and the signature says nothing about which tenant the address
 * belongs to.
 *
 * The row it finds is never written to, which is why this went unnoticed: the
 * damage is one layer along. The id is handed to `onApiEvent(orgId, contactId,
 * 'stripe_purchase', …)`, which inserts a `workflow_events` row pairing the
 * PAYING org with ANOTHER org's contact, and then looks for workflows in the
 * paying org to start on it. Whatever those workflows do — mail the address,
 * tag it, unsubscribe it — they do to somebody else's customer, and the
 * purchase the paying org actually made never lands on a contact of their own.
 *
 * Two orgs sharing an address is not exotic. `contacts` has no unique index on
 * (org_id, email) and every marketing platform has the same person on several
 * customers' lists.
 *
 * ─── What this asserts ───────────────────────────────────────────────────────
 *
 * Driven through the real route rather than the service, because the raw body
 * and the signature are part of the path: index.ts preserves `req.rawBody` and
 * handleStripeWebhook verifies an HMAC over it before any of this runs.
 *
 * The cross-tenant case is asserted on `workflow_events`, not on the contact
 * row — the contact row is identical either way, so a test that only compared
 * contacts would pass against the defect. Org B's row is compared field by
 * field anyway, so that a future change which starts writing to the found
 * contact cannot slip through this file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, workflowEvents } from '../db/schema/index.js';

const SECRET = 'whsec_test_stripe_tenant_probe';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let bContactId: string;
const SHARED = `shared-${randomUUID().slice(0, 8)}@tenant.test`;

/** Register an org and return its id, the way the other suites do. */
async function registerOrg(label: string): Promise<string> {
  const tag = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.102.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `stripe-tenant-${tag}@example.test`,
      password: 'StripeTenant1234!',
      name: 'Stripe Tenant',
      orgName: `Stripe Tenant ${tag}`,
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

/** A signed payment_intent.succeeded, the way Stripe presents one. */
function signedEvent(payingOrgId: string, email: string, amountCents: number) {
  const payload = JSON.stringify({
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: `pi_${randomUUID().slice(0, 12)}`,
        amount_received: amountCents,
        receipt_email: email,
        metadata: { orgId: payingOrgId, email },
      },
    },
  });
  const ts = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', SECRET).update(`${ts}.${payload}`, 'utf8').digest('hex');
  return { payload, signature: `t=${ts},v1=${v1}` };
}

function postWebhook(payingOrgId: string, email: string, amountCents = 4200) {
  const { payload, signature } = signedEvent(payingOrgId, email, amountCents);
  return app.inject({
    method: 'POST',
    url: '/api/v1/billing/webhook',
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    payload,
  });
}

const contactRow = (id: string) => db.select().from(contacts).where(eq(contacts.id, id)).limit(1);

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  app = await createTestApp();
  orgA = await registerOrg('a');
  orgB = await registerOrg('b');

  // Only org B holds the address. Org A is the one that pays.
  const [row] = await db
    .insert(contacts)
    .values({ orgId: orgB, email: SHARED, firstName: 'Belongs', lastName: 'ToB' })
    .returning({ id: contacts.id });
  bContactId = row!.id;
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('a Stripe purchase stays inside the org that paid', () => {
  it("does not attach org A's purchase to org B's contact", async () => {
    const before = (await contactRow(bContactId))[0];

    const res = await postWebhook(orgA, SHARED);
    expect(res.statusCode, `webhook rejected: ${res.body}`).toBe(200);

    // The event the purchase raises must not name another org's contact. This
    // is the assertion that fails without the org filter: the lookup finds
    // org B's row and hands its id to onApiEvent under org A.
    const leaked = await db
      .select({ id: workflowEvents.id })
      .from(workflowEvents)
      .where(and(eq(workflowEvents.orgId, orgA), eq(workflowEvents.contactId, bContactId)));
    expect(
      leaked,
      "org A's stripe_purchase event was raised against org B's contact — the contact lookup " +
        'in upsertContactWithPurchase has no org filter, so a purchase reaches whichever tenant ' +
        'happened to hold the address first',
    ).toEqual([]);

    // And org B's row itself is untouched, field for field.
    const after = (await contactRow(bContactId))[0];
    expect(after).toEqual(before);
  }, 120_000);

  it('creates the contact in the paying org instead', async () => {
    const [mine] = await db
      .select({ id: contacts.id, source: contacts.source })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, SHARED)))
      .limit(1);

    expect(mine, 'org A paid but got no contact of its own').toBeDefined();
    expect(mine!.source).toBe('stripe');

    // The event points at org A's own contact, not at nothing.
    const own = await db
      .select({ id: workflowEvents.id })
      .from(workflowEvents)
      .where(and(eq(workflowEvents.orgId, orgA), eq(workflowEvents.contactId, mine!.id)));
    expect(own.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('negative control — the org that owns the address keeps it', () => {
  it('attaches to the existing contact when the paying org already has one', async () => {
    const email = `own-${randomUUID().slice(0, 8)}@tenant.test`;
    const [own] = await db
      .insert(contacts)
      .values({ orgId: orgA, email, firstName: 'Already', lastName: 'Here' })
      .returning({ id: contacts.id });

    const res = await postWebhook(orgA, email, 999);
    expect(res.statusCode, `webhook rejected: ${res.body}`).toBe(200);

    // Reused, not duplicated: the filter must narrow the lookup, not defeat it.
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, email)));
    expect(rows.map((r) => r.id)).toEqual([own!.id]);

    const ev = await db
      .select({ id: workflowEvents.id })
      .from(workflowEvents)
      .where(and(eq(workflowEvents.orgId, orgA), eq(workflowEvents.contactId, own!.id)));
    expect(ev.length, 'the purchase raised no event on the org’s own contact').toBeGreaterThan(0);
  }, 120_000);
});
