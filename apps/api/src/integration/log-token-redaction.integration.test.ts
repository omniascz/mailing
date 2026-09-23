/**
 * The request log does not carry usable tokens.
 *
 * Asserted over what the LOGGER ACTUALLY WROTE, not over the configuration: the
 * app is built by buildApp() with a stream this file owns, real requests are
 * injected, and the lines that come out are parsed back. A test that read
 * `app.log.serializers` would pass against a serializer that is never called.
 *
 * Measured before this change, with the default serializer:
 *
 *   /api/v1/preferences/eyJvcmdJZCI6…In0.Ab3Cd4Ef5Gh6…
 *   /api/v1/unsubscribe/eyJ0eXBlIjoidW5zdWIi…In0.mi1fGohJWgfkCFhv…
 *   /track/c/eyJ0eXBlIjoiY2xpY2si…fQ.N-g_Z-bJ5giAAHQQe4Nq…
 *
 * ─── On silent green ─────────────────────────────────────────────────────────
 *
 * "No token in the log" is also true of a log that was never written, and of a
 * redactor that deletes the whole url. So every case first asserts the line
 * exists for the request it made, the last case asserts an ORDINARY url is
 * logged unchanged, and one case asserts the surrounding fields — request id,
 * method, host, remote address, status code — survive.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';

const { buildApp } = await import('../index.js');

/** Every line the logger produced, parsed. */
interface LogLine {
  reqId?: string;
  msg?: string;
  req?: { method?: string; url?: string; host?: string; remoteAddress?: string };
  res?: { statusCode?: number };
}

let app: FastifyInstance;
const lines: LogLine[] = [];

/** The log line for the request that carried this marker in its url. */
const lineFor = (marker: string): LogLine | undefined =>
  lines.find((l) => l.req?.url?.includes(marker));

const PREF_TOKEN =
  'eyJvcmdJZCI6IjNmMDNhYTE2LTI2ZDYtNDBhZS1hNjU3LTJmMmU5OWM1MzA2OSJ9.Ab3Cd4Ef5Gh6Ij7Kl8Mn9Op0Qr1St2Uv3Wx4Yz5A';
const CLICK_TOKEN =
  'eyJ0eXBlIjoiY2xpY2siLCJ1cmwiOiJodHRwczovL3Nob3AuZXhhbXBsZS5jeiJ9.N-g_Z-bJ5giAAHQQe4Nq_pkG-4H4xzim1N0qP8tvOVE';

beforeAll(async () => {
  const sink = new Writable({
    write(chunk, _enc, cb) {
      for (const raw of chunk.toString().split('\n')) {
        if (!raw.trim()) continue;
        try {
          lines.push(JSON.parse(raw) as LogLine);
        } catch {
          // pino-pretty is off here (a stream is passed), so this should not
          // happen; swallowing keeps one odd line from failing the file.
        }
      }
      cb();
    },
  });

  // The real app, with its real logger, writing where this file can read it.
  // createTestApp() is not used here because it does not expose the stream.
  app = await buildApp({ loggerStream: sink });
  await app.ready();

  await app.inject({ method: 'GET', url: `/api/v1/preferences/${PREF_TOKEN}` });
  await app.inject({ method: 'GET', url: `/track/c/${CLICK_TOKEN}` });
  await app.inject({
    method: 'GET',
    url: `/public/forms/${randomUUID()}/autofill?fmcid=${PREF_TOKEN}&orgId=${randomUUID()}`,
  });
  await app.inject({ method: 'GET', url: '/api/v1/campaigns?limit=5&status=draft' });
}, 120_000);

afterAll(async () => {
  await app?.close();
}, 120_000);

describe('tokens in the path', () => {
  it('the preference-centre token is replaced by a marker', () => {
    const line = lineFor('/api/v1/preferences/');
    expect(line, 'no log line for the request that was made').toBeTruthy();
    expect(line!.req!.url).toBe('/api/v1/preferences/[redacted]');
    expect(line!.req!.url).not.toContain(PREF_TOKEN.slice(0, 24));
  });

  it('the click-tracking token is replaced by a marker', () => {
    const line = lineFor('/track/c/');
    expect(line, 'no log line for the request that was made').toBeTruthy();
    expect(line!.req!.url).toBe('/track/c/[redacted]');
  });
});

describe('tokens in the query', () => {
  it('a token-valued query parameter keeps its name and loses its value', () => {
    const line = lineFor('/autofill');
    expect(line, 'no log line for the request that was made').toBeTruthy();
    // The name survives — "somebody sent an fmcid" is what makes the line
    // useful — and the value does not.
    expect(line!.req!.url).toContain('fmcid=[redacted]');
    expect(line!.req!.url).not.toContain(PREF_TOKEN.slice(0, 24));
    // orgId is an id, not a credential: it stays.
    expect(line!.req!.url).toMatch(/orgId=[0-9a-f-]{36}/);
  });
});

describe('what must not change', () => {
  it('an ordinary url is logged in full', () => {
    const line = lineFor('/api/v1/campaigns');
    expect(line, 'no log line for the request that was made').toBeTruthy();
    expect(line!.req!.url).toBe('/api/v1/campaigns?limit=5&status=draft');
    expect(line!.req!.url).not.toContain('[redacted]');
  });

  it('the fields around the url are the ones Fastify logged before', () => {
    const line = lineFor('/api/v1/campaigns');
    expect(line!.req!.method).toBe('GET');
    expect(line!.req!.host).toBeTruthy();
    expect(line!.req!.remoteAddress).toBeTruthy();
    expect(line!.reqId, 'the correlation id is gone').toBeTruthy();

    // The response serializer is untouched: its line carries the status code
    // and the same request id.
    const completed = lines.find(
      (l) => l.reqId === line!.reqId && typeof l.res?.statusCode === 'number',
    );
    expect(completed, 'no response line for that request').toBeTruthy();
    expect(completed!.res!.statusCode).toBeGreaterThan(0);
  });
});
