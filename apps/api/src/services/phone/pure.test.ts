import { describe, it, expect } from 'vitest';
import {
  isWithinBusinessHours,
  normalizeE164,
  selectHuntPool,
  type BusinessHoursConfig,
  type AgentPresence,
} from './pure.js';

describe('isWithinBusinessHours', () => {
  const bh: BusinessHoursConfig = {
    timezone: 'Europe/Prague',
    schedule: [
      { day: 1, openMinutes: 9 * 60, closeMinutes: 17 * 60 }, // Monday 9-17
      { day: 2, openMinutes: 9 * 60, closeMinutes: 17 * 60 },
    ],
  };

  it('returns true inside schedule', () => {
    // 2026-04-27 is a Monday; 10:00 Prague
    expect(
      isWithinBusinessHours(bh, new Date('2026-04-27T08:00:00Z')),
    ).toBe(true); // 10:00 local
  });

  it('returns false outside schedule', () => {
    // 2026-04-27 Monday 18:00 local
    expect(
      isWithinBusinessHours(bh, new Date('2026-04-27T16:00:00Z')),
    ).toBe(false);
  });

  it('returns false on unscheduled day', () => {
    // 2026-04-25 Saturday — not in schedule
    expect(
      isWithinBusinessHours(bh, new Date('2026-04-25T10:00:00Z')),
    ).toBe(false);
  });

  it('honours holidays', () => {
    const withHoliday: BusinessHoursConfig = {
      ...bh,
      holidays: [{ date: '2026-04-27', label: 'Special closure' }],
    };
    expect(
      isWithinBusinessHours(withHoliday, new Date('2026-04-27T10:00:00Z')),
    ).toBe(false);
  });

  it('treats empty schedule as always-open', () => {
    expect(
      isWithinBusinessHours({ timezone: 'Europe/Prague', schedule: [] }),
    ).toBe(true);
  });
});

describe('normalizeE164', () => {
  it('preserves well-formed E.164', () => {
    expect(normalizeE164('+420777123456')).toBe('+420777123456');
  });

  it('strips spaces and punctuation', () => {
    expect(normalizeE164('+420 777 123 456')).toBe('+420777123456');
    expect(normalizeE164('+420-777-123-456')).toBe('+420777123456');
  });

  it('converts 00- prefix to +', () => {
    expect(normalizeE164('00420777123456')).toBe('+420777123456');
  });

  it('adds default CZ country code for local-looking numbers', () => {
    expect(normalizeE164('777123456')).toBe('+420777123456');
  });

  it('uses a supplied default country code', () => {
    expect(normalizeE164('777123456', '421')).toBe('+421777123456');
  });

  it('rejects clearly invalid numbers', () => {
    expect(normalizeE164('')).toBeNull();
    expect(normalizeE164('abc')).toBeNull();
    expect(normalizeE164('+1234567')).toBeNull(); // too short
  });
});

describe('selectHuntPool', () => {
  const presence: AgentPresence[] = [
    { userId: 'a', status: 'available', lastActiveAt: new Date(1000), callsToday: 5 },
    { userId: 'b', status: 'available', lastActiveAt: new Date(5000), callsToday: 2 },
    { userId: 'c', status: 'busy', lastActiveAt: new Date(3000), callsToday: 0 },
  ];

  it('ring-all returns all available agents', () => {
    expect(selectHuntPool(['a', 'b', 'c'], presence, 'ring-all').userIds).toEqual([
      'a',
      'b',
    ]);
  });

  it('round-robin rotates through available agents', () => {
    const first = selectHuntPool(['a', 'b', 'c'], presence, 'round-robin', 0);
    expect(first.userIds).toEqual(['a']);
    expect(first.nextRrIndex).toBe(1);
    const second = selectHuntPool(['a', 'b', 'c'], presence, 'round-robin', 1);
    expect(second.userIds).toEqual(['b']);
    expect(second.nextRrIndex).toBe(0);
  });

  it('least-idle picks the most-recently-active agent', () => {
    expect(
      selectHuntPool(['a', 'b', 'c'], presence, 'least-idle').userIds,
    ).toEqual(['b']);
  });

  it('fewest-calls picks the agent with lowest callsToday', () => {
    expect(
      selectHuntPool(['a', 'b', 'c'], presence, 'fewest-calls').userIds,
    ).toEqual(['b']);
  });

  it('falls back to all candidates when none are available', () => {
    const stale = presence.map((p) => ({ ...p, status: 'offline' as const }));
    expect(
      selectHuntPool(['a', 'b'], stale, 'ring-all').userIds.sort(),
    ).toEqual(['a', 'b']);
  });

  it('returns empty pool for empty candidate list', () => {
    expect(selectHuntPool([], presence, 'ring-all')).toEqual({
      userIds: [],
      nextRrIndex: 0,
    });
  });
});
