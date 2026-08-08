/**
 * Every route that carries a signed token in its path must actually match it.
 *
 * find-my-way caps path parameters at 100 characters by default, and every
 * token we put in a URL is longer: the open pixel is 286, a click 384-456
 * depending on the destination, unsubscribe 218, the preference centre 216,
 * view-in-browser 286. So all of them answered 404 — from the router, before
 * any handler ran — for every token ever issued. Open and click tracking never
 * recorded anything, and one-click unsubscribe never worked.
 *
 * It stayed invisible because a router 404 and a handler 404 look identical
 * from outside; only the message differs ("Route GET /x not found" versus
 * whatever the handler says). That is what these assert on.
 *
 * No database: a router 404 is decided before the handler, so building the app
 * is enough. That also means this runs in the unit suite, where it is cheap and
 * cannot be skipped for want of a container.
 *
 * Which is also why a request that never answers counts as a pass. Several of
 * these handlers do reach for Postgres or Redis, and with neither available
 * they hang. Hanging means the handler is running, and a handler running means
 * the router matched — the only thing under test here. The failure being
 * guarded against is the opposite and is instant: find-my-way replies
 * "Route GET /x not found" without calling anything.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createTrackingToken } from '@forgemsg/shared';
import { buildApp } from '../index.js';

let app: FastifyInstance;

const orgId = randomUUID();
const campaignId = randomUUID();
const contactId = randomUUID();
const ts = Math.floor(Date.now() / 1000);

/** A destination long enough to be realistic — click token length tracks it. */
const DESTINATION =
  'https://example.com/produkt/zimni-kabat-damsky-cerny' +
  '?utm_source=forgemsg&utm_medium=email&utm_campaign=Zimni%20vyprodej%202026&utm_content=hero';

interface TokenRoute {
  method: 'GET' | 'POST';
  /** Path prefix the token is appended to. */
  prefix: string;
  token: string;
  what: string;
}

const ROUTES: TokenRoute[] = [
  {
    method: 'GET',
    prefix: '/track/o/',
    token: createTrackingToken({ type: 'open', orgId, campaignId, contactId, ts }),
    what: 'open pixel',
  },
  {
    method: 'GET',
    prefix: '/track/c/',
    token: createTrackingToken({
      type: 'click',
      orgId,
      campaignId,
      contactId,
      url: DESTINATION,
      ts,
    }),
    what: 'click redirect',
  },
  {
    method: 'GET',
    prefix: '/api/v1/unsubscribe/',
    token: createTrackingToken({ type: 'unsub', orgId, contactId, ts }),
    what: 'unsubscribe link in the footer',
  },
  {
    method: 'POST',
    prefix: '/api/v1/unsubscribe/',
    token: createTrackingToken({ type: 'unsub', orgId, contactId, ts }),
    what: 'one-click unsubscribe (RFC 8058)',
  },
  {
    method: 'GET',
    prefix: '/p/center/',
    token: createTrackingToken({ type: 'pref', orgId, contactId, ts }),
    what: 'preference centre',
  },
  {
    method: 'POST',
    prefix: '/public/topics/',
    token: createTrackingToken({ type: 'pref', orgId, contactId, ts }),
    what: 'topic subscriptions',
  },
  {
    method: 'GET',
    prefix: '/api/v1/browser/',
    token: createTrackingToken({ type: 'view', orgId, campaignId, contactId, ts }),
    what: 'view in browser',
  },
];

/**
 * Inject, but give up waiting after a moment.
 *
 * `null` means the handler is still working — router matched, which is the
 * assertion. A router 404 comes back immediately, so it can never be confused
 * with a timeout.
 */
async function injectOrTimeout(
  method: 'GET' | 'POST',
  url: string,
  headers?: Record<string, string>,
  payload?: string,
): Promise<{ statusCode: number; body: string } | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), 2_000);
  });
  try {
    const res = await Promise.race([
      app.inject({ method, url, ...(headers ? { headers } : {}), ...(payload ? { payload } : {}) }),
      timeout,
    ]);
    return res ? { statusCode: res.statusCode, body: res.body } : null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
});

describe('routes carrying a signed token in the path', () => {
  for (const route of ROUTES) {
    const url = route.prefix + route.token;

    it(`${route.method} ${route.prefix}:token — ${route.what} (${route.token.length} chars) is matched`, async () => {
      const res = await injectOrTimeout(route.method, url);

      // The router's own 404 names the route it could not find. Anything else —
      // 200, 302, 400, 401, 500, or no answer at all — means the request
      // reached a handler, which is all this is asserting. What the handler
      // then does needs a database and is covered elsewhere.
      const body = res?.statusCode === 404 ? res.body : '';
      expect(
        body.includes('Route ') && body.includes(' not found'),
        `router refused to match ${route.method} ${route.prefix}<${route.token.length}-char token>: ${body.slice(0, 200)}`,
      ).toBe(false);
    });
  }

  it('every one of those tokens is longer than the find-my-way default', () => {
    // If this ever fails the suite above stops proving anything: a token that
    // fits in 100 characters would pass with maxParamLength unset.
    for (const route of ROUTES) {
      expect(route.token.length, `${route.prefix} token`).toBeGreaterThan(100);
    }
  });

  it('accepts a form-encoded body, which is how providers post one-click', async () => {
    // Gmail and Yahoo POST to the List-Unsubscribe URL with
    // `Content-Type: application/x-www-form-urlencoded` and a
    // `List-Unsubscribe=One-Click` body. Without @fastify/formbody that was
    // FST_ERR_CTP_INVALID_MEDIA_TYPE — a 500 — even though the handler ignores
    // the body entirely.
    const token = createTrackingToken({ type: 'unsub', orgId, contactId, ts });
    const res = await injectOrTimeout(
      'POST',
      `/api/v1/unsubscribe/${token}`,
      { 'content-type': 'application/x-www-form-urlencoded' },
      'List-Unsubscribe=One-Click',
    );

    // An unparseable content type is rejected before the handler and comes back
    // instantly as 415, so reaching the handler at all is the assertion here.
    // A timeout means it got that far: the body parsed and the handler is
    // waiting on a database this suite does not have.
    //
    // The 204-with-empty-body half of RFC 8058 needs that database, so it lives
    // in integration/unsubscribe.integration.test.ts rather than here.
    if (res !== null) {
      expect(res.statusCode).not.toBe(415);
      expect(res.statusCode).not.toBe(500);
      expect(res.body).not.toContain('FST_ERR_CTP_INVALID_MEDIA_TYPE');
    }
  });
});
