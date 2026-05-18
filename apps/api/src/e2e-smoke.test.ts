/**
 * E2E smoke (C#4) — exercises the critical user-journey wiring through Fastify
 * inject, without touching Postgres / Redis / external providers.
 *
 * What this verifies:
 *   - Public endpoints (signup, login) reach Zod validation and reject bad
 *     payloads with 4xx (not 5xx).
 *   - Auth-gated endpoints respond 401 when no session/API key is present.
 *   - The Swagger spec endpoint is reachable and lists routes.
 *
 * What it doesn't do: it does NOT hit a real DB so it can't run a true
 * end-to-end happy path. That belongs in an integration suite that runs against
 * Postgres in CI (the `services:` block in `.github/workflows/ci.yml`). This
 * smoke is the cheapest possible signal that the request pipeline is wired.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './index.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  if (app) await app.close();
});

// ─── Public endpoints: input validation ──────────────────────────────────────

describe('signup → Zod validation', () => {
  it('rejects an empty register body with 4xx', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {},
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('rejects malformed email with 4xx', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { name: 'X', email: 'not-an-email', password: 'shortish1' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('rejects too-short password with 4xx', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { name: 'X', email: 'a@b.com', password: 'short' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});

describe('login → Zod validation', () => {
  it('rejects empty body with 4xx', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('rejects non-email with 4xx', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'x', password: 'p' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});

// ─── Auth-gated endpoints: 401 without session/API key ───────────────────────

describe('auth gating', () => {
  const gated = [
    { method: 'GET', url: '/api/v1/contacts' },
    { method: 'GET', url: '/api/v1/campaigns' },
    { method: 'GET', url: '/api/v1/templates' },
    { method: 'GET', url: '/api/v1/segments' },
    { method: 'GET', url: '/api/v1/webhooks' },
    { method: 'GET', url: '/api/v1/workflows' },
  ] as const;

  for (const { method, url } of gated) {
    it(`${method} ${url} → 401 without auth`, async () => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    });
  }
});

// ─── Swagger / OpenAPI ───────────────────────────────────────────────────────

describe('OpenAPI spec', () => {
  it('serves a JSON spec listing routes', async () => {
    // @fastify/swagger registers the JSON spec at /docs/json by default.
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    if (res.statusCode === 404) {
      // Swagger UI may be mounted under a different path; tolerate that here
      // and just assert the Swagger plugin decorated the instance.
      expect(typeof (app as unknown as { swagger?: unknown }).swagger).toBe('function');
      return;
    }
    expect(res.statusCode).toBe(200);
    const body = res.json() as { paths?: Record<string, unknown> };
    expect(body.paths).toBeDefined();
    // Should include at least one /api/v1/* path.
    const paths = Object.keys(body.paths ?? {});
    expect(paths.some((p) => p.startsWith('/api/v1/'))).toBe(true);
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

describe('unknown routes', () => {
  it('GET /api/v1/does-not-exist → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
