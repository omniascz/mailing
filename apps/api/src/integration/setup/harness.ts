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
    // Each login comes from its own address, for the same reason route-smoke
    // injects its sweep that way.
    //
    // /api/v1/auth/login is limited to 10 per 15 minutes per IP. That used to
    // be survivable here by accident: the limiter kept its counter in the
    // process, so every test file got a fresh ten. Now that the counter is in
    // Redis — which is the point, one limit across all instances — it is one
    // budget for the whole suite AND for the fifteen minutes after it, so a
    // re-run inside the window would start already spent. Measured: eight
    // suites failed at `login failed: 429` before this line existed.
    //
    // This does not weaken anything. The limit is not what these files test;
    // they log in to get a session and then assert something else. The one
    // place the shared counter IS the subject asserts it directly, in
    // rate-limit-shared.integration.test.ts.
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
