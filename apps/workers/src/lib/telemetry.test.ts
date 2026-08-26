/**
 * The Sentry scrub. Guards the trap this PR closed: `consoleIntegration` is on
 * by default, so every `console.*` call becomes a breadcrumb carrying
 * `util.format(...args)` — and beforeSend used to scrub `contexts.job` and
 * nothing else. Nothing logs a job payload today; the point of these tests is
 * that the day somebody does while debugging a send, the DKIM key does not ride
 * along to a third party.
 *
 * Mirrored in apps/api/src/lib/telemetry.test.ts.
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
    // What `console.error('debug', { dkimPrivateKey: PEM })` produces.
    const out = scrubEvent({
      breadcrumbs: [
        {
          category: 'console',
          level: 'error',
          message: 'debug { dkimPrivateKey: ' + JSON.stringify(PEM) + ' }',
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
    const out = scrubEvent({
      breadcrumbs: [{ category: 'console', message: PEM.slice(0, 200) }],
    });
    expect(leaks(out)).toBe(false);
  });

  it('redacts denied keys in breadcrumb data, at any nesting depth', () => {
    const out = scrubEvent({
      breadcrumbs: [
        { category: 'console', message: 'job', data: { job: { data: { dkimPrivateKey: PEM } } } },
      ],
    });
    expect(leaks(out)).toBe(false);
  });

  it('still scrubs contexts.job', () => {
    const out = scrubEvent({ contexts: { job: { queue: 'mta-other', dkimPrivateKey: PEM } } });
    expect(leaks(out)).toBe(false);
  });

  it('leaves ordinary breadcrumbs alone', () => {
    const out = scrubEvent({
      breadcrumbs: [{ category: 'console', message: '[batch-sender] Job 4711 completed' }],
    });
    expect(out.breadcrumbs[0]?.message).toBe('[batch-sender] Job 4711 completed');
  });

  it('tolerates an event with no breadcrumbs', () => {
    expect(() => scrubEvent({})).not.toThrow();
  });
});
