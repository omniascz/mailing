/**
 * Config for the wedged-connection watchdog.
 *
 * These knobs are read straight from `process.env`, not through config/env.ts,
 * so nothing else validates them. What this covers is the parsing: the default
 * when nothing is set, the off switch, and that garbage falls back rather than
 * producing a NaN interval that would make setInterval fire continuously.
 *
 * What it cannot see: whether the watchdog actually reaps anything. That needs
 * a real database and lives in src/integration/stuck-connection-reaper.integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  REAPER_DEFAULTS,
  readReaperConfig,
  startStuckConnectionReaper,
} from './stuck-connection-reaper.js';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('readReaperConfig', () => {
  it('is on by default, because the failure it catches is silent', () => {
    const cfg = readReaperConfig(env({}));
    expect(cfg.enabled).toBe(true);
    expect(cfg.stuckAfterMs).toBe(REAPER_DEFAULTS.stuckAfterMs);
  });

  it('only the literal "off" turns it off', () => {
    expect(readReaperConfig(env({ DB_STUCK_CONNECTION_REAPER: 'off' })).enabled).toBe(false);
    expect(readReaperConfig(env({ DB_STUCK_CONNECTION_REAPER: 'on' })).enabled).toBe(true);
    expect(readReaperConfig(env({ DB_STUCK_CONNECTION_REAPER: '' })).enabled).toBe(true);
  });

  it('takes a threshold and polls often enough to honour it', () => {
    const cfg = readReaperConfig(env({ DB_STUCK_CONNECTION_MS: '9000' }));
    expect(cfg.stuckAfterMs).toBe(9000);
    expect(cfg.intervalMs).toBe(3000);
  });

  it('never polls faster than once a second, however small the threshold', () => {
    expect(readReaperConfig(env({ DB_STUCK_CONNECTION_MS: '100' })).intervalMs).toBe(1000);
  });

  it('falls back on values that are not a positive number', () => {
    for (const raw of ['', 'soon', '-1', '0', 'NaN']) {
      expect(readReaperConfig(env({ DB_STUCK_CONNECTION_MS: raw })).stuckAfterMs).toBe(
        REAPER_DEFAULTS.stuckAfterMs,
      );
    }
  });
});

describe('startStuckConnectionReaper', () => {
  it('opens no connection at all when disabled', async () => {
    // A bad URL would throw on connect. It never gets that far: the disabled
    // handle is inert, which is what lets callers start it unconditionally.
    const reaper = startStuckConnectionReaper(
      'postgresql://nobody:nobody@127.0.0.1:1/none',
      { enabled: false, stuckAfterMs: 1000, intervalMs: 1000 },
      { warn: () => {}, error: () => {} },
    );
    expect(await reaper.tick()).toEqual([]);
    await reaper.stop();
  });
});
