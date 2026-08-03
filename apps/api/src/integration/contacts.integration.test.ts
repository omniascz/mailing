/**
 * The first test in this repository that goes through the real HTTP layer,
 * past the auth guard, into a real Postgres.
 *
 * Everything in the unit suite either calls service functions directly or —
 * for the four files that use .inject() — only asserts 4xx responses, because
 * no database is present. 0 of 1539 registered endpoints had an authenticated
 * happy path. This is one of them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, login } from './setup/harness.js';

/** `apps/api/scripts/seed.ts` inserts exactly 6 contacts into the demo org. */
const SEEDED_CONTACTS = 6;

describe('contacts API (authenticated, real DB)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('authenticated user can list contacts for their org', async () => {
    // Anonymous request must be rejected by the auth guard. This is the half
    // that has never been covered: the suite could only ever prove 401s
    // *without* also proving the authenticated path works, which means a
    // permanently-broken guard would have looked identical.
    const anon = await app.inject({ method: 'GET', url: '/api/v1/contacts' });
    expect(anon.statusCode).toBe(401);

    // Real login over HTTP — bcrypt verify, session write to Redis, cookie issue.
    const session = await login(app);
    expect(session.orgId).toMatch(/^[0-9a-f-]{36}$/i);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/contacts',
      headers: { cookie: session.cookie },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: Array<{ id: string; orgId: string; email: string }> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(SEEDED_CONTACTS);

    // Multi-tenant isolation: every row belongs to the caller's org.
    for (const contact of body.data) {
      expect(contact.orgId).toBe(session.orgId);
    }
  });
});
