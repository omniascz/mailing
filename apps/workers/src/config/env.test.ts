import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * VERP_BOUNCE_DOMAIN.
 *
 * batch-sender.ts:195 read it as `process.env.VERP_BOUNCE_DOMAIN ?? ''` and the
 * name existed nowhere else in the repo — no .env.example entry, no compose
 * entry, no schema. Unset, the Return-Path is empty and the engine falls back
 * to the header From:
 *
 *   VERP configured  From="news@customer.cz" ReturnPath="bounce+id=…@bounce.ours.test"
 *                    ->  MAIL FROM:<bounce+id=…@bounce.ours.test>
 *   VERP unset       From="news@customer.cz" ReturnPath=""
 *                    ->  MAIL FROM:<news@customer.cz>
 *
 * So the DSN goes to the customer's mailbox and our inbound side never sees it.
 * The codec itself is fine — measured:
 *
 *   encodeVerp("<abc-123@forgemsg.com>", "bounce.example.test")
 *     = bounce+abc-123=forgemsg.com@bounce.example.test
 *   decodeVerp(that) = <abc-123@forgemsg.com>
 *
 * The gap was configuration, not code.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

/** Everything the workers schema needs in production, minus the field under test. */
const PROD_BASE: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db.internal:5432/forgemsg',
  REDIS_URL: 'redis://redis.internal:6379',
  CLICKHOUSE_URL: 'http://clickhouse.internal:8123',
  MINIO_ACCESS_KEY: 'real-access-key',
  MINIO_SECRET_KEY: 'real-secret-key',
  TRACKING_SECRET: 'a-real-tracking-secret-32-chars-min',
};

describe('VERP_BOUNCE_DOMAIN', () => {
  it('refuses a production boot when it is missing', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...PROD_BASE };

    await expect(import('./env.js')).rejects.toThrow();
    expect(
      err.mock.calls.flat().join(' '),
      'the failure has to name the variable — an operator reads this line',
    ).toMatch(/VERP_BOUNCE_DOMAIN/);

    exit.mockRestore();
    err.mockRestore();
  });

  it('refuses a production boot when it is set but empty', async () => {
    // `??` at the call site did not treat '' as absent, so a present-but-empty
    // value produced an empty Return-Path rather than falling back to anything.
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...PROD_BASE, VERP_BOUNCE_DOMAIN: '' };

    await expect(import('./env.js')).rejects.toThrow();
    expect(err.mock.calls.flat().join(' ')).toMatch(/VERP_BOUNCE_DOMAIN/);

    exit.mockRestore();
    err.mockRestore();
  });

  it('refuses values that are not a bare domain', async () => {
    for (const bad of [
      'https://bounce.example.com',
      'bounce@example.com',
      'bounce.example.com/path',
      'localhost',
      '-bounce.example.com',
    ]) {
      vi.resetModules();
      const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit');
      }) as never);
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      process.env = { ...PROD_BASE, VERP_BOUNCE_DOMAIN: bad };

      await expect(import('./env.js'), `${bad} should be refused`).rejects.toThrow();

      exit.mockRestore();
      err.mockRestore();
    }
  });

  it('accepts a bare domain and exposes it', async () => {
    process.env = { ...PROD_BASE, VERP_BOUNCE_DOMAIN: 'bounce.example.com' };
    const mod = await import('./env.js');
    expect(mod.env.VERP_BOUNCE_DOMAIN).toBe('bounce.example.com');
  });

  it('stays optional outside production, so the unit suite boots without it', async () => {
    // This loader parses raw process.env with no test lane, and every unit test
    // reaches it through lib/telemetry.js. Requiring it everywhere would fail
    // the suite for a variable that has no meaning on a developer's machine.
    process.env = { NODE_ENV: 'development' };
    const mod = await import('./env.js');
    expect(mod.env.VERP_BOUNCE_DOMAIN).toBeUndefined();
  });
});
