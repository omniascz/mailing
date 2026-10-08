/**
 * The contact editor's lifecycle stage reaches the contact.
 *
 * The form put `lifecycleStage` into PUT /api/v1/contacts/:id. That schema has
 * no such key and zod strips unknown keys, so the change was dropped while the
 * form said "Contact updated" (probe Z112). The stage has its own route —
 * POST /api/v1/contacts/:id/lifecycle — which writes lifecycle_stage_history
 * and fires lifecycle_stage_changed; the form now sends the stage there.
 *
 * The requests are not composed here. They come from the web app's own
 * builder (apps/web/.../contacts/[id]/contact-edit-requests.ts), imported by
 * path and sent as returned, with a dashboard session.
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * Every case asserts the contacts row and the history table, and that the
 * other fields the same save carries still land — the stage moving to its own
 * request must not cost the name or the phone.
 *
 * WHAT THIS TEST CANNOT SEE
 * - It does not render the form or click Save; the web unit test covers the
 *   builder's output, nothing proves the select drives it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp, login, type Session } from './setup/harness.js';
import { db } from '../db/client.js';
import { contacts, lifecycleStageHistory } from '../db/schema/index.js';

const TAG = `z113-lc-${randomUUID().slice(0, 8)}`;

interface ApiRequest {
  method: 'PUT' | 'POST';
  path: string;
  body: Record<string, unknown>;
}
type Builder = (
  contactId: string,
  currentStage: string | null,
  form: {
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    status: string;
    lifecycleStage: string;
  },
) => ApiRequest[];

let app: FastifyInstance;
let session: Session;
let build: Builder;
const created: string[] = [];

async function newContact(stage: 'subscriber' | 'customer') {
  const [c] = await db
    .insert(contacts)
    .values({
      orgId: session.orgId,
      email: `${TAG}-${created.length}@example.invalid`,
      phone: '+420777000111',
      firstName: 'Jana',
      lastName: 'Nováková',
      status: 'active',
      lifecycleStage: stage,
    })
    .returning();
  created.push(c!.id);
  return c!;
}

/** Send what the form would send, in the form's order; stop at the first refusal. */
async function save(requests: ApiRequest[]) {
  const statuses: number[] = [];
  for (const r of requests) {
    const res = await app.inject({
      method: r.method,
      url: r.path,
      headers: { cookie: session.cookie },
      payload: r.body as never,
    });
    statuses.push(res.statusCode);
    if (res.statusCode >= 400) throw new Error(`${r.method} ${r.path} → ${res.body}`);
  }
  return statuses;
}

const row = async (id: string) => (await db.select().from(contacts).where(eq(contacts.id, id)))[0]!;
const history = (id: string) =>
  db.select().from(lifecycleStageHistory).where(eq(lifecycleStageHistory.contactId, id));

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
  const file = path.resolve(
    __dirname,
    '../../../web/src/app/(dashboard)/contacts/[id]/contact-edit-requests.ts',
  );
  build = ((await import(pathToFileURL(file).href)) as { buildContactEditRequests: Builder })
    .buildContactEditRequests;
}, 60_000);

afterAll(async () => {
  if (created.length > 0) await db.delete(contacts).where(inArray(contacts.id, created));
  await app?.close();
});

describe('the editor changes the lifecycle stage', () => {
  it('up the pipeline, together with a name change', async () => {
    const c = await newContact('subscriber');
    await save(
      build(c.id, c.lifecycleStage, {
        email: c.email!,
        phone: '+420777000111',
        firstName: 'Jana',
        lastName: 'Svobodová',
        status: 'active',
        lifecycleStage: 'customer',
      }),
    );

    const after = await row(c.id);
    expect(after.lifecycleStage, 'the stage the form chose').toBe('customer');
    expect(after.lastName, 'the field saved alongside').toBe('Svobodová');
    expect(after.firstName).toBe('Jana');
    expect(after.phone).toBe('+420777000111');
    expect(after.email).toBe(c.email);

    const h = await history(c.id);
    expect(h.map((x) => [x.fromStage, x.toStage])).toEqual([['subscriber', 'customer']]);
  }, 30_000);

  it('back down the pipeline — a person chose it, so it is not refused', async () => {
    const c = await newContact('customer');
    await save(
      build(c.id, c.lifecycleStage, {
        email: c.email!,
        phone: '',
        firstName: 'Jana',
        lastName: 'Nováková',
        status: 'active',
        lifecycleStage: 'marketing_qualified_lead',
      }),
    );
    expect((await row(c.id)).lifecycleStage).toBe('marketing_qualified_lead');
    expect((await history(c.id)).map((x) => x.toStage)).toEqual(['marketing_qualified_lead']);
  }, 30_000);

  it('stage untouched: the other fields still save, and no transition is recorded', async () => {
    const c = await newContact('subscriber');
    const requests = build(c.id, c.lifecycleStage, {
      email: c.email!,
      phone: '+420777999888',
      firstName: 'Janička',
      lastName: 'Nováková',
      status: 'active',
      lifecycleStage: 'subscriber',
    });
    expect(requests.map((r) => r.method)).toEqual(['PUT']);
    await save(requests);

    const after = await row(c.id);
    expect(after.firstName).toBe('Janička');
    expect(after.phone).toBe('+420777999888');
    expect(after.lifecycleStage).toBe('subscriber');
    expect(await history(c.id)).toEqual([]);
  }, 30_000);
});
