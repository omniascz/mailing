/**
 * What the public form surface is allowed to answer.
 *
 * Two routes read a contact out of the database for an unauthenticated caller,
 * and neither had a credential worth the name:
 *
 *   GET /public/forms/:formId/autofill     — returned e-mail, first name, last
 *       name and phone to anyone holding an `fmid` or `fmcid` from the query.
 *       Nothing in the product ever issued either token (setTrackingMapping and
 *       encryptContactId had no caller anywhere), so it was a way to read
 *       personal data and never a way to fill a form in.
 *
 *   GET /public/forms/:formId/progressive  — took `contactId` and `orgId`
 *       straight from the query, with no token at all, and answered which of
 *       the form's fields we already hold for that person (and 404 vs 200 as an
 *       existence oracle). The dashboard twin
 *       /api/v1/forms/:formId/progressive does the same work scoped by the
 *       session's org, and keeps working.
 *
 * Both public routes are gone. This file pins that they are gone AND that the
 * public surface a real form needs is untouched — a route that 404s is easy to
 * achieve by deleting too much.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not render the embed script; it asserts the HTTP surface the script
 *   would call.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, signupForms } from '../db/schema/index.js';

const TAG = `z71-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
let session: Session;
let contactId: string;
let formId: string;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);

  const [c] = await db
    .insert(contacts)
    .values({
      orgId: session.orgId,
      email: `${TAG}@example.invalid`,
      firstName: 'Jana',
      lastName: 'Nováková',
      phone: '+420777123456',
      status: 'active',
    })
    .returning({ id: contacts.id });
  contactId = c!.id;

  const [f] = await db
    .insert(signupForms)
    .values({
      orgId: session.orgId,
      name: `z71 ${TAG}`,
      active: true,
      fields: [
        { name: 'email', label: 'E-mail', type: 'email', required: true },
        { name: 'first_name', label: 'Jméno', type: 'text', required: false },
        { name: 'last_name', label: 'Příjmení', type: 'text', required: false },
        { name: 'phone', label: 'Telefon', type: 'text', required: false },
      ],
    } as never)
    .returning({ id: signupForms.id });
  formId = f!.id;
}, 120_000);

afterAll(async () => {
  if (formId) await db.delete(signupForms).where(eq(signupForms.id, formId));
  if (contactId) await db.delete(contacts).where(eq(contacts.id, contactId));
  await app?.close();
}, 120_000);

describe('the routes that handed out contact data are gone', () => {
  it('GET /public/forms/:id/autofill is not a route any more', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/public/forms/${formId}/autofill?fmid=anything&orgId=${session.orgId}`,
    });

    expect(res.statusCode, res.body).toBe(404);
    // The measured leak, named so a reinstated route cannot pass this file.
    expect(res.body).not.toContain(`${TAG}@example.invalid`);
    expect(res.body).not.toContain('Nováková');
    expect(res.body).not.toContain('+420777123456');
  });

  it('GET /public/forms/:id/progressive is not a route any more', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/public/forms/${formId}/progressive?contactId=${contactId}&orgId=${session.orgId}`,
    });

    expect(res.statusCode, res.body).toBe(404);
    // What it used to answer with: which fields we already hold for that
    // person, plus 404-versus-200 as an existence oracle.
    expect(res.body).not.toContain('remaining');
    expect(res.body).not.toContain('last_name');
  });
});

describe('the public form surface a visitor needs still works', () => {
  it('the form definition is still readable without a session', async () => {
    const res = await app.inject({ method: 'GET', url: `/public/forms/${formId}` });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).toContain('first_name');
    // It is the definition, not anybody's data.
    expect(res.body).not.toContain(`${TAG}@example.invalid`);
  });

  it('field visibility still evaluates without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/public/forms/${formId}/evaluate-visibility`,
      payload: { orgId: session.orgId, data: { email: 'someone@example.invalid' } },
    });
    expect(res.statusCode, res.body).toBe(200);
  });

  it('the dashboard keeps progressive profiling, scoped by the session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/forms/${formId}/progressive?contactId=${contactId}`,
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ data: { total: 4 } });

    // And it is a session that opens it, not the ids: the same call without one
    // must not answer with the same body.
    const anon = await app.inject({
      method: 'GET',
      url: `/api/v1/forms/${formId}/progressive?contactId=${contactId}`,
    });
    expect(anon.statusCode).not.toBe(200);
  });
});
