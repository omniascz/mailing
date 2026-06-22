import { describe, it, expect } from 'vitest';
import { computeCampaignStats, aggregateOrgDaily } from './index.js';

describe('computeCampaignStats (shared PG/ClickHouse fold)', () => {
  it('computes rates from grouped event rows', () => {
    const stats = computeCampaignStats([
      { eventType: 'send', bounceType: null, total: 1000, uniqueContacts: 1000 },
      { eventType: 'deliver', bounceType: null, total: 950, uniqueContacts: 950 },
      { eventType: 'open', bounceType: null, total: 600, uniqueContacts: 400 },
      { eventType: 'click', bounceType: null, total: 200, uniqueContacts: 120 },
      { eventType: 'bounce', bounceType: 'hard', total: 30, uniqueContacts: 30 },
      { eventType: 'bounce', bounceType: 'soft', total: 20, uniqueContacts: 20 },
      { eventType: 'unsubscribe', bounceType: null, total: 5, uniqueContacts: 5 },
      { eventType: 'complaint', bounceType: null, total: 2, uniqueContacts: 2 },
    ]);
    expect(stats.sent).toBe(1000);
    expect(stats.delivered).toBe(950);
    expect(stats.deliveryRate).toBe(95);
    expect(stats.uniqueOpens).toBe(400);
    expect(stats.openRate).toBeCloseTo(42.11, 1); // 400/950
    expect(stats.bounces).toBe(50);
    expect(stats.hardBounces).toBe(30);
    expect(stats.ctor).toBe(30); // 120/400
  });

  it('handles an empty result (no divide-by-zero)', () => {
    const stats = computeCampaignStats([]);
    expect(stats.sent).toBe(0);
    expect(stats.openRate).toBe(0);
  });
});

describe('aggregateOrgDaily', () => {
  it('folds per-day per-type counts into a sorted series', () => {
    const series = aggregateOrgDaily([
      { date: '2026-06-02', eventType: 'open', cnt: 5 },
      { date: '2026-06-01', eventType: 'send', cnt: 10 },
      { date: '2026-06-01', eventType: 'deliver', cnt: 9 },
      { date: '2026-06-02', eventType: 'click', cnt: 2 },
    ]);
    expect(series.map((s) => s.date)).toEqual(['2026-06-01', '2026-06-02']);
    expect(series[0]).toMatchObject({ sent: 10, delivered: 9 });
    expect(series[1]).toMatchObject({ opens: 5, clicks: 2 });
  });
});
