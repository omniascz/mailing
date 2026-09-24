/**
 * Sixteen core routes answer 401 instead of crashing.
 *
 * plugins/auth.ts POPULATES `request.user` in an onRequest hook and never
 * enforces it — enforcement is `app.authenticate`, per route. These routes read
 * `req.user!.orgId` without it, so an anonymous request reached the handler and
 * the non-null assertion threw: measured 500, not 401. Sixteen routes in three
 * files: voice 4, newsletter-tiers 7, newsletter-referrals 5.
 *
 * NOT twenty-two, which is what the Z68 sweep said. Six of those were
 * salesforce.ts, and that file guards itself with a scope-level
 * `app.addHook('preHandler', …)` that calls requireAuth for every URL except
 * the OAuth callback. The sweep's classifier only recognised a hook written as
 * a direct reference (`addHook('preHandler', app.requireAuth)`), so an arrow
 * function wrapping the same call read as "no guard". Measured against master:
 * salesforce/status already answered 401 to an anonymous caller. Those six are
 * left alone, and the case below is a control that they still do.
 *
 * ─── What the hole was, and was not ──────────────────────────────────────────
 *
 * Every one of them reads the org from the session and then scopes its query by
 * it, so an anonymous caller got no data — it got a crash and a status code that
 * says "our fault" about a request that was the caller's fault. That is worth
 * fixing on its own: a 500 tells a prober the route exists and ran, it fills the
 * error budget, and the next person to add a line above the `req.user!` read
 * turns it into something worse.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * A 401 is also what a deleted route would answer, so every refusal case is
 * followed by the same call WITH a session, which must reach the handler and
 * return real data. One route per file, so a guard added to one file and
 * forgotten in another cannot pass.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not cover all sixteen routes, only one per file; the sweep is what
 *   covers the rest, and it is re-run in the report.
 * - It says nothing about the softphone WebSocket, which is the one route left
 *   unguarded on purpose: it does not work for anybody (#200 probe) and is out
 *   of scope here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, contacts, apiKeys, newsletterTiers } from '../db/schema/index.js';
import { calls } from '../db/schema/calls.js';

const TAG = `z77-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let contactId: string;
let callId: string;
let tierId: string;
let otherOrgId: string;
let otherKey: string;

const anon = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });

const asUser = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { cookie: session.cookie },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

const asOtherOrg = (method: 'GET', url: string) =>
  app.inject({ method, url, headers: { 'x-api-key': otherKey } });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

  const [c] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email: `${TAG}@example.invalid`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;

  const [call] = await db
    .insert(calls)
    .values({ orgId: session.orgId, contactId, status: 'completed', durationSeconds: 12 })
    .returning({ id: calls.id });
  callId = call!.id;

  const [tier] = await db
    .insert(newsletterTiers)
    .values({
      orgId: session.orgId,
      name: `${TAG} tier`,
      priceAmount: 0,
      currency: 'CZK',
      billingInterval: 'month',
    } as never)
    .returning({ id: newsletterTiers.id });
  tierId = tier!.id;

  // A second tenant, for the cross-org reads.
  const [org] = await db
    .insert(organizations)
    .values({ name: `z77 other ${TAG}`, slug: `z77-other-${TAG}` })
    .returning({ id: organizations.id });
  otherOrgId = org!.id;
  otherKey = `fm_sk_${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId: otherOrgId,
    name: `z77 ${TAG}`,
    keyHash: createHash('sha256').update(otherKey).digest('hex'),
    keyPrefix: otherKey.slice(0, 12),
    scopes: [],
    isPublic: false,
  });
}, 120_000);

afterAll(async () => {
  await db.delete(calls).where(eq(calls.orgId, session.orgId));
  await db
    .delete(newsletterTiers)
    .where(and(eq(newsletterTiers.orgId, session.orgId), like(newsletterTiers.name, `${TAG}%`)));
  if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
  if (otherOrgId) {
    await db.delete(apiKeys).where(eq(apiKeys.orgId, otherOrgId));
    await db.delete(organizations).where(inArray(organizations.id, [otherOrgId]));
  }
  await app?.close();
}, 120_000);

/**
 * One route per file. Each pair is "the refusal" and "the call that must still
 * work" — the second half is what makes the first half a guard rather than a
 * deletion.
 */
