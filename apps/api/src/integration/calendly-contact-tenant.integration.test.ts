/**
 * A Calendly booking creates a contact in the org whose connection received it.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * `processCalendlyEvent` resolved the invitee with `where(eq(contacts.email,
 * invitee.email))` and no org. Everything downstream then used that id under
 * the RECEIVING org: a deal row (`orgId` = receiver, `contactId` = whoever's),
 * and `onApiEvent`, which writes a `workflow_events` row pairing the two and
 * looks for workflows in the receiving org to start on it.
 *
 * So the booking a customer made with org A could attach itself to org B's
 * contact — putting another tenant's person into org A's pipeline and into
 * whatever automation org A has hanging off the Calendly trigger — while org A
 * never got a contact of its own for the person who actually booked.
 *
 * ─── Why the org here can be trusted ─────────────────────────────────────────
 *
 * The receiver takes `orgId` from the query string, which alone would prove
 * nothing — but it then loads THAT org's `webhook_signing_key` and verifies the
 * body against it (routes/v1/integrations/calendly.ts:131-158). Passing means
 * holding the named org's secret, so the id is bound to a per-org credential
 * rather than asserted by the caller.
 *
 * ─── Tested at the service, and why ──────────────────────────────────────────
 *
 * Through `processCalendlyEvent` rather than the HTTP route, because nothing in
 * this repository ever writes `calendly_connections.webhook_signing_key` — the
 * connect flow has no field for it, so the route fail-closes on every request
 * today (the comment at calendly.ts:141-150 says so). Driving the route would
 * test the refusal, not this. The service is the unit the route calls once the
 * signature passes, and it is where the org is used.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, deals, pipelines, workflowEvents } from '../db/schema/index.js';
import { calendlyConnections } from '../db/schema/calendly.js';
import { processCalendlyEvent } from '../integrations/calendly/webhook.js';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let bContactId: string;
let pipelineA: string;
const SHARED = `cal-${randomUUID().slice(0, 8)}@tenant.test`;
const TRIGGER = 'calendly_booked';

async function registerOrg(label: string): Promise<string> {
  const tag = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.104.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `cal-${tag}@example.test`,
      password: 'CalTenant1234!',
      name: 'Cal Tenant',
      orgName: `Cal Tenant ${tag}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const id = (res.json() as { user?: { orgId?: string } }).user?.orgId;
  if (!id) throw new Error(`register returned no org id: ${res.body}`);
  return id;
}

/** The shape processCalendlyEvent reads out of an invitee.created payload. */
function booking(email: string, name = 'Ada Lovelace') {
  return {
    event: 'invitee.created',
    payload: {
      invitee: { email, name, first_name: 'Ada', last_name: 'Lovelace' },
      event_type: { name: 'Intro call' },
      scheduled_event: { uri: `https://api.calendly.com/scheduled_events/${randomUUID()}` },
    },
  } as unknown as Parameters<typeof processCalendlyEvent>[1];
}

const contactRow = (id: string) => db.select().from(contacts).where(eq(contacts.id, id)).limit(1);

beforeAll(async () => {
  app = await createTestApp();
  orgA = await registerOrg('a');
  orgB = await registerOrg('b');

  // Org A is the one with the Calendly connection, and it wants both side
  // effects on — the deal and the workflow trigger are where the damage lands.
  await db.insert(calendlyConnections).values({
    orgId: orgA,
    accessToken: 'test-token',
    createDeal: true,
    workflowTrigger: TRIGGER,
  });
  const [p] = await db
    .insert(pipelines)
    .values({
      orgId: orgA,
      name: 'Sales',
      stages: [{ id: 'new', name: 'New', probability: 10, order: 0 }],
    })
    .returning({ id: pipelines.id });
  pipelineA = p!.id;

  // Only org B holds the address.
  const [row] = await db
    .insert(contacts)
    .values({ orgId: orgB, email: SHARED, firstName: 'Belongs', lastName: 'ToB' })
    .returning({ id: contacts.id });
  bContactId = row!.id;
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('a Calendly booking stays inside the org that received it', () => {
  it("does not put org B's contact into org A's pipeline or automation", async () => {
    const before = (await contactRow(bContactId))[0];

    await processCalendlyEvent(orgA, booking(SHARED));

    // Where the damage actually lands — a deal in org A naming org B's person.
    const leakedDeals = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.orgId, orgA), eq(deals.contactId, bContactId)));
    expect(
      leakedDeals,
      "org A's Calendly booking opened a deal on org B's contact — the invitee lookup has no " +
        'org filter, so the booking attaches to whichever tenant held the address first',
    ).toEqual([]);

    const leakedEvents = await db
      .select({ id: workflowEvents.id })
      .from(workflowEvents)
      .where(and(eq(workflowEvents.orgId, orgA), eq(workflowEvents.contactId, bContactId)));
    expect(leakedEvents, "org A's Calendly workflow trigger fired on org B's contact").toEqual([]);

    // And org B's row is untouched, field for field.
    expect((await contactRow(bContactId))[0]).toEqual(before);
  }, 120_000);

  it('gives org A a contact of its own, with the deal and trigger on it', async () => {
    const [mine] = await db
      .select({ id: contacts.id, source: contacts.source, firstName: contacts.firstName })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, SHARED)))
      .limit(1);

    expect(mine, 'the booking was for org A, but org A got no contact').toBeDefined();
    expect(mine!.source).toBe('calendly');
    expect(mine!.firstName).toBe('Ada');

    const own = await db
      .select({ id: deals.id, pipelineId: deals.pipelineId })
      .from(deals)
      .where(and(eq(deals.orgId, orgA), eq(deals.contactId, mine!.id)));
    expect(own.length, 'no deal was opened on org A’s own contact').toBeGreaterThan(0);
    expect(own[0]!.pipelineId).toBe(pipelineA);

    const ev = await db
      .select({ id: workflowEvents.id })
      .from(workflowEvents)
      .where(and(eq(workflowEvents.orgId, orgA), eq(workflowEvents.contactId, mine!.id)));
    expect(ev.length, 'the trigger did not fire on org A’s own contact').toBeGreaterThan(0);
  }, 120_000);
});

describe('negative control — Calendly reuses the org’s own contact', () => {
  it('does not create a second contact when the receiving org already has one', async () => {
    const email = `calown-${randomUUID().slice(0, 8)}@tenant.test`;
    const [own] = await db
      .insert(contacts)
      .values({ orgId: orgA, email, firstName: 'Already', lastName: 'Here' })
      .returning({ id: contacts.id });

    await processCalendlyEvent(orgA, booking(email, 'Someone Else'));

    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgA), eq(contacts.email, email)));
    expect(
      rows.map((r) => r.id),
      'the filter must narrow the lookup, not turn every booking into a new contact',
    ).toEqual([own!.id]);

    const own2 = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.orgId, orgA), eq(deals.contactId, own!.id)));
    expect(own2.length).toBeGreaterThan(0);
  }, 120_000);
});
