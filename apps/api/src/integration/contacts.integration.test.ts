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

/**
 * The contacts `apps/api/scripts/seed.ts` inserts into the demo org.
 *
 * Asserted as a subset, not as the whole list. This used to be
 * `expect(body.data).toHaveLength(6)`, which quietly made every other file in
 * the suite unable to create a contact: the list endpoint pages at 20 by
 * default, so the seventh live contact anywhere in the org turned this into
 * "expected length 6, got 7" — or, once a file created a dozen, "got 20" — in
 * a test that has nothing to do with whatever created them. Shared mutable
 * state plus an absolute count is a trap for whoever writes the next test.
 *
 * What this file is actually for is the authenticated happy path and org
 * scoping, and both survive the change intact.
 */
const SEEDED_EMAILS = [
  'adela.novakova@example.test',
  'jan.svoboda@example.test',
  'petra.dvorakova@example.test',
  'tomas.prochazka@example.test',
  'marketa.cerna@example.test',
  'pavel.vesely@example.test',
] as const;

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

    // limit=100 is the route's maximum. Without it the default page of 20
    // could hide a seeded contact once the org holds more than 20 live rows,
    // which would reintroduce the coupling by the back door.
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/contacts?limit=100',
      headers: { cookie: session.cookie },
    });

    expect(res.statusCode).toBe(200);

    const body = res.json() as { data: Array<{ id: string; orgId: string; email: string }> };
    expect(Array.isArray(body.data)).toBe(true);

    // Every seeded contact comes back. Extra rows left by other files in the
    // suite are none of this test's business.
    const returned = new Set(body.data.map((c) => c.email));
    const missing = SEEDED_EMAILS.filter((e) => !returned.has(e));
    expect(missing, `seeded contacts missing from the listing: ${missing.join(', ')}`).toEqual([]);

    // Multi-tenant isolation: every row belongs to the caller's org.
    for (const contact of body.data) {
      expect(contact.orgId).toBe(session.orgId);
    }
  });
});
