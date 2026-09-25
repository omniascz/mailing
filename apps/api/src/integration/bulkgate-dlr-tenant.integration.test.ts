/**
 * A BulkGate delivery report can only move the SMS of the connection it names.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * `POST /api/v1/sms/webhooks/bulkgate/dlr` took `sms_id` out of an
 * unauthenticated body and did:
 *
 *     .update(smsSendLog).where(eq(smsSendLog.providerMessageId, sms_id))
 *
 * across every tenant. Two things followed. Anybody could post a DLR and flip
 * any organization's delivery status; and because every customer brings their
 * own BulkGate account, two accounts issuing the same sms_id would do it
 * without an attacker at all — whichever row matched first was rewritten.
 *
 * Worse than the row: `updateSmsDeliveryStatus` emits `sms.delivered` /
 * `sms.failed` to the owning org's webhooks, carrying the recipient's phone
 * number, contact id and campaign id. A forged report therefore made the
 * customer's own integration fire on an event that never happened.
 *
 * ─── Why a connection id and not a signature ─────────────────────────────────
 *
 * BulkGate documents no way to authenticate the callback: the bulk delivery
 * confirmation page says only "If you want to receive DLR entries to your
 * application, just set up url address on BulkGate Portal" and lists no
 * signature, secret, token or source addresses, and /simple/transactional — the
 * endpoint we send through — has no per-message callback parameter to put one
 * in. What we control is the URL the customer pastes into their own portal, so
 * the connection id goes there and the update is scoped to that org.
 *
 * That binds the report to an organization; it does not authenticate it. The
 * test says so by proving what it does stop: a stranger with no id, and a DLR
 * for one org naming another org's sms_id.
 *
 * ─── How this is asserted ────────────────────────────────────────────────────
 *
 * Over the row, field by field, and over `webhook_deliveries`: the event is the
 * part that leaves the building. The must-pass case runs after the refusals and
 * has to write both.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts } from '../db/schema/index.js';
import { smsRoutes, smsSendLog } from '../db/schema/sms.js';
import { webhooks, webhookDeliveries } from '../db/schema/webhooks.js';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let routeA: string;
let routeB: string;
/** The same provider id in both orgs — two BulkGate accounts can do this. */
const SHARED_SMS_ID = `bg-shared-${randomUUID().slice(0, 8)}`;
let logA: string;
let logB: string;

