/**
 * An RCS delivery status is written onto our own message, not any tenant's.
 *
 * ─── What went wrong ─────────────────────────────────────────────────────────
 *
 * `updateStatus` in services/rcs/index.ts wrote:
 *
 *     .update(rcsMessages).set(patch).where(eq(rcsMessages.id, messageId))
 *
 * and `PATCH /api/v1/rcs/messages/:id/status` handed it the id straight out of
 * the path. The route authenticates its caller and then never looks at which
 * tenant they are — `req.user.orgId` appears nowhere in that handler — so any
 * logged-in account could set the status, the delivery timestamp, the provider
 * id and the error text on another organization's message.
 *
 * ─── Why it was not in the org-scope audit ───────────────────────────────────
 *
 * The audit is the triage of one lint rule's warnings, and that rule exempts
 * `update(t).where(eq(t.id, x))` as a lookup by primary key. It never reported
 * this line, so there was nothing to triage. Found by the sweep in Z82 instead.
 *
 * ─── How this is asserted ────────────────────────────────────────────────────
 *
 * Over the row, field by field: org B's message is read before and after and
 * compared whole. A refusal alone would also be satisfied by a route that had
 * stopped working, so the case that must pass — the same call against the
 * caller's own message — runs right after, and the worker's call shape is
 * exercised too, because the sender worker is the other caller of this function.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts } from '../db/schema/index.js';
import { rcsMessages } from '../db/schema/rcs.js';
import { updateStatus } from '../services/rcs/index.js';

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let tokenA: string;
let contactA: string;
let contactB: string;
/** Org B's message — the row a foreign status update must not touch. */
let bMessageId: string;
/** Org A's own message, for the case that must pass. */
let aMessageId: string;

async function registerOrg(label: string): Promise<{ orgId: string; token: string }> {
  const tag = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    remoteAddress: `198.51.107.${Math.floor(Math.random() * 200) + 30}`,
    payload: {
      email: `rcs-${tag}@example.test`,
      password: 'RcsTenant1234!',
      name: 'Rcs Tenant',
      orgName: `Rcs Tenant ${tag}`,
    },
  });
  if (res.statusCode !== 201 && res.statusCode !== 200) {
    throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { token?: string; user?: { orgId?: string } };
  if (!body.user?.orgId || !body.token) throw new Error(`register gave no org/token: ${res.body}`);
  return { orgId: body.user.orgId, token: body.token };
}

async function makeContact(orgId: string): Promise<string> {
  const [row] = await db
    .insert(contacts)
    .values({
      orgId,
      email: `rcs-${randomUUID().slice(0, 8)}@tenant.test`,
      phone: `+4207${Math.floor(Math.random() * 90_000_000 + 10_000_000)}`,
    })
    .returning({ id: contacts.id });
  return row!.id;
}

async function makeMessage(orgId: string, contactId: string): Promise<string> {
  const [row] = await db
    .insert(rcsMessages)
    .values({
      orgId,
      contactId,
      phone: '+420700000000',
      messageType: 'text',
      payload: { text: 'hello' },
      status: 'queued',
    })
    .returning({ id: rcsMessages.id });
  return row!.id;
}

const messageRow = (id: string) =>
  db.select().from(rcsMessages).where(eq(rcsMessages.id, id)).limit(1);

beforeAll(async () => {
  app = await createTestApp();
  const a = await registerOrg('a');
  const b = await registerOrg('b');
  orgA = a.orgId;
  tokenA = a.token;
  orgB = b.orgId;

  contactA = await makeContact(orgA);
  contactB = await makeContact(orgB);
  aMessageId = await makeMessage(orgA, contactA);
  bMessageId = await makeMessage(orgB, contactB);
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('an RCS status update cannot reach another org’s message', () => {
  it('leaves org B’s message exactly as it was', async () => {
    const before = (await messageRow(bMessageId))[0];
    expect(before, 'fixture missing: org B has no message').toBeDefined();
    expect(before!.status).toBe('queued');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/rcs/messages/${bMessageId}/status`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { status: 'delivered', providerId: 'forged-provider-id', error: 'forged error' },
    });

    // The row first: the defect was the write, and a status assertion ahead of
    // it would say nothing about what was stored.
    expect(
      (await messageRow(bMessageId))[0],
      "org A set the delivery status on org B's RCS message — updateStatus keyed the update by " +
        'message id alone and the route never looked at the caller’s org',
    ).toEqual(before);

    // The route answers, it does not crash. 204 either way: the caller learns
    // nothing about whether that id exists in some other tenant.
    expect([204, 404]).toContain(res.statusCode);
  }, 120_000);

  it('still records the status on the caller’s own message', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/rcs/messages/${aMessageId}/status`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { status: 'delivered', providerId: 'prov-123' },
    });
    expect(res.statusCode, res.body.slice(0, 300)).toBe(204);

    const [row] = await messageRow(aMessageId);
    expect(row, 'the org’s own message vanished').toBeDefined();
    expect(row!.orgId).toBe(orgA);
    expect(row!.status, 'the org’s own status update stopped working').toBe('delivered');
    expect(row!.deliveredAt).toBeInstanceOf(Date);
    expect(row!.providerId).toBe('prov-123');
  }, 120_000);
});

describe('negative control — the sender worker’s call still writes', () => {
  it('marks a message sent through the same function the worker uses', async () => {
    const id = await makeMessage(orgA, contactA);

    // apps/workers/src/jobs/rcs-sender.ts calls exactly this, with orgId taken
    // from its job payload.
    await updateStatus(orgA, id, 'sent', { providerId: 'worker-provider-id' });

    const [row] = await messageRow(id);
    expect(row!.status).toBe('sent');
    expect(row!.sentAt).toBeInstanceOf(Date);
    expect(row!.providerId).toBe('worker-provider-id');
  }, 120_000);

  it('does nothing when the org does not own the message', async () => {
    const before = (await messageRow(bMessageId))[0];
    await updateStatus(orgA, bMessageId, 'failed', { error: 'should not land' });
    expect((await messageRow(bMessageId))[0]).toEqual(before);
  }, 120_000);
});
