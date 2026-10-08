/**
 * Saving a contact in the editor does not decide their consent.
 *
 * The editor listed five statuses and started the form at 'active' for any
 * other, then sent `status` on every save. Measured (probe Z114): a
 * non_subscribed contact opened and saved without touching the status came
 * back 'active' — marketing-eligible, since non_subscribed carries no
 * suppression — and an archived one came back 'active' too.
 *
 * Two halves, both asserted here:
 *  - the web no longer sends a status nobody changed (its form starts at the
 *    contact's own status and the builder omits an unchanged one);
 *  - PUT /api/v1/contacts/:id refuses a move INTO 'active' that would restore
 *    consent without the recipient: from non_subscribed / pending always,
 *    from unsubscribed / complained while the suppression is still there. The
 *    recipient lifts that suppression through the preference centre (#218),
 *    and after that the move goes through.
 *
 * The editor's requests are the web app's own (initialContactForm +
 * buildContactEditRequests from apps/web/.../contacts/[id]/
 * contact-edit-requests.ts), imported by path and sent as returned.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * Every refusal is followed by a case that must pass on the same contact —
 * a name edit saves — and the legitimate transitions (unsubscribe, archive,
 * unarchive, resubscribe after the preference centre) are asserted to work.
 * Rows are compared field by field, suppressions included.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not render the form; the select's options are covered by the web
 *   unit test, and nothing proves the component calls the builder beyond its
 *   import.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { and, eq, inArray } from 'drizzle-orm';
import { createTrackingToken } from '@forgemsg/shared';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, suppressions } from '../db/schema/index.js';
import { unsubscribeContact } from '../services/contacts/unsubscribe.js';

const TAG = `z114-${randomUUID().slice(0, 8)}`;

type Contact = typeof contacts.$inferSelect;
type Form = Record<string, string>;
interface ApiRequest {
  method: 'PUT' | 'POST';
  path: string;
  body: Record<string, unknown>;
}
interface WebModule {
  initialContactForm(c: Contact): Form;
  buildContactEditRequests(
    id: string,
    current: { status: string; lifecycleStage: string | null },
    form: Form,
  ): ApiRequest[];
}

let app: FastifyInstance;
let session: Session;
let web: WebModule;
const created: string[] = [];
let n = 0;

async function newContact(status: Contact['status']): Promise<Contact> {
  const [c] = await db
    .insert(contacts)
    .values({
      orgId: session.orgId,
      email: `${TAG}-${n++}@example.invalid`,
      phone: '+420777000111',
      firstName: 'Jana',
      lastName: 'Nováková',
      status: status === 'unsubscribed' ? 'active' : status,
    })
    .returning();
  created.push(c!.id);
  // An unsubscribed contact made the way the product makes one: status AND
  // suppression, through the one place that writes both.
  if (status === 'unsubscribed') {
    await unsubscribeContact(session.orgId, c!.id, { scope: { kind: 'global' }, source: 'api' });
  }
  return (await row(c!.id)).contact;
}

async function row(id: string) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  const sup = await db
    .select({ reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, session.orgId), eq(suppressions.email, contact!.email!)));
  return { contact: contact!, suppressions: sup.map((s) => s.reason) };
}

/** The fields an edit can touch, for a field-by-field comparison. */
const fields = (c: Contact) => ({
  status: c.status,
  email: c.email,
  phone: c.phone,
  firstName: c.firstName,
  lastName: c.lastName,
  lifecycleStage: c.lifecycleStage,
});

const put = (id: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'PUT',
    url: `/api/v1/contacts/${id}`,
    headers: { cookie: session.cookie },
    payload: body,
  });

/** Open the editor, change what `edit` says, press Save. */
async function editorSave(c: Contact, edit: Form = {}) {
  const form = { ...web.initialContactForm(c), ...edit };
  const statuses: number[] = [];
  for (const r of web.buildContactEditRequests(c.id, c, form)) {
    const res = await app.inject({
      method: r.method,
      url: r.path,
      headers: { cookie: session.cookie },
      payload: r.body as never,
    });
    statuses.push(res.statusCode);
  }
  return statuses;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  const file = path.resolve(
    __dirname,
    '../../../web/src/app/(dashboard)/contacts/[id]/contact-edit-requests.ts',
  );
  web = (await import(pathToFileURL(file).href)) as WebModule;
}, 60_000);

afterAll(async () => {
  if (created.length > 0) await db.delete(contacts).where(inArray(contacts.id, created));
  await app?.close();
});

