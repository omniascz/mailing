/**
 * The multivariate-test API is not registered, and that is deliberate.
 *
 * The feature is half-built: a test can be created, started and scored, but
 * nothing assigns a variant when a campaign is sent, nothing writes the
 * per-variant counters, and nothing rolls the winner out to the remaining
 * audience. Measured end to end against a real database, every test finishes
 * `completed` with `winner_variant_id` NULL — every time, because every variant
 * scores zero.
 *
 * The dashboard page is hidden behind the `multivariateTests` capability. That
 * alone would have hidden the button and left the hole: the routes were
 * authenticated but otherwise open, so anyone with a session or an API key
 * could still create tests that can never conclude. So the routes come off the
 * app too, and this pins that they are gone.
 *
 * **404, specifically — not 401 and not 500.** A 401 would say the endpoint
 * exists and the caller is not allowed, which is the wrong answer and invites a
 * retry with better credentials; a 500 would say we broke. 404 is the truth:
 * there is nothing here.
 *
 * Both halves are asserted, as elsewhere in this codebase: that these are gone,
 * and that a neighbouring campaign route still answers — so a test that passed
 * because the whole app failed to boot would fail here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, login, type Session } from './setup/harness.js';

let app: FastifyInstance;
let session: Session;

/** Every route the multivariate plugin used to register. */
const MV_ROUTES: Array<{ method: 'GET' | 'POST'; url: string; payload?: unknown }> = [
  { method: 'GET', url: '/api/v1/multivariate-tests' },
  {
    method: 'POST',
    url: '/api/v1/multivariate-tests',
    payload: {
      campaignId: '00000000-0000-0000-0000-000000000000',
      name: 'probe',
      variants: [
        { name: 'A', element: 'subject', value: 'A', allocationPercent: 50, isControl: true },
        { name: 'B', element: 'subject', value: 'B', allocationPercent: 50 },
      ],
    },
  },
  { method: 'GET', url: '/api/v1/multivariate-tests/00000000-0000-0000-0000-000000000000' },
  { method: 'POST', url: '/api/v1/multivariate-tests/00000000-0000-0000-0000-000000000000/start' },
  { method: 'POST', url: '/api/v1/multivariate-tests/00000000-0000-0000-0000-000000000000/winner' },
  { method: 'POST', url: '/api/v1/multivariate-tests/00000000-0000-0000-0000-000000000000/cancel' },
  {
    method: 'POST',
    url: '/api/v1/multivariate-tests/00000000-0000-0000-0000-000000000000/assign',
    payload: { contactId: '00000000-0000-0000-0000-000000000000' },
  },
];

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  session = await login(app);
});

afterAll(async () => {
  await app.close();
});

describe('the multivariate-test routes are not registered', () => {
  it.each(MV_ROUTES)('$method $url is 404 for an authenticated caller', async (route) => {
    const res = await app.inject({
      method: route.method,
      url: route.url,
      headers: { cookie: session.cookie },
      ...(route.payload ? { payload: route.payload } : {}),
    });

    // Not 401: that would claim the endpoint exists and invite a retry with
    // better credentials. Not 500: that would claim we broke.
    expect(res.statusCode).toBe(404);
  });

  it.each(MV_ROUTES)('$method $url is 404 unauthenticated too', async (route) => {
    const res = await app.inject({
      method: route.method,
      url: route.url,
      ...(route.payload ? { payload: route.payload } : {}),
    });
    expect(res.statusCode).toBe(404);
  });

  it('a neighbouring campaign route still answers — the app really booted', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: { cookie: session.cookie },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('the capabilities payload tells the dashboard to hide the page', () => {
  it('reports multivariateTests false', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/capabilities' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Record<string, unknown> };
    expect(body.data.multivariateTests).toBe(false);
  });

  it('leaves the other capabilities alone', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/capabilities' });
    const body = res.json() as { data: Record<string, unknown> };

    // The regression guard: hiding one feature must not have switched off the
    // others, and must not have dropped a key the dashboard reads.
    expect(Object.keys(body.data).sort()).toEqual([
      // Added when the dashboard's beyond-core nav moved from a build-time
      // boolean to this payload. Listed here so the guard keeps doing its job:
      // the dashboard reads this key, and dropping it would hide every
      // beyond-core page in every deployment.
      'beyondCoreGroups',
      'geoAnalytics',
      'inboxPreview',
      'meetingLocationTypes',
      'multivariateTests',
      'videoProviders',
    ]);
    expect(Array.isArray(body.data.beyondCoreGroups)).toBe(true);
    expect(Array.isArray(body.data.meetingLocationTypes)).toBe(true);
    expect(body.data.meetingLocationTypes).toContain('physical');
    expect(body.data.meetingLocationTypes).toContain('custom');
  });
});
