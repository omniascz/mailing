import { describe, it, expect } from 'vitest';
import { evaluateUsageAlerts, billingPeriod } from './usage-alerts.js';

const cap = (sendPct: number, contactPct: number) => ({
  sends: { current: sendPct, limit: 100, remaining: 100 - sendPct, pctUsed: sendPct },
  contacts: { current: contactPct, limit: 100, remaining: 100 - contactPct, pctUsed: contactPct },
});

describe('evaluateUsageAlerts', () => {
  it('fires the highest crossed threshold per metric', () => {
    const out = evaluateUsageAlerts(cap(96, 82), [80, 95, 100], new Set());
    expect(out).toContainEqual(expect.objectContaining({ metric: 'sends', threshold: 95 }));
    expect(out).toContainEqual(expect.objectContaining({ metric: 'contacts', threshold: 80 }));
  });

  it('does not re-fire an already-fired threshold', () => {
    const out = evaluateUsageAlerts(cap(96, 10), [80, 95, 100], new Set(['sends:95']));
    expect(out.find((a) => a.metric === 'sends')).toBeUndefined();
  });

  it('fires a newly-crossed higher threshold even if a lower one already fired', () => {
    const out = evaluateUsageAlerts(cap(100, 10), [80, 95, 100], new Set(['sends:95']));
    expect(out).toContainEqual(expect.objectContaining({ metric: 'sends', threshold: 100 }));
  });

  it('does not fire below the lowest threshold', () => {
    expect(evaluateUsageAlerts(cap(50, 50), [80, 95, 100], new Set())).toEqual([]);
  });

  it('never fires for unlimited metrics (limit <= 0)', () => {
    const out = evaluateUsageAlerts(
      { sends: { current: 5, limit: 0, remaining: 0, pctUsed: 999 }, contacts: { current: 0, limit: 0, remaining: 0, pctUsed: 999 } },
      [80],
      new Set(),
    );
    expect(out).toEqual([]);
  });
});

describe('billingPeriod', () => {
  it('buckets by UTC year-month', () => {
    expect(billingPeriod(new Date('2026-07-03T12:00:00Z'))).toBe('2026-07');
    expect(billingPeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});
