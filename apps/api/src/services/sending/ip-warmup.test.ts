import { describe, it, expect } from 'vitest';
import {
  getDailyLimit,
  getWarmupPhase,
  WARMUP_COMPLETE_DAY,
  WARMUP_SCHEDULE,
} from './ip-warmup.js';

// Pure function tests — no DB/Redis required

describe('getDailyLimit', () => {
  it('returns 50 for days 1-3', () => {
    expect(getDailyLimit(1)).toBe(50);
    expect(getDailyLimit(2)).toBe(50);
    expect(getDailyLimit(3)).toBe(50);
  });

  it('returns 200 for days 4-7', () => {
    expect(getDailyLimit(4)).toBe(200);
    expect(getDailyLimit(7)).toBe(200);
  });

  it('returns 1000 for days 8-14', () => {
    expect(getDailyLimit(8)).toBe(1_000);
    expect(getDailyLimit(14)).toBe(1_000);
  });

  it('returns 5000 for days 15-21', () => {
    expect(getDailyLimit(15)).toBe(5_000);
    expect(getDailyLimit(21)).toBe(5_000);
  });

  it('returns 20000 for days 22-30', () => {
    expect(getDailyLimit(22)).toBe(20_000);
    expect(getDailyLimit(30)).toBe(20_000);
  });

  it('returns Infinity for warm IPs (day 31+)', () => {
    expect(getDailyLimit(31)).toBe(Infinity);
    expect(getDailyLimit(100)).toBe(Infinity);
  });

  it('WARMUP_COMPLETE_DAY matches schedule boundary', () => {
    expect(getDailyLimit(WARMUP_COMPLETE_DAY)).toBe(Infinity);
    expect(getDailyLimit(WARMUP_COMPLETE_DAY - 1)).toBeLessThan(Infinity);
  });
});

describe('getWarmupPhase', () => {
  it('returns Phase 1 for day 1', () => {
    expect(getWarmupPhase(1)).toMatch(/Phase 1/);
  });

  it('returns Phase 5 for day 28', () => {
    expect(getWarmupPhase(28)).toMatch(/Phase 5/);
  });

  it('returns warm label for day 31+', () => {
    expect(getWarmupPhase(31)).toMatch(/Warm/i);
    expect(getWarmupPhase(50)).toMatch(/Warm/i);
  });
});

describe('WARMUP_SCHEDULE', () => {
  it('has 5 phases', () => {
    expect(WARMUP_SCHEDULE).toHaveLength(5);
  });

  it('phases are contiguous (no gaps)', () => {
    for (let i = 0; i < WARMUP_SCHEDULE.length - 1; i++) {
      const current = WARMUP_SCHEDULE[i]!;
      const next = WARMUP_SCHEDULE[i + 1]!;
      expect(next.fromDay).toBe(current.toDay + 1);
    }
  });

  it('daily limits increase monotonically', () => {
    for (let i = 0; i < WARMUP_SCHEDULE.length - 1; i++) {
      const current = WARMUP_SCHEDULE[i]!;
      const next = WARMUP_SCHEDULE[i + 1]!;
      expect(next.dailyLimit).toBeGreaterThan(current.dailyLimit);
    }
  });
});