describe('saving in the editor without touching the status leaves it alone', () => {
  for (const status of ['non_subscribed', 'unsubscribed', 'archived', 'pending'] as const) {
    it(`${status}: the save goes through and nothing moves`, async () => {
      const c = await newContact(status);
      const before = await row(c.id);

      expect(await editorSave(c)).toEqual([200]);

      const after = await row(c.id);
      expect(fields(after.contact)).toEqual(fields(before.contact));
      expect(after.contact.status).toBe(status);
      expect(after.suppressions).toEqual(before.suppressions);
    }, 30_000);
  }

  it('and the fields the person did change are saved — status still untouched', async () => {
    const c = await newContact('non_subscribed');
    expect(await editorSave(c, { lastName: 'Svobodová', phone: '+420777999888' })).toEqual([200]);
    const after = (await row(c.id)).contact;
    expect(fields(after)).toEqual({
      ...fields(c),
      lastName: 'Svobodová',
      phone: '+420777999888',
    });
  }, 30_000);
});

describe('PUT refuses a move into active that would restore consent without the recipient', () => {
  it('non_subscribed → active: 409, row unchanged; a name edit right after still saves', async () => {
    const c = await newContact('non_subscribed');
    const res = await put(c.id, { status: 'active', firstName: 'Janička' });
    expect(res.statusCode, res.body).toBe(409);
    expect(fields((await row(c.id)).contact)).toEqual(fields(c));

    const ok = await put(c.id, { firstName: 'Janička' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(fields((await row(c.id)).contact)).toEqual({ ...fields(c), firstName: 'Janička' });
  }, 30_000);

  it('pending → active: 409 — the double opt-in confirmation does that, not an edit', async () => {
    const c = await newContact('pending');
    expect((await put(c.id, { status: 'active' })).statusCode).toBe(409);
    expect((await row(c.id)).contact.status).toBe('pending');
  }, 30_000);

  it('unsubscribed and still suppressed → active: 409, status and suppression both stay', async () => {
    const c = await newContact('unsubscribed');
    const before = await row(c.id);
    expect(before.suppressions).toEqual(['unsubscribe']);

    const res = await put(c.id, { status: 'active' });
    expect(res.statusCode, res.body).toBe(409);
    const after = await row(c.id);
    expect(fields(after.contact)).toEqual(fields(before.contact));
    expect(after.suppressions).toEqual(['unsubscribe']);

    const ok = await put(c.id, { lastName: 'Svobodová' });
    expect(ok.statusCode).toBe(200);
    expect((await row(c.id)).contact.lastName).toBe('Svobodová');
  }, 30_000);
});

describe('the legitimate transitions still work', () => {
  it('the recipient resubscribes in the preference centre (#218), then the status can follow', async () => {
    const c = await newContact('unsubscribed');
    const token = createTrackingToken({
      type: 'pref',
      orgId: session.orgId,
      contactId: c.id,
      ts: Math.floor(Date.now() / 1000),
    });
    const pref = await app.inject({
      method: 'POST',
      url: `/p/center/${token}`,
      payload: { globalResubscribe: true },
    });
    expect(pref.statusCode, pref.body).toBe(200);
    expect((await row(c.id)).suppressions, 'the #218 path deletes the suppression').toEqual([]);

    const res = await put(c.id, { status: 'active' });
    expect(res.statusCode, res.body).toBe(200);
    const after = await row(c.id);
    expect(after.contact.status).toBe('active');
    expect(after.suppressions).toEqual([]);
  }, 30_000);

  it('the editor can still unsubscribe somebody — status and suppression', async () => {
    const c = await newContact('active');
    expect(await editorSave(c, { status: 'unsubscribed' })).toEqual([200]);
    const after = await row(c.id);
    expect(after.contact.status).toBe('unsubscribed');
    expect(after.suppressions).toEqual(['unsubscribe']);
  }, 30_000);

  it('archive and unarchive still work, and PUT can still take an archived contact back', async () => {
    const c = await newContact('active');
    const archive = await app.inject({
      method: 'POST',
      url: `/api/v1/contacts/${c.id}/archive`,
      headers: { cookie: session.cookie },
    });
    expect(archive.statusCode).toBe(200);
    expect((await row(c.id)).contact.status).toBe('archived');

    const unarchive = await app.inject({
      method: 'POST',
      url: `/api/v1/contacts/${c.id}/unarchive`,
      headers: { cookie: session.cookie },
    });
    expect(unarchive.statusCode).toBe(200);
    expect((await row(c.id)).contact.status).toBe('active');

    const d = await newContact('archived');
    expect((await put(d.id, { status: 'active' })).statusCode).toBe(200);
    expect((await row(d.id)).contact.status).toBe('active');
  }, 30_000);

  it('a bounced contact can be set back to active — a bounce is not a consent state', async () => {
    const c = await newContact('bounced');
    expect((await put(c.id, { status: 'active' })).statusCode).toBe(200);
    expect((await row(c.id)).contact.status).toBe('active');
  }, 30_000);
});
