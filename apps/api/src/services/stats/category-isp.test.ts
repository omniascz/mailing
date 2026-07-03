import { describe, it, expect } from 'vitest';
import { rollupEventCounts } from './category-isp.js';

describe('rollupEventCounts', () => {
  it('folds flat rows into per-dimension funnels', () => {
    const out = rollupEventCounts([
      { dimension: 'newsletter', eventType: 'send', count: 100 },
      { dimension: 'newsletter', eventType: 'deliver', count: 98 },
      { dimension: 'newsletter', eventType: 'open', count: 40 },
      { dimension: 'newsletter', eventType: 'click', count: 12 },
      { dimension: 'newsletter', eventType: 'bounce', count: 2 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      dimension: 'newsletter',
      requests: 100,
      delivered: 98,
      opens: 40,
      clicks: 12,
      bounces: 2,
    });
  });

  it('groups null dimensions under the null label', () => {
    const out = rollupEventCounts(
      [{ dimension: null, eventType: 'send', count: 5 }],
      'uncategorized',
    );
    expect(out[0]!.dimension).toBe('uncategorized');
    expect(out[0]!.requests).toBe(5);
  });

  it('sorts by requests desc then name', () => {
    const out = rollupEventCounts([
      { dimension: 'b', eventType: 'send', count: 10 },
      { dimension: 'a', eventType: 'send', count: 50 },
      { dimension: 'c', eventType: 'send', count: 50 },
    ]);
    expect(out.map((s) => s.dimension)).toEqual(['a', 'c', 'b']);
  });

  it('accumulates counts across multiple rows for the same dimension/type', () => {
    const out = rollupEventCounts([
      { dimension: 'gmail.com', eventType: 'open', count: 3 },
      { dimension: 'gmail.com', eventType: 'open', count: 4 },
    ]);
    expect(out[0]!.opens).toBe(7);
  });

  it('maps unsubscribe + complaint event types', () => {
    const out = rollupEventCounts([
      { dimension: 'x', eventType: 'unsubscribe', count: 2 },
      { dimension: 'x', eventType: 'complaint', count: 1 },
    ]);
    expect(out[0]).toMatchObject({ unsubscribes: 2, complaints: 1 });
  });
});
