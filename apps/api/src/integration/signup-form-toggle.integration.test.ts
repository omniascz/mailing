/**
 * The dashboard's Pause/Resume button pauses a signup form.
 *
 * The button sends `{ active }` to PUT /api/v1/signup-forms/:id. The route's
 * schema was `createSchema.partial()`, which has no `active`, and zod strips
 * unknown keys — so the button answered "Form paused" while the form went on
 * collecting addresses (probe Z112). updateSignupForm has always taken
 * `active`; only the schema stood in between.
 *
 * The request is the web app's own (apps/web/.../signup-forms/[id]/
 * toggle-active-request.ts), imported by path and sent as returned.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * The claim is the row — signup_forms.active — and what it is for: a paused
 * form refuses a public submission. And the rest of the row survives the
 * toggle, and an ordinary edit still saves without touching `active`.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not click the button; nothing proves the button calls the builder
 *   beyond the import in toggle-active-button.tsx.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { signupForms } from '../db/schema/index.js';

const TAG = `z113-sf-${randomUUID().slice(0, 8)}`;

type ToggleRequest = (
  formId: string,
  active: boolean,
) => { method: 'PUT'; path: string; body: Record<string, unknown> };

let app: FastifyInstance;
let session: Session;
let toggleActiveRequest: ToggleRequest;
const created: string[] = [];

const authed = (method: 'POST' | 'PUT', url: string, payload: unknown) =>
  app.inject({ method, url, headers: { cookie: session.cookie }, payload: payload as never });

async function newForm() {
  const res = await authed('POST', '/api/v1/signup-forms', {
    name: `${TAG} newsletter`,
    fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true }],
    embedType: 'popup',
    config: { submitButtonText: 'Odebírat', successMessage: 'Díky!' },
  });
  expect(res.statusCode, res.body).toBe(201);
  const id = (res.json() as { data: { id: string } }).data.id;
  created.push(id);
  return id;
}

const row = async (id: string) =>
  (await db.select().from(signupForms).where(eq(signupForms.id, id)))[0]!;

async function press(id: string) {
  const r = toggleActiveRequest(id, (await row(id)).active);
  const res = await authed(r.method, r.path, r.body);
  expect(res.statusCode, res.body).toBe(200);
}

const submit = (id: string) =>
  app.inject({
    method: 'POST',
    url: `/public/forms/${id}/submit`,
    payload: { email: `${TAG}-${randomUUID().slice(0, 6)}@example.invalid` },
  });

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  const file = path.resolve(
    __dirname,
    '../../../web/src/app/(dashboard)/signup-forms/[id]/toggle-active-request.ts',
  );
  toggleActiveRequest = (
    (await import(pathToFileURL(file).href)) as { toggleActiveRequest: ToggleRequest }
  ).toggleActiveRequest;
}, 60_000);

afterAll(async () => {
  if (created.length > 0) await db.delete(signupForms).where(inArray(signupForms.id, created));
  await app?.close();
});

describe('Pause / Resume', () => {
  it('Pause sets active=false, and the paused form refuses a submission', async () => {
    const id = await newForm();
    const before = await row(id);
    expect(before.active).toBe(true);

    await press(id);

    const after = await row(id);
    expect(after.active, 'the button paused the form').toBe(false);
    // The toggle carries only `active`; nothing else on the row may move.
    expect(after.name).toBe(before.name);
    expect(after.fields).toEqual(before.fields);
    expect(after.config).toEqual(before.config);
    expect(after.embedType).toBe(before.embedType);

    const res = await submit(id);
    expect(res.statusCode, 'a paused form does not collect').toBe(422);
  }, 30_000);

  it('Resume sets it back, and the form collects again', async () => {
    const id = await newForm();
    await press(id);
    expect((await row(id)).active).toBe(false);

    await press(id);
    expect((await row(id)).active, 'the button resumed the form').toBe(true);

    const res = await submit(id);
    expect(res.statusCode, res.body).toBe(200);
  }, 30_000);
});

describe('the other fields still save', () => {
  it('an edit without `active` changes what it names and leaves the form running', async () => {
    const id = await newForm();
    const res = await authed('PUT', `/api/v1/signup-forms/${id}`, {
      name: `${TAG} renamed`,
      config: { submitButtonText: 'Přihlásit', successMessage: 'Hotovo' },
    });
    expect(res.statusCode, res.body).toBe(200);

    const after = await row(id);
    expect(after.name).toBe(`${TAG} renamed`);
    expect(after.config).toMatchObject({ submitButtonText: 'Přihlásit' });
    expect(after.active).toBe(true);
  }, 30_000);

  it('`active` must be a boolean', async () => {
    const id = await newForm();
    const res = await authed('PUT', `/api/v1/signup-forms/${id}`, { active: 'no' });
    expect(res.statusCode).toBe(400);
    expect((await row(id)).active).toBe(true);
  }, 30_000);
});
