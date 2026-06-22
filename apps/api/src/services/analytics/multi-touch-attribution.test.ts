import { describe, it, expect } from 'vitest';
import { creditTouchPoints, touchesInWindow, type TouchPoint } from './multi-touch-attribution.js';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;
const tp = (campaignId: string, daysAgoFromT0: number): TouchPoint => ({
  campaignId,
  touchedAt: new Date(T0 - daysAgoFromT0 * DAY),
  eventType: 'open',
});

// ascending by time → list newest last
const touches = [tp('a', 21), tp('b', 14), tp('c', 0)];

describe('creditTouchPoints', () => {
  it('first_touch gives all credit to the earliest touch', () => {
    const c = creditTouchPoints(touches, 'first_touch');
    expect(c.map((x) => x.credit)).toEqual([1, 0, 0]);
  });

  it('last_touch gives all credit to the latest touch', () => {
    const c = creditTouchPoints(touches, 'last_touch');
    expect(c.map((x) => x.credit)).toEqual([0, 0, 1]);
  });

  it('linear splits evenly and sums to 1', () => {
    const c = creditTouchPoints(touches, 'linear');
    expect(c.every((x) => Math.abs(x.credit - 1 / 3) < 1e-9)).toBe(true);
    expect(c.reduce((a, b) => a + b.credit, 0)).toBeCloseTo(1, 9);
  });

  it('u_shaped gives 40/20/40 and sums to 1', () => {
    const c = creditTouchPoints(touches, 'u_shaped');
    expect(c[0]!.credit).toBeCloseTo(0.4, 9);
    expect(c[1]!.credit).toBeCloseTo(0.2, 9);
    expect(c[2]!.credit).toBeCloseTo(0.4, 9);
    expect(c.reduce((a, b) => a + b.credit, 0)).toBeCloseTo(1, 9);
  });

  it('time_decay: one half-life older → half the (pre-normalised) weight', () => {
    // Two touches: one at the last touch (age 0), one 7 days older (one half-life).
    const two = [tp('old', 7), tp('new', 0)];
    const c = creditTouchPoints(two, 'time_decay', { halfLifeDays: 7 });
    // raw weights 0.5 and 1 → normalised 1/3 and 2/3.
    expect(c[0]!.credit).toBeCloseTo(1 / 3, 6);
    expect(c[1]!.credit).toBeCloseTo(2 / 3, 6);
    expect(c.reduce((a, b) => a + b.credit, 0)).toBeCloseTo(1, 9);
  });

  it('time_decay credits are sane (most recent highest, sums to 1)', () => {
    const c = creditTouchPoints(touches, 'time_decay', { halfLifeDays: 7 });
    expect(c[2]!.credit).toBeGreaterThan(c[1]!.credit);
    expect(c[1]!.credit).toBeGreaterThan(c[0]!.credit);
    expect(c.reduce((a, b) => a + b.credit, 0)).toBeCloseTo(1, 9);
    // no NaN / negative from the old unit-mixed formula
    expect(c.every((x) => Number.isFinite(x.credit) && x.credit > 0)).toBe(true);
  });

  it('empty + single-touch edge cases', () => {
    expect(creditTouchPoints([], 'u_shaped')).toEqual([]);
    expect(creditTouchPoints([tp('solo', 0)], 'u_shaped')[0]!.credit).toBe(1);
  });
});

describe('touchesInWindow', () => {
  it('keeps only touches within [orderAt - lookback, orderAt]', () => {
    const orderAt = new Date(T0);
    const all = [tp('x', 120), tp('y', 30), tp('z', 0), { ...tp('future', -5) }];
    const win = touchesInWindow(all, orderAt, 90);
    const ids = win.map((t) => t.campaignId);
    expect(ids).toContain('y'); // 30d ago, inside 90d
    expect(ids).toContain('z'); // same day
    expect(ids).not.toContain('x'); // 120d ago, outside lookback
    expect(ids).not.toContain('future'); // after the order
  });
});
