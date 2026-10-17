/**
 * The request serializer, on its own (Z181).
 *
 * A route whose pattern names a parameter `token` has that segment replaced in
 * the log whatever the value looks like. Measured on master 14813b8: the DOI
 * confirmation token is a random UUID — 36 characters with dashes — and the
 * shape rule (40+ base64url characters) let it through, so
 * `/api/v1/confirm/<uuid>` was logged in full. The legacy unsubscribe and
 * preference tokens are UUIDs too, an email-identity token is 32 characters.
 *
 * The request objects below are what the serializer reads off a FastifyRequest:
 * the url, the method, the headers, the socket — and `routeOptions.url`, the
 * pattern of the route the router matched. The whole app, with its real logger,
 * is in integration/log-token-route-redaction.integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { redactUrl, requestSerializer } from './log-redaction.js';

const UUID = '3f03aa16-26d6-40ae-a657-2f2e99c53069';
const SHORT = 'k7Qz2fXp';
const SIGNED =
  'eyJ0eXBlIjoidW5zdWIiLCJvcmdJZCI6IjNmMDMifQ.mi1fGohJWgfkCFhvN-g_Z-bJ5giAAHQQe4Nq_pkG-4H';

/** What the serializer is handed for a request the router matched to `pattern`. */
function matched(url: string, pattern: string | undefined, method = 'GET'): FastifyRequest {
  return {
    method,
    url,
    headers: { host: 'api.test' },
    ip: '198.51.100.7',
    socket: { remotePort: 53211 },
    routeOptions: { url: pattern },
  } as unknown as FastifyRequest;
}

const urlOf = (req: FastifyRequest) => requestSerializer(req).url;

describe('a parameter named token is redacted by the route pattern, whatever its shape', () => {
  it('the DOI confirmation token (a UUID)', () => {
    expect(urlOf(matched(`/api/v1/confirm/${UUID}`, '/api/v1/confirm/:token'))).toBe(
      '/api/v1/confirm/[redacted]',
    );
  });

  it('the legacy unsubscribe and preference tokens (UUIDs), GET and POST', () => {
    expect(urlOf(matched(`/api/v1/unsubscribe/${UUID}`, '/api/v1/unsubscribe/:token'))).toBe(
      '/api/v1/unsubscribe/[redacted]',
    );
    expect(
      urlOf(matched(`/api/v1/preferences/${UUID}`, '/api/v1/preferences/:token', 'POST')),
    ).toBe('/api/v1/preferences/[redacted]');
  });

  it('a short token, and a token that is not the last segment', () => {
    expect(
      urlOf(
        matched(
          `/api/v1/email-identities/confirm/${SHORT}`,
          '/api/v1/email-identities/confirm/:token',
        ),
      ),
    ).toBe('/api/v1/email-identities/confirm/[redacted]');
    expect(
      urlOf(
        matched(`/t/chat/${SHORT}/messages?after=2026-10-17T10:00:00Z`, '/t/chat/:token/messages'),
      ),
    ).toBe('/t/chat/[redacted]/messages?after=2026-10-17T10:00:00Z');
  });

  it('the query is handled as before on a token route', () => {
    expect(
      urlOf(matched(`/api/v1/confirm/${UUID}?token=abc&lang=cs`, '/api/v1/confirm/:token')),
    ).toBe('/api/v1/confirm/[redacted]?token=[redacted]&lang=cs');
  });

  it('a long signed token gets the same marker as before', () => {
    expect(urlOf(matched(`/p/center/${SIGNED}`, '/p/center/:token'))).toBe('/p/center/[redacted]');
  });
});

describe('what is not a token stays', () => {
  it('an id of a route whose parameter is called something else', () => {
    expect(urlOf(matched(`/api/v1/contacts/${UUID}`, '/api/v1/contacts/:id'))).toBe(
      `/api/v1/contacts/${UUID}`,
    );
  });

  it('only the exact name: :tokenId and :sessionToken are not :token', () => {
    expect(urlOf(matched(`/a/${SHORT}`, '/a/:tokenId'))).toBe(`/a/${SHORT}`);
    expect(urlOf(matched(`/b/${SHORT}`, '/b/:sessionToken'))).toBe(`/b/${SHORT}`);
  });

  it('an unmatched request (no pattern) keeps the two old rules and nothing else', () => {
    expect(urlOf(matched(`/api/v1/nothing/${UUID}`, undefined))).toBe(`/api/v1/nothing/${UUID}`);
    expect(urlOf(matched(`/api/v1/nothing/${SIGNED}?token=x`, undefined))).toBe(
      '/api/v1/nothing/[redacted]?token=[redacted]',
    );
    // Fastify's last-resort 404 path hands the serializer the raw IncomingMessage,
    // which has no routeOptions at all.
    const raw = { method: 'GET', url: `/x/${UUID}`, headers: {}, socket: {} };
    expect(urlOf(raw as unknown as FastifyRequest)).toBe(`/x/${UUID}`);
  });

  it('a pattern that cannot be read costs nothing but the pattern', () => {
    const req = {
      method: 'GET',
      url: `/api/v1/confirm/${SIGNED}`,
      headers: {},
      socket: {},
      get routeOptions(): never {
        throw new Error('no route context');
      },
    };
    expect(urlOf(req as unknown as FastifyRequest)).toBe('/api/v1/confirm/[redacted]');
  });

  it('the other fields are copied as they were', () => {
    expect(requestSerializer(matched(`/api/v1/confirm/${UUID}`, '/api/v1/confirm/:token'))).toEqual(
      {
        method: 'GET',
        url: '/api/v1/confirm/[redacted]',
        host: 'api.test',
        remoteAddress: '198.51.100.7',
        remotePort: 53211,
      },
    );
  });

  it('redactUrl with the url alone behaves as before', () => {
    expect(redactUrl(`/api/v1/confirm/${UUID}`)).toBe(`/api/v1/confirm/${UUID}`);
    expect(redactUrl(`/track/c/${SIGNED}`)).toBe('/track/c/[redacted]');
    expect(redactUrl('/api/v1/campaigns?limit=5&status=draft')).toBe(
      '/api/v1/campaigns?limit=5&status=draft',
    );
  });
});