async function registerOrg(label: string): Promise<string> {
  const tag = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.108.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `bg-${tag}@example.test`,
      password: 'BgTenant1234!',
      name: 'Bg Tenant',
      orgName: `Bg Tenant ${tag}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const id = (res.json() as { user?: { orgId?: string } }).user?.orgId;
  if (!id) throw new Error(`register returned no org id: ${res.body}`);
  return id;
}

async function makeBulkgateRoute(orgId: string): Promise<string> {
  const [row] = await db
    .insert(smsRoutes)
    .values({
      orgId,
      countryCode: 'CZ',
      provider: 'bulkgate',
      priority: 1,
      active: true,
      config: { applicationId: 'app', applicationToken: 'tok' },
    })
    .returning({ id: smsRoutes.id });
  return row!.id;
}

async function makeSendLog(orgId: string, providerMessageId: string): Promise<string> {
  const [contact] = await db
    .insert(contacts)
    .values({ orgId, email: `bg-${randomUUID().slice(0, 8)}@tenant.test` })
    .returning({ id: contacts.id });
  const [row] = await db
    .insert(smsSendLog)
    .values({
      orgId,
      contactId: contact!.id,
      phone: '+420700000001',
      provider: 'bulkgate',
      providerMessageId,
      status: 'sent',
    })
    .returning({ id: smsSendLog.id });
  return row!.id;
}

/** An active webhook subscription, so a fired event leaves a delivery row. */
async function subscribe(orgId: string): Promise<void> {
  await db.insert(webhooks).values({
    orgId,
    url: 'https://hooks.example.invalid/sms',
    secret: 'itest-secret',
    events: ['sms.delivered', 'sms.failed'],
    active: true,
  });
}

const logRow = (id: string) => db.select().from(smsSendLog).where(eq(smsSendLog.id, id)).limit(1);

const deliveriesFor = (orgId: string) =>
  db
    .select({ id: webhookDeliveries.id, event: webhookDeliveries.event })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.orgId, orgId));

beforeAll(async () => {
  app = await createTestApp();
  orgA = await registerOrg('a');
  orgB = await registerOrg('b');
  routeA = await makeBulkgateRoute(orgA);
  routeB = await makeBulkgateRoute(orgB);
  await subscribe(orgA);
  await subscribe(orgB);
  // Both orgs hold a row under the very same provider id.
  logA = await makeSendLog(orgA, SHARED_SMS_ID);
  logB = await makeSendLog(orgB, SHARED_SMS_ID);
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('a BulkGate DLR cannot move another org’s message', () => {
  it('refuses a report with no connection id and leaves both rows untouched', async () => {
    const beforeA = (await logRow(logA))[0];
    const beforeB = (await logRow(logB))[0];
    expect(beforeA!.status).toBe('sent');
    expect(beforeB!.status).toBe('sent');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/sms/webhooks/bulkgate/dlr',
      payload: { sms_id: SHARED_SMS_ID, status: 'delivered' },
    });

    expect(
      (await logRow(logB))[0],
      'an unauthenticated DLR with no connection id marked org B’s SMS delivered',
    ).toEqual(beforeB);
    expect(
      (await logRow(logA))[0],
      'an unauthenticated DLR with no connection id marked org A’s SMS delivered',
    ).toEqual(beforeA);

    expect(res.statusCode, res.body.slice(0, 300)).toBe(400);
  }, 120_000);

  it('reports for org A’s connection do not touch org B’s row or webhooks', async () => {
    const beforeB = (await logRow(logB))[0];
    const deliveriesBefore = await deliveriesFor(orgB);

    // Org A's connection, and the sms_id both orgs happen to hold.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sms/webhooks/bulkgate/dlr/${routeA}`,
      payload: { sms_id: SHARED_SMS_ID, status: 'delivered' },
    });
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);

    expect(
      (await logRow(logB))[0],
      "a DLR posted to org A's connection rewrote org B's row — the update is not scoped by org",
    ).toEqual(beforeB);

    // And nothing was announced to org B. This runs after a write that did
    // happen (org A's, in the same request), so the dispatch has had its turn.
    await new Promise((r) => setTimeout(r, 1500));
    expect(
      await deliveriesFor(orgB),
      'org B’s webhooks fired for a delivery that was not theirs',
    ).toEqual(deliveriesBefore);
  }, 120_000);

  it('records the delivery for the connection that owns it, and fires its webhook', async () => {
    const [row] = await logRow(logA);
    expect(row!.orgId).toBe(orgA);
    expect(row!.status, 'the legitimate report did not land').toBe('delivered');
    expect(row!.deliveredAt).toBeInstanceOf(Date);

    // The event the customer's integration is waiting for.
    let deliveries: Array<{ id: string; event: string }> = [];
    for (let i = 0; i < 20; i++) {
      deliveries = await deliveriesFor(orgA);
      if (deliveries.length > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(deliveries.length, 'no webhook delivery was queued for the owning org').toBeGreaterThan(
      0,
    );
    expect(deliveries.some((d) => d.event === 'sms.delivered')).toBe(true);
  }, 120_000);
});

describe('negative control — the rest of the endpoint behaves', () => {
  it('a connection id that is not BulkGate is refused', async () => {
    const [twilioRoute] = await db
      .insert(smsRoutes)
      .values({
        orgId: orgA,
        countryCode: 'SK',
        provider: 'twilio',
        priority: 2,
        active: true,
        config: { accountSid: 'AC', authToken: 'x' },
      })
      .returning({ id: smsRoutes.id });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sms/webhooks/bulkgate/dlr/${twilioRoute!.id}`,
      payload: { sms_id: SHARED_SMS_ID, status: 'delivered' },
    });
    expect(res.statusCode).toBe(404);
  }, 120_000);

  it('an unknown connection id is refused without saying so', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sms/webhooks/bulkgate/dlr/${randomUUID()}`,
      payload: { sms_id: SHARED_SMS_ID, status: 'delivered' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(SHARED_SMS_ID);
  }, 120_000);

  it('a failed report still records and still fires, for the right org', async () => {
    const smsId = `bg-fail-${randomUUID().slice(0, 8)}`;
    const id = await makeSendLog(orgB, smsId);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sms/webhooks/bulkgate/dlr/${routeB}`,
      payload: { sms_id: smsId, status: 'undelivered' },
    });
    expect(res.statusCode).toBe(200);

    const [row] = await logRow(id);
    expect(row!.status, 'undelivered must map to failed').toBe('failed');

    let events: Array<{ id: string; event: string }> = [];
    for (let i = 0; i < 20; i++) {
      events = (await deliveriesFor(orgB)).filter((d) => d.event === 'sms.failed');
      if (events.length > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(events.length, 'the owning org was not told about the failure').toBeGreaterThan(0);
  }, 120_000);

  it('org A’s own row is not disturbed by org B’s report', async () => {
    const rows = await db
      .select({ status: smsSendLog.status })
      .from(smsSendLog)
      .where(and(eq(smsSendLog.orgId, orgA), eq(smsSendLog.providerMessageId, SHARED_SMS_ID)));
    expect(rows.map((r) => r.status)).toEqual(['delivered']);
  }, 120_000);
});
