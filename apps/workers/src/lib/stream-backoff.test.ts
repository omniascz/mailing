/**
 * The retry spacing differs by what the message is for.
 *
 * One ladder for everything was sized for greylisting — right for a password
 * reset, far too short for a newsletter, where the alternative to waiting is
 * not delivering. These are the numbers; the reasoning is in stream-backoff.ts.
 */
import { describe, it, expect } from 'vitest';
import { streamBackoff, ladderTotalMs } from './stream-backoff.js';

const MIN = 60_000;

describe('per-stream retry ladders', () => {
  it('transactional keeps the 31-minute window that clears greylisting', () => {
    // BullMQ calls the strategy with attemptsMade + 1, so 1 is the first retry.
    expect([1, 2, 3, 4, 5].map((n) => streamBackoff(n, 'transactional'))).toEqual([
      1 * MIN,
      2 * MIN,
      4 * MIN,
      8 * MIN,
      16 * MIN,
    ]);
    expect(ladderTotalMs('transactional')).toBe(31 * MIN);
  });

  it('broadcast waits hours, because nobody is waiting on a campaign', () => {
    expect([1, 2, 3, 4, 5].map((n) => streamBackoff(n, 'broadcast'))).toEqual([
      5 * MIN,
      15 * MIN,
      45 * MIN,
      90 * MIN,
      120 * MIN,
    ]);
    expect(ladderTotalMs('broadcast')).toBe(275 * MIN);
  });

  it('triggered sits between the two', () => {
    expect(ladderTotalMs('triggered')).toBe(122 * MIN);
    expect(ladderTotalMs('transactional')).toBeLessThan(ladderTotalMs('triggered'));
    expect(ladderTotalMs('triggered')).toBeLessThan(ladderTotalMs('broadcast'));
  });

  it('a campaign waits longer than a password reset at every step', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(streamBackoff(n, 'broadcast')).toBeGreaterThan(streamBackoff(n, 'transactional'));
    }
  });

  it('no ladder reaches a day — timewarp picks a local hour and a day-late send misses it', () => {
    for (const s of ['transactional', 'triggered', 'broadcast'] as const) {
      expect(ladderTotalMs(s)).toBeLessThan(24 * 60 * MIN);
    }
  });

  it('an unknown or missing stream falls back to broadcast', () => {
    expect(streamBackoff(1, undefined)).toBe(streamBackoff(1, 'broadcast'));
    expect(streamBackoff(3, 'nonsense')).toBe(streamBackoff(3, 'broadcast'));
  });

  it('clamps past the end of the ladder rather than going undefined', () => {
    // attempts is 6, so 6+ should never be asked for — but a config change
    // must not produce NaN delays.
    expect(streamBackoff(99, 'transactional')).toBe(16 * MIN);
  });
});
