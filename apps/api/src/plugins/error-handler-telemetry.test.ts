/**
 * The `route` the error handler hands to captureException carries no token
 * (Z181).
 *
 * For a matched route it is the PATTERN (`GET /x/:token`) and always was. The
 * fallback is the request url, for a request no route matched — and that one
 * went out raw, query string included. It now goes through redactUrl: the two
 * shape rules, nothing new, because without a pattern there is no parameter
 * name to go by.
 *
 * captureException is replaced by a recorder here: the real one does nothing
 * unless Sentry is configured, so there would be nothing to read.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const captured = vi.hoisted(() => [] as (string | undefined)[]);
vi.mock('../lib/telemetry.js', () => ({
  captureException: (_err: unknown, ctx?: { route?: string }) => {
    captured.push(ctx?.route);
  },
}));

const { default: errorHandler } = await import('./error-handler.js');

const SIGNED =
  'eyJ0eXBlIjoidW5zdWIiLCJvcmdJZCI6IjNmMDMifQ.mi1fGohJWgfkCFhvN-g_Z-bJ5giAAHQQe4Nq_pkG-4H';
const UUID = '3f03aa16-26d6-40ae-a657-2f2e99c53069';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(errorHandler);
  app.get('/boom/:token', async () => {
    throw new Error('boom');
  });
  // Any hook that fails on a request no route matched — a Redis outage in a
  // limiter, say — lands in the error handler with no pattern to report.
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/gone/')) throw new Error('hook failed');
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function routeFor(url: string): Promise<{ status: number; route: string | undefined }> {
  captured.length = 0;
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, route: captured[0] };
}

describe('captureException route', () => {
  it('a matched route reports its pattern, as before', async () => {
    const r = await routeFor(`/boom/${UUID}`);
    expect(r.status).toBe(500);
    expect(r.route).toBe('GET /boom/:token');
  });

  it('an unmatched request reports its url without a token-shaped segment or a token parameter', async () => {
    const r = await routeFor(`/gone/${SIGNED}?token=${UUID}&page=2`);
    expect(r.status).toBe(500);
    expect(r.route).toBe('GET /gone/[redacted]?token=[redacted]&page=2');
    expect(r.route).not.toContain(SIGNED.slice(0, 12));
    expect(r.route).not.toContain(UUID);
  });

  it('an unmatched request with nothing token-like reports its url unchanged', async () => {
    const r = await routeFor(`/gone/${UUID}?page=2`);
    expect(r.status).toBe(500);
    // No pattern, so no parameter name: only the two shape rules apply.
    expect(r.route).toBe(`GET /gone/${UUID}?page=2`);
  });
});
