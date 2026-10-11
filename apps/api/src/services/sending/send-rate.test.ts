import { describe, it, expect } from 'vitest';
import { PLAN_SEND_RATE } from './send-rate.js';

describe('PLAN_SEND_RATE', () => {
  it('has plan defaults with enterprise unlimited', () => {
    expect(PLAN_SEND_RATE.free).toBe(1);
    expect(PLAN_SEND_RATE.pro).toBeGreaterThan(PLAN_SEND_RATE.starter!);
    expect(PLAN_SEND_RATE.enterprise).toBe(0);
  });
});
