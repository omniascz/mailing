import { describe, it, expect } from 'vitest';
import { parseScheduledAt } from './parse-scheduled-at.js';

const NOW = new Date('2026-07-03T12:00:00.000Z');

describe('parseScheduledAt', () => {
  it('passes through ISO timestamps', () => {
    expect(parseScheduledAt('2026-08-01T09:30:00Z', NOW)?.toISOString()).toBe(
      '2026-08-01T09:30:00.000Z',
    );
  });

  it('parses "in N <unit>"', () => {
    expect(parseScheduledAt('in 5 minutes', NOW)!.getTime()).toBe(NOW.getTime() + 5 * 60_000);
    expect(parseScheduledAt('in 2 hours', NOW)!.getTime()).toBe(NOW.getTime() + 2 * 3_600_000);
    expect(parseScheduledAt('in 1 day', NOW)!.getTime()).toBe(NOW.getTime() + 86_400_000);
    expect(parseScheduledAt('in 3 weeks', NOW)!.getTime()).toBe(NOW.getTime() + 3 * 604_800_000);
  });

  it('accepts "in an hour" / "in a day"', () => {
    expect(parseScheduledAt('in an hour', NOW)!.getTime()).toBe(NOW.getTime() + 3_600_000);
    expect(parseScheduledAt('in a day', NOW)!.getTime()).toBe(NOW.getTime() + 86_400_000);
  });

  it('parses "tomorrow" and "tomorrow at <time>"', () => {
    const t = parseScheduledAt('tomorrow', NOW)!;
    expect(t.getTime()).toBe(NOW.getTime() + 86_400_000);
    const at9 = parseScheduledAt('tomorrow at 9am', NOW)!;
    expect(at9.getHours()).toBe(9);
    const at1430 = parseScheduledAt('tomorrow at 14:30', NOW)!;
    expect(at1430.getHours()).toBe(14);
    expect(at1430.getMinutes()).toBe(30);
    expect(parseScheduledAt('tomorrow at 9pm', NOW)!.getHours()).toBe(21);
  });

  it('parses "next week"', () => {
    expect(parseScheduledAt('next week', NOW)!.getTime()).toBe(NOW.getTime() + 7 * 86_400_000);
  });

  it('returns null for gibberish + invalid times', () => {
    expect(parseScheduledAt('whenever', NOW)).toBeNull();
    expect(parseScheduledAt('in 5 bananas', NOW)).toBeNull();
    expect(parseScheduledAt('tomorrow at 25:00', NOW)).toBeNull();
    expect(parseScheduledAt('', NOW)).toBeNull();
  });
});
