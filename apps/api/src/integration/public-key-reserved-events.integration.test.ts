/**
 * A publishable key may not send ticketing.* events (Z161).
 *
 * Michal, 15. 10. 19:40, point 1c d): "measure it first; if it holds, limit
 * ticketing.* to the secret key / the ingest". It held — measured on master
 * c1eae8c by apps/workers/src/integration/public-key-ticketing-events: a
 * publishable key on POST /api/v1/events with ticketing.order_paid started the
 * flow, and its transactional node reached unsubscribed, complained, pending
 * and non_subscribed contacts. The key is in the page source.
 *
 * This file is the route's side of the rule, through the real app:
 *   - a publishable key with ticketing.* (any case) → 403 EVENT_NAME_RESERVED,
 *     the same body for a contact that exists and one that does not, and no
 *     workflow_events row;
 *   - unchanged: a publishable key with any other name, a secret key and a
 *     session with ticketing.*, and the ticketing ingest with a secret key;
 *   - the ingest refuses a publishable key (requireAuth), before and after.
 *
 * WHAT THIS FILE CANNOT SEE
 * - Flows, queues and the workers: the workers file walks those.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { apiKeys, contacts, workflowEvents } from '../db/schema/index.js';

const TAG = `z161-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let publicKey: string;
let secretKey: string;
let contactId: string;
const contactIds: string[] = [];

async function newKey(isPublic: boolean): Promise<string> {
  const raw = `${isPublic ? 'fm_pub_' : 'fm_live_'}${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId: session.orgId,
    userId: session.userId,
    name: `${TAG} ${isPublic ? 'public' : 'secret'}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    isPublic,
  });
  return raw;
}

const rowsFor = async (id: string) =>
  (
    await db
      .select({ eventName: workflowEvents.eventName })
      .from(workflowEvents)
      .where(and(eq(workflowEvents.orgId, session.orgId), eq(workflowEvents.contactId, id)))
  ).map((r) => r.eventName);

function post(url: string, headers: Record<string, string>, payload: unknown) {
  return app.inject({ method: 'POST', url, headers, payload: payload as object });
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  publicKey = await newKey(true);
  secretKey = await newKey(false);
  const [c] = await db
    .insert(contacts)
    .values({ orgId: session.orgId, email: `${TAG}@example.invalid`, status: 'unsubscribed' })
    .returning({ id: contacts.id });
  contactId = c!.id;
  contactIds.push(contactId);
}, 60_000);

afterAll(async () => {
  const ingested = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.email, `${TAG}-ingest@example.invalid`));
  contactIds.push(...ingested.map((r) => r.id));
  if (contactIds.length) {
    await db.delete(workflowEvents).where(inArray(workflowEvents.contactId, contactIds));
    await db.delete(contacts).where(inArray(contacts.id, contactIds));
  }
  await db.delete(apiKeys).where(inArray(apiKeys.name, [`${TAG} public`, `${TAG} secret`]));
  await app?.close();
});

describe('publishable key and ticketing.* on POST /api/v1/events (Z161)', () => {
  it.each(['ticketing.order_paid', 'ticketing.event_changed', 'Ticketing.Order_Paid'])(
    'a publishable key with %s → 403 EVENT_NAME_RESERVED, nothing stored',
    async (eventName) => {
      const res = await post(
        '/api/v1/events',
        { 'x-api-key': publicKey },
        { contactId, eventName, properties: { orderId: 'z161' } },
      );
      expect(res.statusCode, res.body).toBe(403);
      expect(res.json()).toEqual({
        code: 'EVENT_NAME_RESERVED',
        message: 'A publishable key cannot send this event',
        statusCode: 403,
      });
      expect(await rowsFor(contactId)).not.toContain(eventName);
    },
  );

  it('the 403 is the same for a contact that exists, one that does not, and an address', async () => {
    const send = (who: Record<string, string>) =>
      post(
        '/api/v1/events',
        { 'x-api-key': publicKey },
        { ...who, eventName: 'ticketing.order_paid' },
      );
    const existing = await send({ contactId });
    const missing = await send({ contactId: randomUUID() });
    const byEmail = await send({ contactEmail: `${TAG}@example.invalid` });
    console.log(`[z161] 403 existing: ${existing.statusCode} ${existing.body}`);
    console.log(`[z161] 403 missing:  ${missing.statusCode} ${missing.body}`);
    console.log(`[z161] 403 email:    ${byEmail.statusCode} ${byEmail.body}`);
    expect(existing.statusCode).toBe(403);
    expect(missing.statusCode).toBe(403);
    expect(byEmail.statusCode).toBe(403);
    expect(missing.body).toBe(existing.body);
    expect(byEmail.body).toBe(existing.body);
  });

  it('unchanged: a publishable key with another name is accepted', async () => {
    const res = await post(
      '/api/v1/events',
      { 'x-api-key': publicKey },
      { contactId, eventName: 'viewed_product' },
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(await rowsFor(contactId)).toContain('viewed_product');
  });

  it('unchanged: a secret key and a session may send ticketing.order_paid', async () => {
    const bySecret = await post(
      '/api/v1/events',
      { 'x-api-key': secretKey },
      { contactId, eventName: 'ticketing.order_paid' },
    );
    expect(bySecret.statusCode, bySecret.body).toBe(200);
    const bySession = await post(
      '/api/v1/events',
      { authorization: `Bearer ${session.token}` },
      { contactId, eventName: 'ticketing.event_changed' },
    );
    expect(bySession.statusCode, bySession.body).toBe(200);
    const names = await rowsFor(contactId);
    expect(names).toContain('ticketing.order_paid');
    expect(names).toContain('ticketing.event_changed');
  });
});

describe('the ticketing ingest (Z161 probe 2)', () => {
  const evt = { type: 'order_paid', contact: { email: `${TAG}-ingest@example.invalid` } };

  it('refuses a publishable key', async () => {
    const res = await post('/api/v1/ticketing/events', { 'x-api-key': publicKey }, evt);
    console.log(`[z161] ingest public: ${res.statusCode} ${res.body}`);
    expect(res.statusCode, res.body).toBe(403);
    const made = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.email, evt.contact.email));
    expect(made).toHaveLength(0);
  });

  it('accepts a secret key and fires ticketing.order_paid', async () => {
    const res = await post('/api/v1/ticketing/events', { 'x-api-key': secretKey }, evt);
    console.log(`[z161] ingest secret: ${res.statusCode} ${res.body}`);
    expect(res.statusCode, res.body).toBe(202);
    const data = (res.json() as { data: { contactId: string; triggerFired: string } }).data;
    expect(data.triggerFired).toBe('ticketing.order_paid');
    contactIds.push(data.contactId);
    expect(await rowsFor(data.contactId)).toContain('ticketing.order_paid');
  });
});
