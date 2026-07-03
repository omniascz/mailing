import { describe, it, expect } from 'vitest';
import { exceedsRate, PLAN_SEND_RATE } from './send-rate.js';

describe('exceedsRate', () => {
  it('permits up to the limit and rejects beyond', () => {
    expect(exceedsRate(0, 1, 5)).toBe(false);
    expect(exceedsRate(4, 1, 5)).toBe(false); // reaches exactly 5
    expect(exceedsRate(5, 1, 5)).toBe(true); // would be 6
    expect(exceedsRate(3, 5, 5)).toBe(true); // batch cost overflows
  });

  it('treats 0 (or negative) limit as unlimited', () => {
    expect(exceedsRate(1_000_000, 1000, 0)).toBe(false);
  });

  it('has plan defaults with enterprise unlimited', () => {
    expect(PLAN_SEND_RATE.free).toBe(1);
    expect(PLAN_SEND_RATE.pro).toBeGreaterThan(PLAN_SEND_RATE.starter!);
    expect(PLAN_SEND_RATE.enterprise).toBe(0);
  });
});
