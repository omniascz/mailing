/**
 * A bounced contact is set active again only after its bounce is released.
 *
 * ─── What was wrong (Z149, measured on master d37c05a) ───────────────────────
 *
 * PUT /contacts/:id {status:'active'} on a bounced contact answered 200 and
 * wrote 'active' while the address still had a hard_bounce or invalid_email
 * suppression row — for an archived bounced contact too. The row went on
 * stopping mail, so the status said one thing and the sending another; and the
 * owner/admin release (DELETE /suppressions/:id, audited) was not what decided
 * it. Owner's decision (14 Oct 2026): the edit waits for the release.
 *
 * ─── What this file walks ────────────────────────────────────────────────────
 *
 * bounced + hard_bounce / invalid_email, and archived(bounced) + hard_bounce:
 * PUT active → 409 BOUNCE_ACTIVE, and the contact row is unchanged, the other
 * fields of the same PUT included. An editor's and a viewer's DELETE are
 * refused and change nothing; the owner's DELETE → 204 + an audit row, the
 * contact stays bounced, and then PUT active → 200. A bounced contact with no
 * such row (or only a block row) still goes to active. When the PUT also
 * changes the address, the new address is the one checked.
 *
 * The calls use API keys of this file's own (owner, editor, viewer), so the
 * file has its own rate-limit buckets.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createTestApp, SEED } from './setup/harness.js';
import { db } from '../db/client.js';
import { apiKeys, auditLogs, contacts, suppressions, users } from '../db/schema/index.js';

const TAG = `z149-${randomUUID().slice(0, 8)}`;
type Role = 'owner' | 'editor' | 'viewer';
type Contact = typeof contacts.$inferSelect;

let app: FastifyInstance;
let orgId: string;
const keys = {} as Record<Role, string>;
const keyIds: string[] = [];
const created: string[] = [];
let n = 0;

const address = (label: string) => `${TAG}-${label}-${n++}@example.invalid`;

async function issueKey(role: Role, userId: string): Promise<string> {
  const raw = `fm_live_${randomUUID().replace(/-/g, '')}`;
  const [k] = await db
    .insert(apiKeys)
    .values({
      orgId,
      userId,
      role,
      name: `${TAG} ${role}`,
      keyHash: createHash('sha256').update(raw).digest('hex'),
      keyPrefix: raw.slice(0, 12),
      scopes: [],
    })
    .returning({ id: apiKeys.id });
  keyIds.push(k!.id);
  return raw;
}

const as = (role: Role, method: 'PUT' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
  app.inject({
    method,
    url,
    headers: { 'x-api-key': keys[role] },
    ...(payload ? { payload } : {}),
  });

async function newContact(
  status: Contact['status'],
  archivedFrom: Contact['status'] | null = null,
  email = address(status),
): Promise<Contact> {
  const [c] = await db
    .insert(contacts)
    .values({ orgId, email, firstName: 'Jana', lastName: 'Nováková', status, archivedFrom })
    .returning();
  created.push(c!.id);
  return c!;
}

async function suppress(email: string, reason: 'hard_bounce' | 'invalid_email' | 'block') {
  const [row] = await db
    .insert(suppressions)
    .values({ orgId, email, reason })
    .returning({ id: suppressions.id });
  return row!.id;
}

async function contactRow(id: string) {
  const [c] = await db.select().from(contacts).where(eq(contacts.id, id));
  return c!;
}

const fields = (c: Contact) => ({
  status: c.status,
  archivedFrom: c.archivedFrom,
  email: c.email,
  firstName: c.firstName,
  lastName: c.lastName,
  phone: c.phone,
  updatedAt: c.updatedAt.toISOString(),
});

async function reasonsOf(email: string) {
  const rows = await db
    .select({ reason: suppressions.reason })
    .from(suppressions)
    .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, email)));
  return rows.map((r) => r.reason).sort();
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  const [owner] = await db
    .select({ id: users.id, orgId: users.orgId })
    .from(users)
    .where(eq(users.email, SEED.email))
    .limit(1);
  orgId = owner!.orgId!;
  for (const role of ['owner', 'editor', 'viewer'] as const)
    keys[role] = await issueKey(role, owner!.id);
}, 60_000);

afterAll(async () => {
  await db.delete(suppressions).where(sql`${suppressions.email} LIKE ${`${TAG}-%`}`);
  await db.delete(auditLogs).where(sql`${auditLogs.changes}->>'email' LIKE ${`${TAG}-%`}`);
  if (created.length > 0) await db.delete(contacts).where(inArray(contacts.id, created));
  if (keyIds.length > 0) await db.delete(apiKeys).where(inArray(apiKeys.id, keyIds));
  await app?.close();
});

describe('bounced → active waits while the bounce row stands', () => {
  for (const [label, status, archivedFrom, reason] of [
    ['bounced + hard_bounce', 'bounced', null, 'hard_bounce'],
    ['bounced + invalid_email', 'bounced', null, 'invalid_email'],
    ['archived(bounced) + hard_bounce', 'archived', 'bounced', 'hard_bounce'],
  ] as const) {
    it(`${label}: 409 BOUNCE_ACTIVE, and nothing of the PUT is written`, async () => {
      const c = await newContact(status, archivedFrom);
      const rowId = await suppress(c.email!, reason);

      const res = await as('owner', 'PUT', `/api/v1/contacts/${c.id}`, {
        status: 'active',
        firstName: 'Petra',
        phone: '+420777123456',
      });
      expect(res.statusCode, res.body).toBe(409);
      const body = res.json() as { code: string; message: string };
      expect(body.code).toBe('BOUNCE_ACTIVE');
      expect(body.message).toContain(reason);
      expect(body.message).toContain(`DELETE /api/v1/suppressions/${rowId}`);

      expect(fields(await contactRow(c.id))).toEqual(fields(c));
      expect(await reasonsOf(c.email!)).toEqual([reason]);
    }, 30_000);
  }

  it('the way back: an editor or viewer cannot release; the owner does, with an audit row, and then PUT active goes through', async () => {
    const c = await newContact('bounced');
    const rowId = await suppress(c.email!, 'hard_bounce');

    for (const role of ['editor', 'viewer'] as const) {
      const del = await as(role, 'DELETE', `/api/v1/suppressions/${rowId}`);
      expect(del.statusCode, `${role} ${del.body}`).toBe(403);
      expect(await reasonsOf(c.email!)).toEqual(['hard_bounce']);
      const put = await as('owner', 'PUT', `/api/v1/contacts/${c.id}`, { status: 'active' });
      expect(put.statusCode, put.body).toBe(409);
      expect((await contactRow(c.id)).status).toBe('bounced');
    }

    const del = await as('owner', 'DELETE', `/api/v1/suppressions/${rowId}`);
    expect(del.statusCode, del.body).toBe(204);
    const audit = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.orgId, orgId),
          eq(auditLogs.action, 'suppression.released'),
          eq(auditLogs.resourceId, rowId),
        ),
      );
    expect(audit).toHaveLength(1);
    // The release does not move the contact: that stays the edit's job.
    expect((await contactRow(c.id)).status).toBe('bounced');

    const put = await as('owner', 'PUT', `/api/v1/contacts/${c.id}`, { status: 'active' });
    expect(put.statusCode, put.body).toBe(200);
    expect((await contactRow(c.id)).status).toBe('active');
  }, 30_000);
});

describe('what still goes through', () => {
  it('bounced with no bounce row → 200 active (no row, or only a block row)', async () => {
    const bare = await newContact('bounced');
    const blocked = await newContact('bounced');
    await suppress(blocked.email!, 'block');
    for (const c of [bare, blocked]) {
      const res = await as('owner', 'PUT', `/api/v1/contacts/${c.id}`, { status: 'active' });
      expect(res.statusCode, res.body).toBe(200);
      expect((await contactRow(c.id)).status).toBe('active');
    }
  }, 30_000);

  it('bounced + hard_bounce to another status than active: archived goes through', async () => {
    const c = await newContact('bounced');
    await suppress(c.email!, 'hard_bounce');
    const res = await as('owner', 'PUT', `/api/v1/contacts/${c.id}`, { status: 'archived' });
    expect(res.statusCode, res.body).toBe(200);
    const row = await contactRow(c.id);
    expect([row.status, row.archivedFrom]).toEqual(['archived', 'bounced']);
  }, 30_000);
});

describe('a PUT that changes the address too is checked on the new address', () => {
  it('the new address has a hard_bounce row: 409, address and status unchanged', async () => {
    const c = await newContact('bounced');
    const next = address('new-bounced');
    await suppress(next, 'hard_bounce');
    const res = await as('owner', 'PUT', `/api/v1/contacts/${c.id}`, {
      email: next,
      status: 'active',
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().code).toBe('BOUNCE_ACTIVE');
    expect(fields(await contactRow(c.id))).toEqual(fields(c));
  }, 30_000);

  it('only the old address had the row: 200, active on the new address', async () => {
    const c = await newContact('bounced');
    await suppress(c.email!, 'hard_bounce');
    const next = address('new-clean');
    const res = await as('owner', 'PUT', `/api/v1/contacts/${c.id}`, {
      email: next,
      status: 'active',
    });
    expect(res.statusCode, res.body).toBe(200);
    const row = await contactRow(c.id);
    expect([row.status, row.email]).toEqual(['active', next]);
  }, 30_000);
});
