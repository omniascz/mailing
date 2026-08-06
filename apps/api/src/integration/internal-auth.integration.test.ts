/**
 * One gate guards /api/v1/internal/*, and it is the internal-auth hook.
 *
 * Every route under that prefix used to carry a second, hand-written check
 * against a legacy env name the API never validated. Where that check used
 * strict equality it answered 401 with an empty body no matter what the caller
 * sent — including `POST /api/v1/internal/events`, which mta-sender calls after
 * every message, so nothing was recorded: no send, no deliver, no bounce, and
 * no A/B variant attribution. Where it used `!secret || …` it was dead code
 * that would spring back to life the moment someone set the legacy name.
 *
 * These tests pin the contract that replaced it: the correct header gets in,
 * a missing or wrong one does not, and `INTERNAL_API_SECRET` is the only name
 * that matters. They talk to a real Postgres — the point of the events case is
 * that a row lands, not that a handler returned 201.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { campaigns, contacts, emailEvents, organizations } from '../db/schema/index.js';

let app: FastifyInstance;
let orgId: string;
let campaignId: string;
let contactId: string;

/** The value the API validates. Deliberately not read from any other name. */
const SECRET = process.env.INTERNAL_API_SECRET;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();

  // A dedicated org, not the seed one. contacts.integration.test.ts asserts an
  // exact contact count for the seed org and the files run concurrently, so a
  // fixture contact parked there fails someone else's test.
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'internal-auth itest',
      slug: `internal-auth-itest-${randomUUID().slice(0, 8)}`,
    })
    .returning({ id: organizations.id });
  orgId = org!.id;

  const [camp] = await db
    .insert(campaigns)
    .values({
      orgId,
      name: `internal-auth-itest ${randomUUID().slice(0, 8)}`,
      subject: 'Internal auth probe',
      status: 'sending',
      type: 'email',
    })
    .returning({ id: campaigns.id });
  campaignId = camp!.id;

  const [c] = await db
    .insert(contacts)
    .values({ orgId, email: `ia-${randomUUID().slice(0, 8)}@test.local`, status: 'active' })
    .returning({ id: contacts.id });
  contactId = c!.id;
});

afterAll(async () => {
  await db.delete(emailEvents).where(eq(emailEvents.campaignId, campaignId));
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  await db.delete(contacts).where(eq(contacts.id, contactId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await app.close();
});

describe('internal-auth guards /api/v1/internal/* on its own', () => {
  it('the suite is running with INTERNAL_API_SECRET set, and only that name', () => {
    // If this is unset the rest of the file proves nothing: every request would
    // be rejected and the "without header" cases would pass for the wrong
    // reason. The legacy name must stay unset — a green run has to mean the
    // routes work off INTERNAL_API_SECRET alone.
    expect(SECRET, 'INTERNAL_API_SECRET must be set for this suite').toBeTruthy();
    expect(process.env.INTERNAL_SECRET ?? '').toBe('');
  });

  it('POST /internal/events records the event, ab_variant_id included', async () => {
    const messageId = `ia-${randomUUID()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/events',
      headers: { 'x-internal-secret': SECRET! },
      payload: {
        type: 'send',
        orgId,
        campaignId,
        contactId,
        messageId,
        metadata: { abVariantId: 'b', isp: 'other' },
      },
    });

    expect(res.statusCode).toBe(201);

    const rows = await db
      .select({
        eventType: emailEvents.eventType,
        abVariantId: emailEvents.abVariantId,
        messageId: emailEvents.messageId,
      })
      .from(emailEvents)
      .where(eq(emailEvents.messageId, messageId));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventType).toBe('send');
    // The A/B winner query filters on `ab_variant_id IS NOT NULL`, so a NULL
    // here means the variant statistics silently see nothing.
    expect(rows[0]!.abVariantId).toBe('b');
  });

  it('POST /internal/events rejects a request with no secret and writes nothing', async () => {
    const messageId = `ia-nosecret-${randomUUID()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/events',
      payload: {
        type: 'send',
        orgId,
        campaignId,
        contactId,
        messageId,
        metadata: { abVariantId: 'b' },
      },
    });

    expect(res.statusCode).toBe(401);
    const rows = await db
      .select({ id: emailEvents.id })
      .from(emailEvents)
      .where(eq(emailEvents.messageId, messageId));
    expect(rows).toHaveLength(0);
  });

  it('POST /internal/events rejects a wrong secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/events',
      headers: { 'x-internal-secret': 'not-the-secret' },
      payload: {
        type: 'send',
        orgId,
        campaignId,
        contactId,
        messageId: `ia-wrong-${randomUUID()}`,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  // One route per file that carried a hand-written check, so a reintroduced
  // duplicate shows up here rather than in production. These assert on the
  // gate, not on what the handler does with a valid request — a 401 means the
  // hook rejected, anything else means it let the request through to a handler
  // that is free to answer 200, 400 or 500 on its own merits.
  const ROUTES: Array<{ method: 'GET' | 'POST'; url: string }> = [
    { method: 'POST', url: '/api/v1/internal/blacklist-check' },
    { method: 'POST', url: '/api/v1/internal/clickhouse/replicate' },
    { method: 'POST', url: '/api/v1/internal/newsletter-tiers/batch' },
    { method: 'POST', url: '/api/v1/internal/ticketing/day-of/tick' },
    { method: 'POST', url: '/api/v1/internal/triggers/daily-run' },
    { method: 'POST', url: '/api/v1/internal/warehouse-sync/run-due' },
    { method: 'POST', url: '/api/v1/internal/workflow/send-email' },
    { method: 'POST', url: '/api/v1/internal/smtp/auth' },
    { method: 'GET', url: '/api/v1/internal/video/pending' },
  ];

  for (const { method, url } of ROUTES) {
    it(`${url} — 401 without the header, past the gate with it`, async () => {
      const without = await app.inject({ method, url, payload: {} });
      expect(without.statusCode).toBe(401);

      const withHeader = await app.inject({
        method,
        url,
        headers: { 'x-internal-secret': SECRET! },
        payload: {},
      });
      // Past the gate. A handler is free to answer 200 or 400 (these are
      // posted an empty body on purpose), but 401 means the gate rejected and
      // 404 means the route moved and this case stopped testing anything.
      expect(withHeader.statusCode).not.toBe(401);
      expect(withHeader.statusCode).not.toBe(404);
    });
  }
});
