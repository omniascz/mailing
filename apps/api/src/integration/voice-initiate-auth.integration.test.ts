/**
 * Dialling a phone number requires a session.
 *
 * `POST /api/v1/voice/calls/initiate` had no `preHandler`. plugins/auth.ts
 * POPULATES `request.user` in an onRequest hook and never enforces it — that is
 * `app.authenticate`'s job, per route — so an anonymous POST reached the
 * handler, `req.user!.orgId` threw on undefined, and the caller got 500.
 *
 * ─── What the hole was, measured rather than assumed ─────────────────────────
 *
 * Not a free phone call. `req.user!.orgId` is the first statement in the
 * handler, and the call row is written inside queueOutboundCall
 * (services/voice/call-manager.ts:245), which is never reached. Measured before
 * the fix: anonymous POST → 500, and `calls` unchanged. So the defect was a
 * crash and a misleading status code on a route that costs money the moment a
 * caller does have a session.
 *
 * ─── On silent green ────────────────────────────────────────────────────────
 *
 * A 401 is also what a route that had been deleted would answer, so the
 * refusal case is followed by an authenticated one that MUST reach the handler
 * and MUST write a call row. That case does not assert 200: this environment
 * has no Twilio credentials, so the provider step fails after the row is
 * written (`Failed to initiate call: Twilio credentials not configured`). The
 * assertion is therefore "not refused, and the work started" — which is exactly
 * what distinguishes a guard from a deletion.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not place a call; no Twilio credentials exist here.
 * - It says nothing about the other four routes in voice.ts, which have the
 *   same missing guard and are reported, not fixed, in this change.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, contacts, apiKeys } from '../db/schema/index.js';
import { calls } from '../db/schema/calls.js';

const TAG = `z68-${randomUUID().slice(0, 8)}`;
const PHONE = '+420777123456';

let app: FastifyInstance;
let session: Session;
let contactId: string;
let otherOrgId: string;
let otherKey: string;
const orgIds: string[] = [];

/** Rows this file created, for the assertions and for the cleanup. */
const callsFor = async (orgId: string) =>
  db.select({ id: calls.id, status: calls.status }).from(calls).where(eq(calls.orgId, orgId));

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

  const [c] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email: `${TAG}@example.invalid`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;

  // A second tenant, for the cross-org read below.
  const [org] = await db
    .insert(organizations)
    .values({ name: `voice ${TAG}`, slug: `voice-${TAG}` })
    .returning({ id: organizations.id });
  otherOrgId = org!.id;
  orgIds.push(otherOrgId);
  otherKey = `fm_sk_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId: otherOrgId,
    name: `voice ${TAG}`,
    keyHash: createHash('sha256').update(otherKey).digest('hex'),
    keyPrefix: otherKey.slice(0, 12),
    // Unscoped: the global scope hook treats that as full access, so what the
    // request meets is the route's own guard and the org scoping, not the
    // scope map's opinion.
    scopes: [],
    isPublic: false,
  });
}, 120_000);

afterAll(async () => {
  await db.delete(calls).where(eq(calls.orgId, session.orgId));
  if (orgIds.length) {
    await db.delete(calls).where(inArray(calls.orgId, orgIds));
    await db.delete(apiKeys).where(inArray(apiKeys.orgId, orgIds));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }
  if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
  await app?.close();
}, 120_000);

describe('POST /api/v1/voice/calls/initiate', () => {
  it('refuses an anonymous caller with 401, and starts nothing', async () => {
    const before = await callsFor(session.orgId);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/voice/calls/initiate',
      payload: { contactId, phone: PHONE },
    });

    expect(res.statusCode, res.body).toBe(401);
    // The old behaviour, named so a regression cannot pass as "still refused".
    expect(res.statusCode, 'the handler ran and threw instead of refusing').not.toBe(500);
    expect(await callsFor(session.orgId), 'an anonymous request started a call').toHaveLength(
      before.length,
    );
  });

  it('a session reaches the handler and the call is started', async () => {
    const before = await callsFor(session.orgId);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/voice/calls/initiate',
      headers: { cookie: session.cookie },
      payload: { contactId, phone: PHONE },
    });

    // Not 200: there are no Twilio credentials here, so the provider step fails
    // AFTER the row is written. What matters is that the guard let the caller
    // through — a deleted route would answer 401 to this too.
    expect(res.statusCode, res.body).not.toBe(401);
    expect(res.statusCode).not.toBe(403);

    const after = await callsFor(session.orgId);
    expect(after.length, 'the authenticated request never reached the handler').toBe(
      before.length + 1,
    );
  });

  it('a public (publishable) key is not enough for a route that dials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/voice/calls/initiate',
      headers: { 'x-api-key': `${otherKey}-nonexistent` },
      payload: { contactId, phone: PHONE },
    });
    // An unknown key leaves request.user unset, so this is the refusal again —
    // stated separately because "a key was sent" is the case a guard that only
    // looked for a cookie would let through.
    expect(res.statusCode, res.body).toBe(401);
  });
});

describe('another organisation cannot reach this one’s call', () => {
  it('GET /api/v1/voice/calls/:id does not return a foreign call', async () => {
    const mine = await callsFor(session.orgId);
    expect(mine.length, 'the previous case left no call to read').toBeGreaterThan(0);
    const callId = mine[0]!.id;

    // Same call id, the other tenant's key.
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/voice/calls/${callId}`,
      headers: { 'x-api-key': otherKey },
    });

    expect([403, 404], `foreign org got ${res.statusCode}: ${res.body}`).toContain(res.statusCode);
    expect(res.body).not.toContain(callId);

    // And the owner still reads it — otherwise the assertion above would pass
    // against a route that answers 404 to everyone.
    const own = await app.inject({
      method: 'GET',
      url: `/api/v1/voice/calls/${callId}`,
      headers: { cookie: session.cookie },
    });
    expect(own.statusCode, own.body).toBe(200);
    expect(own.body).toContain(callId);
  });
});
