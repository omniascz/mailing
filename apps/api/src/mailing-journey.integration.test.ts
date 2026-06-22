/**
 * Cross-stack mailing journey — a REAL end-to-end test that drives the live
 * stack (Postgres + Redis) through the public HTTP surface, not mocks.
 *
 * It is GATED behind RUN_DB_IT=1 and skips cleanly otherwise, so the default
 * local `vitest run` is unaffected. In CI (which provisions postgres + redis,
 * see .github/workflows/ci.yml) run it with:
 *
 *     RUN_DB_IT=1 DATABASE_URL=… REDIS_URL=… JWT_SECRET=… pnpm --filter @forgemsg/api test
 *
 * The journey exercised:
 *   1. register            → creates org + user (Postgres) + session (Redis)
 *   2. authenticated reads  → org-scoped contacts / campaigns / segments (auth + RLS-by-query)
 *   3. analytics read       → org daily stats (Postgres, or ClickHouse when enabled)
 *   4. public open pixel    → tracking endpoint returns a GIF without auth
 *   5. auth gating          → the same endpoints reject an unauthenticated call
 *
 * NOTE: authored to match the current routes; it has NOT been executed against a
 * live DB in this environment (no local Postgres) — it runs in CI.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './index.js';

const RUN = process.env.RUN_DB_IT === '1';
const SESSION_COOKIE = 'fm_session';

describe.skipIf(!RUN)('mailing journey (live Postgres + Redis)', () => {
  let app: FastifyInstance;
  let cookie = '';

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('registers a new org + user and issues a session', async () => {
    const email = `it-${Date.now()}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { name: 'IT User', email, password: 'Correct-Horse-9!battery', orgName: 'IT Org' },
    });
    expect(res.statusCode).toBeLessThan(400);
    const set = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(set?.value).toBeTruthy();
    cookie = `${SESSION_COOKIE}=${set!.value}`;
  });

  it('serves org-scoped mailing reads to the authenticated session', async () => {
    for (const url of ['/api/v1/contacts', '/api/v1/campaigns', '/api/v1/segments']) {
      const res = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(res.statusCode, `${url} should be 200 for an authed session`).toBe(200);
      const body = res.json() as { data?: unknown };
      expect(body).toHaveProperty('data');
    }
  });

  it('computes analytics for the org (Postgres or ClickHouse fallback)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/currency-revenue',
      headers: { cookie },
    });
    expect(res.statusCode).toBeLessThan(500);
  });

  it('serves the public open pixel without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/track/o/not-a-token' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/gif');
  });

  it('rejects the same mailing reads without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/contacts' });
    expect(res.statusCode).toBe(401);
  });
});
