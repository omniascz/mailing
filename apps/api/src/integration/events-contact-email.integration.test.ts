/**
 * POST /api/v1/events identifies the contact by address when the caller has
 * no UUID.
 *
 * A shop's backend knows its customer's e-mail and not our contact id. The
 * Node and Python SDKs have sent `contactEmail` all along; the route required
 * `contactId` and stripped the rest, so an address-only event was a 400 and an
 * event with both silently lost the address (probe Z112).
 *
 * The caller here is the real Node SDK (packages/sdk/src), over HTTP, with a
 * secret key — the shape a merchant backend uses.
 *
 * Two organisations throughout: the address is resolved inside the key's org
 * and nowhere else, and that is asserted in both directions.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * Every success is asserted over workflow_events: the row exists AND belongs
 * to the expected contact. Every refusal is asserted over the same table and
 * over contacts: nothing written, nobody created.
 *
 * WHAT THIS TEST CANNOT SEE
 * - The Python SDK is not run; its request shape (contactId + contactEmail)
 *   is sent through the Node SDK, which takes the same fields.
 * - Workflow runs started by the event are not followed; that is onApiEvent's
 *   own suite. This asserts which contact the event is recorded against.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq, inArray, sql } from 'drizzle-orm';
import { createTestApp } from './setup/harness.js';
import { db } from '../db/client.js';
import { organizations, apiKeys, contacts, workflowEvents } from '../db/schema/index.js';

const TAG = `z113-ce-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let base: string;
const orgIds: string[] = [];

interface NodeSdk {
  events: {
    track(params: {
      contactId?: string;
      contactEmail?: string;
      eventName: string;
      properties?: Record<string, unknown>;
    }): Promise<{ data: { event: { id: string; contactId: string } } }>;
  };
}
type NodeSdkModule = {
  ForgemsgClient: new (opts: { apiKey: string; baseUrl: string; maxRetries?: number }) => NodeSdk;
};
let sdkModule: NodeSdkModule;

interface Tenant {
  orgId: string;
  secretKey: string;
  publicKey: string;
  client: NodeSdk;
}
let A: Tenant;
let B: Tenant;

async function issueKey(orgId: string, isPublic: boolean): Promise<string> {
  const raw = `${isPublic ? 'fm_pub_' : 'fm_live_'}${randomUUID().replace(/-/g, '')}`;
  await db.insert(apiKeys).values({
    orgId,
    name: `events ${TAG}`,
    keyHash: createHash('sha256').update(raw).digest('hex'),
    keyPrefix: raw.slice(0, 12),
    scopes: [],
    isPublic,
  });
  return raw;
}

async function makeTenant(label: string): Promise<Tenant> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `events ${label} ${TAG}`, slug: `${TAG}-${label}` })
    .returning({ id: organizations.id });
  orgIds.push(org!.id);
  const secretKey = await issueKey(org!.id, false);
  const publicKey = await issueKey(org!.id, true);
  const client = new sdkModule.ForgemsgClient({ apiKey: secretKey, baseUrl: base, maxRetries: 0 });
  return { orgId: org!.id, secretKey, publicKey, client };
}

async function addContact(
  orgId: string,
  email: string,
  extra: Partial<typeof contacts.$inferInsert> = {},
): Promise<string> {
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email, status: 'active', ...extra })
    .returning({ id: contacts.id });
  return c!.id;
}

const eventsNamed = (name: string) =>
  db
    .select({ contactId: workflowEvents.contactId, orgId: workflowEvents.orgId })
    .from(workflowEvents)
    .where(eq(workflowEvents.eventName, name));

const contactsWithAddress = (email: string) =>
  db
    .select({ id: contacts.id, orgId: contacts.orgId })
    .from(contacts)
    .where(sql`lower(${contacts.email}) = ${email.toLowerCase()}`);

/** What the SDK threw, as the caller sees it. */
async function refusal(p: Promise<unknown>): Promise<{ statusCode: number; code: string }> {
  try {
    await p;
  } catch (err) {
    const e = err as { statusCode: number; code: string };
    return { statusCode: e.statusCode, code: e.code };
  }
  throw new Error('expected the SDK call to be refused');
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}`;

  const file = path.resolve(__dirname, '../../../../packages/sdk/src/index.ts');
  sdkModule = (await import(pathToFileURL(file).href)) as NodeSdkModule;

  A = await makeTenant('a');
  B = await makeTenant('b');
}, 60_000);

afterAll(async () => {
  if (orgIds.length > 0) await db.delete(organizations).where(inArray(organizations.id, orgIds));
  await app?.close();
});

describe('contactEmail as the identifier', () => {
  it('an address-only event is recorded against that contact', async () => {
    const id = await addContact(A.orgId, `jana-${TAG}@example.test`);
    const name = `${TAG}-order_placed`;

    const res = await A.client.events.track({
      contactEmail: `jana-${TAG}@example.test`,
      eventName: name,
      properties: { total: 1290 },
    });
    expect(res.data.event.contactId).toBe(id);

    const rows = await eventsNamed(name);
    expect(rows.length, 'the event reached the database').toBeGreaterThan(0);
    for (const r of rows) expect(r).toEqual({ contactId: id, orgId: A.orgId });
  }, 30_000);

  it('the address is compared trimmed and case-insensitively', async () => {
    const id = await addContact(A.orgId, `Petr.Novak-${TAG}@Example.test`);
    const name = `${TAG}-case`;

    await A.client.events.track({
      contactEmail: `  petr.novak-${TAG}@example.TEST `,
      eventName: name,
    });
    const rows = await eventsNamed(name);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.contactId).toBe(id);
  }, 30_000);

  it('two rows with one address: the oldest live one, every time', async () => {
    // contacts has no unique index on (org_id, email); this is a state the
    // table allows, so the choice must be deterministic and must skip the
    // soft-deleted.
    const email = `dup-${TAG}@example.test`;
    await addContact(A.orgId, email, {
      createdAt: new Date('2020-01-01T00:00:00Z'),
      deletedAt: new Date('2021-01-01T00:00:00Z'),
    });
    const oldest = await addContact(A.orgId, email.toUpperCase(), {
      createdAt: new Date('2022-01-01T00:00:00Z'),
    });
    await addContact(A.orgId, email, { createdAt: new Date('2023-01-01T00:00:00Z') });

    for (const n of [1, 2]) {
      const name = `${TAG}-dup-${n}`;
      await A.client.events.track({ contactEmail: email, eventName: name });
      const rows = await eventsNamed(name);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(r.contactId).toBe(oldest);
    }
  }, 30_000);

  it('an address nobody in the org has is a 404 — and no contact is created', async () => {
    const email = `nobody-${TAG}@example.test`;
    const name = `${TAG}-nobody`;
    const r = await refusal(A.client.events.track({ contactEmail: email, eventName: name }));
    expect(r).toEqual({ statusCode: 404, code: 'NOT_FOUND' });
    expect(await eventsNamed(name)).toEqual([]);
    expect(await contactsWithAddress(email)).toEqual([]);
  }, 30_000);
});

describe('contactId still works, unchanged', () => {
  it('contactId alone', async () => {
    const id = await addContact(A.orgId, `byid-${TAG}@example.test`);
    const name = `${TAG}-byid`;
    const res = await A.client.events.track({ contactId: id, eventName: name });
    expect(res.data.event.contactId).toBe(id);
    const rows = await eventsNamed(name);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.contactId).toBe(id);
  }, 30_000);

  it('contactId and contactEmail together — what the Python SDK sends: contactId decides', async () => {
    const id = await addContact(A.orgId, `both-${TAG}@example.test`);
    const other = await addContact(A.orgId, `other-${TAG}@example.test`);
    const name = `${TAG}-both`;
    await A.client.events.track({
      contactId: id,
      contactEmail: `other-${TAG}@example.test`,
      eventName: name,
    });
    const rows = await eventsNamed(name);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.contactId).toBe(id);
    expect(rows.some((r) => r.contactId === other)).toBe(false);
  }, 30_000);

  it('neither is still a 400 that names the field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { 'x-api-key': A.secretKey },
      payload: { eventName: `${TAG}-neither` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().details).toEqual([
      { path: 'contactId', message: 'Required: contactId or contactEmail' },
    ]);
  }, 30_000);
});

describe('negative control — the address does not cross organisations', () => {
  it('A’s key with an address only B has: 404, nothing written for B’s contact', async () => {
    const email = `only-b-${TAG}@example.test`;
    const bContact = await addContact(B.orgId, email);
    const name = `${TAG}-cross-ab`;

    const r = await refusal(A.client.events.track({ contactEmail: email, eventName: name }));
    expect(r).toEqual({ statusCode: 404, code: 'NOT_FOUND' });
    expect(await eventsNamed(name)).toEqual([]);
    // Nor did A acquire a contact of that address.
    expect(await contactsWithAddress(email)).toEqual([{ id: bContact, orgId: B.orgId }]);
  }, 30_000);

  it('and the other direction — B’s key with an address only A has', async () => {
    const email = `only-a-${TAG}@example.test`;
    const aContact = await addContact(A.orgId, email);
    const name = `${TAG}-cross-ba`;

    const r = await refusal(B.client.events.track({ contactEmail: email, eventName: name }));
    expect(r).toEqual({ statusCode: 404, code: 'NOT_FOUND' });
    expect(await eventsNamed(name)).toEqual([]);
    expect(await contactsWithAddress(email)).toEqual([{ id: aContact, orgId: A.orgId }]);

    // The same address, with its own org's key, does land — the 404 above is
    // the org boundary, not a lookup that never matches.
    const own = `${TAG}-own-a`;
    await A.client.events.track({ contactEmail: email, eventName: own });
    const rows = await eventsNamed(own);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.contactId).toBe(aContact);
  }, 30_000);

  it('a publishable key may not look a contact up by address', async () => {
    const email = `pub-${TAG}@example.test`;
    await addContact(A.orgId, email);
    const name = `${TAG}-pub`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: { 'x-api-key': A.publicKey },
      payload: { contactEmail: email, eventName: name },
    });
    expect(res.statusCode, res.body).toBe(403);
    expect(await eventsNamed(name)).toEqual([]);
  }, 30_000);
});
