/**
 * Integration-test harness.
 *
 * Boots the real Fastify app through buildApp() — every plugin, the auth
 * guard, rate limiting, the lot — and drives it via .inject(). No mocks, no
 * stubbed db client: requests land on the same Postgres the migrations and
 * seed ran against.
 */
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../index.js';

/** Credentials created by `apps/api/scripts/seed.ts`. */
export const SEED = {
  email: 'demo@acme.test',
  password: 'Demo1234!',
  orgSlug: 'acme-demo',
} as const;

/**
 * Boots the app.
 *
 * It used to add a made-up `x-api-key` header to every injected request, one
 * per app, because the limiter keyed on whatever that header said — verified or
 * not — and the header gave each test file a bucket of its own. That is the
 * bypass the limiter now closes (plugins/rate-limit.ts keys on the verified
 * caller, and on the address only when there is none), so the header would buy
 * nothing and would only pretend to.
 *
 * Isolation comes from identity instead, the way production gets it: a file
 * that logs in holds its own session, and the session is its bucket; a file
 * that uses an API key holds its own key. Unauthenticated calls count against
 * the injected address, as they would against a client's.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  return buildApp();
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
