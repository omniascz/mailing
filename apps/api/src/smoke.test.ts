/**
 * Boot smoke test — verifies that buildApp() registers all plugins + 150+ route
 * modules without runtime errors after the typecheck cleanup pass.
 *
 * Does NOT require running Postgres/Redis; postgres-js connects lazily, BullMQ
 * queues defer connection until first .add(), and Redis is only touched on
 * request-scoped hooks (not on plugin register).
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './index.js';

let app: FastifyInstance | undefined;

afterAll(async () => {
  if (app) await app.close();
});

describe('API boot smoke', () => {
  // Six files in this suite boot a full app with ~1500 routes, and they run in
  // parallel, so the shared 10s testTimeout is not a meaningful budget for one
  // of them — it measures machine contention, not whether boot works.
  it('buildApp() resolves without throwing', async () => {
    app = await buildApp();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  }, 30_000);

  it('exposes /health route registered by healthRoutes', async () => {
    if (!app) throw new Error('app not built');
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status?: string; service?: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('forgemsg-api');
  });

  it('has the auth decorators wired', async () => {
    if (!app) throw new Error('app not built');
    expect(typeof (app as unknown as { authenticate?: unknown }).authenticate).toBe('function');
  });

  it('printRoutes lists a non-trivial number of routes', async () => {
    if (!app) throw new Error('app not built');
    const tree = app.printRoutes();
    // Sanity: with 150+ route modules we expect plenty of registered paths.
    expect(tree.length).toBeGreaterThan(500);
  });
});