describe('voice.ts', () => {
  it('GET /api/v1/voice/calls/:id refuses an anonymous caller with 401', async () => {
    const res = await anon('GET', `/api/v1/voice/calls/${callId}`);
    expect(res.statusCode, res.body).toBe(401);
    expect(res.statusCode, 'the handler ran and threw instead of refusing').not.toBe(500);
  });

  it('and returns the call to its own organisation', async () => {
    const res = await asUser('GET', `/api/v1/voice/calls/${callId}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toContain(callId);
  });

  it('but not to another organisation', async () => {
    const res = await asOtherOrg('GET', `/api/v1/voice/calls/${callId}`);
    expect([403, 404], `foreign org got ${res.statusCode}`).toContain(res.statusCode);
    expect(res.body).not.toContain(callId);
  });
});

describe('newsletter-tiers.ts', () => {
  it('GET /api/v1/newsletter-tiers refuses an anonymous caller with 401', async () => {
    const res = await anon('GET', '/api/v1/newsletter-tiers');
    expect(res.statusCode, res.body).toBe(401);
    expect(res.statusCode).not.toBe(500);
  });

  it('and lists the tiers of the session’s organisation', async () => {
    const res = await asUser('GET', '/api/v1/newsletter-tiers');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toContain(`${TAG} tier`);
  });

  it('but another organisation sees none of them', async () => {
    const res = await asOtherOrg('GET', '/api/v1/newsletter-tiers');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).not.toContain(`${TAG} tier`);
    expect(res.body).not.toContain(tierId);
  });

  it('POST /api/v1/newsletter-tiers/subscribe refuses an anonymous caller', async () => {
    // The one that writes: it takes a contactId from the body and the org from
    // the session, so anonymous access would have been a write on somebody
    // else's contact.
    const res = await anon('POST', '/api/v1/newsletter-tiers/subscribe', {
      contactId,
      tierId,
    });
    expect(res.statusCode, res.body).toBe(401);
    expect(res.statusCode).not.toBe(500);
  });
});

describe('salesforce.ts — already guarded, and still is', () => {
  it('GET .../salesforce/status refuses an anonymous caller with 401', async () => {
    // Guarded by the file's own scope hook, not by this change. Asserted here
    // because the Z68 sweep claimed otherwise and this is what settles it.
    const res = await anon('GET', '/api/v1/integrations/salesforce/status');
    expect(res.statusCode, res.body).toBe(401);
    expect(res.statusCode).not.toBe(500);
  });

  it('and answers the session', async () => {
    const res = await asUser('GET', '/api/v1/integrations/salesforce/status');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toHaveProperty('data');
  });

  it('the OAuth callback stays reachable without a session', async () => {
    // The one URL that scope hook deliberately exempts: the identity provider
    // returns the browser to it, so it has no session by definition.
    const res = await anon('GET', '/api/v1/integrations/salesforce/oauth/callback');
    expect(res.statusCode, res.body).not.toBe(401);
  });
});

describe('newsletter-referrals.ts', () => {
  it('GET .../newsletter-referrals/programs refuses an anonymous caller with 401', async () => {
    const res = await anon('GET', '/api/v1/newsletter-referrals/programs');
    expect(res.statusCode, res.body).toBe(401);
    expect(res.statusCode).not.toBe(500);
  });

  it('and answers the session', async () => {
    const res = await asUser('GET', '/api/v1/newsletter-referrals/programs');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toHaveProperty('data');
  });

  it('the public referral redirect still works without a session', async () => {
    // /r/:code is public by design (config.public) and reads no req.user.
    const res = await anon('GET', `/r/${TAG}-nonexistent`);
    expect(res.statusCode, res.body).not.toBe(401);
  });
});
