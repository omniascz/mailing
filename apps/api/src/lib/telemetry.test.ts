/**
 * The Sentry scrub. Guards the trap this PR closed: `consoleIntegration` is on
 * by default, so every `console.*` call becomes a breadcrumb carrying
 * `util.format(...args)` — and beforeSend used to scrub the request and nothing
 * else. Also pins the DKIM additions to the body deny-list: the BYODKIM import
 * route takes a plaintext `privateKey` in its body, and while Fastify keeps the
 * parsed body off the raw IncomingMessage that Sentry reads (so it is not
 * captured today), the deny-list is what makes that safe rather than lucky.
 *
 * Mirrored in apps/workers/src/lib/telemetry.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

vi.mock('../config/env.js', () => ({ env: { SENTRY_DSN: undefined } }));

const { scrubEvent } = await import('./telemetry.js');

const LF = String.fromCharCode(10);
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
/** A slice of the key body — proves we are not just matching the BEGIN header. */
const KEY_BODY = (PEM.split(LF)[1] ?? '').slice(0, 24);

function leaks(event: unknown): boolean {
  const s = JSON.stringify(event);
  return s.includes('BEGIN PRIVATE KEY') || s.includes(KEY_BODY);
}

describe('scrubEvent', () => {
  it('redacts a PEM inlined into a breadcrumb message', () => {
    const out = scrubEvent({
      breadcrumbs: [
        {
          category: 'console',
          level: 'error',
          message: 'debug { privateKey: ' + JSON.stringify(PEM) + ' }',
        },
      ],
    });
    expect(leaks(out)).toBe(false);
    expect(JSON.stringify(out)).toContain('[redacted]');
  });

  it('redacts a bare PEM in a breadcrumb message even with no key name attached', () => {
    const out = scrubEvent({ breadcrumbs: [{ category: 'console', message: 'key ' + PEM }] });
    expect(leaks(out)).toBe(false);
  });

  it('redacts a PEM truncated mid-block (Sentry caps a breadcrumb at 2 KB)', () => {
    const out = scrubEvent({ breadcrumbs: [{ category: 'console', message: PEM.slice(0, 200) }] });
    expect(leaks(out)).toBe(false);
  });

  it('redacts denied keys in breadcrumb data, at any nesting depth', () => {
    const out = scrubEvent({
      breadcrumbs: [{ category: 'console', message: 'x', data: { body: { privateKey: PEM } } }],
    });
    expect(leaks(out)).toBe(false);
  });

  it('redacts the BYODKIM import body if request data is ever captured', () => {
    const event = {
      request: { headers: { cookie: 'sid=1' }, data: { selector: 's1', privateKey: PEM } },
    };
    const out = scrubEvent(event) as typeof event;
    expect(leaks(out)).toBe(false);
    expect(out.request.data.privateKey).toBe('[redacted]');
  });

  it('still redacts request headers', () => {
    const event = { request: { headers: { cookie: 'sid=1', 'x-internal-secret': 'shh' } } };
    const out = scrubEvent(event) as typeof event;
    expect(out.request.headers.cookie).toBe('[redacted]');
    expect(out.request.headers['x-internal-secret']).toBe('[redacted]');
  });

  it('leaves ordinary breadcrumbs alone', () => {
    const out = scrubEvent({
      breadcrumbs: [{ category: 'console', message: 'GET /v1/domains 200' }],
    });
    expect(out.breadcrumbs[0]?.message).toBe('GET /v1/domains 200');
  });

  it('tolerates an event with no breadcrumbs and no request', () => {
    expect(() => scrubEvent({})).not.toThrow();
  });
});
