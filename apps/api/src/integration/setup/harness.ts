/**
 * Integration-test harness.
 *
 * Boots the real Fastify app through buildApp() — every plugin, the auth
 * guard, rate limiting, the lot — and drives it via .inject(). No mocks, no
 * stubbed db client: requests land on the same Postgres the migrations and
 * seed ran against.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../index.js';

/** Credentials created by `apps/api/scripts/seed.ts`. */
export const SEED = {
  email: 'demo@acme.test',
  password: 'Demo1234!',
  orgSlug: 'acme-demo',
} as const;

/**
 * Boots the app and gives it a rate-limit identity of its own.
 *
 * The limiter keys on `x-api-key ?? request.ip`, and every `.inject()` that
 * does not say otherwise arrives from the same address. That was harmless
 * while the counter lived in the process — each test file's app started with
 * an empty bucket. Now the counter is in Redis, deliberately, so the whole
 * suite would share one 100/min budget and the files that make the most calls
 * would answer 429 to each other. Measured on CI before this: eleven cases
 * across workflow-triggers and merge-tag-validation failed on
 * `RATE_LIMIT: Too many requests`, none of them about rate limiting.
 *
 * So each app gets a synthetic key, and requests that do not bring their own
 * are attributed to it. This restores per-file isolation for the suite without
 * touching how the limiter behaves in production: it is a header these tests
 * would otherwise not send, applied in the harness, not in the plugin.
 *
 * The key includes the request's own address, and that is not decoration. The
 * first version of this hook used one key per app, which quietly broke
 * route-smoke: that file spreads its several-hundred-request sweep across
 * distinct addresses precisely to stay under the limit, and a single header
 * applied to all of them put the whole sweep back in one bucket. Since the
 * generator prefers `x-api-key` over the IP, overriding it beat a technique
 * that was there for this exact reason. Folding the address in keeps both:
 * different addresses still count separately, same-address requests are
 * isolated per app.
 *
 * Two things it deliberately does NOT do. It does not raise or disable the
 * limit, so a route that rate-limits its caller still rate-limits these tests.
 * And it leaves a key a test sets for itself alone. Files that build the app
 * through buildApp() directly — rate-limit-shared.integration.test.ts, which
 * is about this very counter — do not get it at all.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  const identity = `itest-${randomUUID()}`;
  app.addHook('onRequest', async (request) => {
    if (!request.headers['x-api-key']) {
      request.headers['x-api-key'] = `${identity}:${request.ip}`;
    }
  });
  return app;
}

export interface Session {
  /** Raw `fm_session` cookie value, ready for a Cookie header. */
  cookie: string;
  /** Same JWT, for Authorization: Bearer callers. */
  token: string;
  userId: string;
  orgId: string;
}

/**
 * Performs a real HTTP login against the running app and returns the session.
 * Throws with the response body attached if the login does not return 200 —
 * a silent failure here would make every downstream assertion meaningless.
 */
export async function login(
  app: FastifyInstance,
  email: string = SEED.email,
  password: string = SEED.password,
): Promise<Session> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
    // /api/v1/auth/login allows 10 per 15 minutes, keyed by `x-api-key ?? ip`.
    // Apps from createTestApp() already carry a per-app key, so this address
    // is the belt to that pair of braces: it covers callers that build the app
    // through buildApp() directly and would otherwise all log in as 127.0.0.1
    // against one Redis counter that outlives the run by fifteen minutes.
    // Measured before either existed: eight suites failed at
    // `login failed: 429`.
    remoteAddress: `192.0.2.${Math.floor(Math.random() * 254) + 1}`,
  });

  if (res.statusCode !== 200) {
    throw new Error(`[integration] login failed: ${res.statusCode} ${res.body}`);
  }

  const body = res.json() as { token: string; user: { id: string; orgId: string } };

  // Prefer the Set-Cookie value so the test exercises the same path a browser
  // would; fall back to the token if the cookie is ever dropped.
  const raw = res.headers['set-cookie'];
  const setCookie = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
  const match = /fm_session=([^;]+)/.exec(setCookie);
  if (!match?.[1]) {
    throw new Error(`[integration] login returned 200 but set no fm_session cookie: ${setCookie}`);
  }

  return {
    cookie: `fm_session=${match[1]}`,
    token: body.token,
    userId: body.user.id,
    orgId: body.user.orgId,
  };
}
