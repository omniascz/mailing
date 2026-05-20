import { describe, it, expect } from 'vitest';
import {
  computeMonthlyForecast,
  computeWinLoss,
  computeAverageCycleDays,
  computeStageDistribution,
  computeRepPerformance,
  type OpenDealRow,
  type ClosedDealRow,
  type StageConfig,
} from './pure.js';

const stages: StageConfig[] = [
  { id: 'new', name: 'New', order: 0, probability: 10 },
  { id: 'qual', name: 'Qualified', order: 1, probability: 40 },
  { id: 'prop', name: 'Proposal', order: 2, probability: 75 },
  { id: 'won', name: 'Won', order: 3, probability: 100 },
];

describe('computeMonthlyForecast', () => {
  const asOf = new Date(Date.UTC(2026, 3, 1)); // April 2026

  it('buckets deals into month columns + computes best/worst/weighted', () => {
    const deals: OpenDealRow[] = [
      { stageId: 'qual', value: 1000, expectedCloseDate: new Date(Date.UTC(2026, 3, 15)) },
      { stageId: 'prop', value: 5000, expectedCloseDate: new Date(Date.UTC(2026, 3, 20)) },
      { stageId: 'prop', value: 2000, expectedCloseDate: new Date(Date.UTC(2026, 4, 10)) },
      { stageId: 'new', value: 500, expectedCloseDate: new Date(Date.UTC(2026, 5, 1)) },
    ];
    const { monthly, totals } = computeMonthlyForecast(deals, stages, 3, asOf);

    expect(monthly).toHaveLength(3);
    expect(monthly[0]).toMatchObject({
      month: '2026-04',
      dealCount: 2,
      bestCase: 6000,
      worstCase: 5000, // only the prop deal (prob >= 75)
      weighted: 1000 * 0.4 + 5000 * 0.75,
    });
    expect(monthly[1]).toMatchObject({
      month: '2026-05',
      dealCount: 1,
      bestCase: 2000,
      worstCase: 2000,
      weighted: 2000 * 0.75,
    });
    expect(monthly[2]!.month).toBe('2026-06');

    expect(totals.dealCount).toBe(4);
    expect(totals.bestCase).toBe(8500);
    expect(totals.weighted).toBeCloseTo(400 + 3750 + 1500 + 50, 2);
  });

  it('ignores deals outside the horizon', () => {
    const deals: OpenDealRow[] = [
      { stageId: 'qual', value: 1000, expectedCloseDate: new Date(Date.UTC(2027, 0, 1)) },
    ];
    const { monthly, totals } = computeMonthlyForecast(deals, stages, 3, asOf);
    expect(totals.dealCount).toBe(0);
    expect(monthly.every((m) => m.dealCount === 0)).toBe(true);
  });

  it('ignores deals without expectedCloseDate', () => {
    const deals: OpenDealRow[] = [{ stageId: 'qual', value: 1000, expectedCloseDate: null }];
    const { totals } = computeMonthlyForecast(deals, stages, 3, asOf);
    expect(totals.dealCount).toBe(0);
  });

  it('uses 0% probability for unknown stages', () => {
    const deals: OpenDealRow[] = [
      { stageId: 'bogus', value: 1000, expectedCloseDate: new Date(Date.UTC(2026, 3, 15)) },
    ];
    const { monthly } = computeMonthlyForecast(deals, stages, 3, asOf);
    expect(monthly[0]!.weighted).toBe(0);
    expect(monthly[0]!.bestCase).toBe(1000);
  });

  it('rejects non-positive horizonMonths', () => {
    expect(() => computeMonthlyForecast([], stages, 0, asOf)).toThrow();
    expect(() => computeMonthlyForecast([], stages, -1, asOf)).toThrow();
  });
});

describe('computeWinLoss', () => {
  const deals: ClosedDealRow[] = [
    { value: 10000, status: 'won', wonAt: new Date(), createdAt: new Date() },
    { value: 5000, status: 'won', wonAt: new Date(), createdAt: new Date() },
    { value: 8000, status: 'lost', lostAt: new Date(), createdAt: new Date(), lostReason: 'price' },
    { value: 2000, status: 'lost', lostAt: new Date(), createdAt: new Date(), lostReason: 'price' },
    {
      value: 3000,
      status: 'lost',
      lostAt: new Date(),
      createdAt: new Date(),
      lostReason: 'timing',
    },
    { value: 4000, status: 'open', createdAt: new Date() },
  ];

  it('computes win rate, totals, and averages', () => {
    const summary = computeWinLoss(deals);
    expect(summary.won).toBe(2);
    expect(summary.lost).toBe(3);
    expect(summary.open).toBe(1);
    expect(summary.total).toBe(6);
    expect(summary.winRate).toBe(2 / 5);
    expect(summary.totalWonValue).toBe(15000);
    expect(summary.totalLostValue).toBe(13000);
    expect(summary.averageWonValue).toBe(7500);
  });

  it('groups lost reasons with share percentage', () => {
    const summary = computeWinLoss(deals);
    expect(summary.lostReasonBreakdown[0]).toMatchObject({ reason: 'price', count: 2 });
    expect(summary.lostReasonBreakdown[0]!.share).toBeCloseTo(2 / 3, 4);
    expect(summary.lostReasonBreakdown[1]).toMatchObject({ reason: 'timing', count: 1 });
  });

  it('returns 0 winRate when no closed deals', () => {
    expect(computeWinLoss([]).winRate).toBe(0);
    expect(computeWinLoss([{ value: 1, status: 'open', createdAt: new Date() }]).winRate).toBe(0);
  });

  it('labels missing lost reasons as "unknown"', () => {
    const summary = computeWinLoss([
      { value: 1, status: 'lost', lostAt: new Date(), createdAt: new Date() },
    ]);
    expect(summary.lostReasonBreakdown[0]!.reason).toBe('unknown');
  });
});

describe('computeAverageCycleDays', () => {
  const day = 86_400_000;
  it('averages days from createdAt → won/lost', () => {
    const deals: ClosedDealRow[] = [
      { value: 1, status: 'won', createdAt: new Date(0), wonAt: new Date(10 * day) },
      { value: 2, status: 'won', createdAt: new Date(0), wonAt: new Date(20 * day) },
      { value: 3, status: 'lost', createdAt: new Date(0), lostAt: new Date(15 * day) },
    ];
    const result = computeAverageCycleDays(deals);
    expect(result.wonAverage).toBe(15);
    expect(result.lostAverage).toBe(15);
  });

  it('returns 0 when no closed deals', () => {
    expect(computeAverageCycleDays([]).wonAverage).toBe(0);
    expect(computeAverageCycleDays([]).lostAverage).toBe(0);
  });
});

describe('computeStageDistribution', () => {
  it('returns one row per configured stage in order, with empty stages at 0', () => {
    const deals: OpenDealRow[] = [
      { stageId: 'qual', value: 500, expectedCloseDate: null },
      { stageId: 'qual', value: 700, expectedCloseDate: null },
      { stageId: 'prop', value: 2000, expectedCloseDate: null },
    ];
    const dist = computeStageDistribution(deals, stages);
    expect(dist).toHaveLength(4);
    expect(dist.map((s) => s.stageId)).toEqual(['new', 'qual', 'prop', 'won']);
    expect(dist.find((s) => s.stageId === 'qual')).toMatchObject({
      dealCount: 2,
      totalValue: 1200,
    });
    expect(dist.find((s) => s.stageId === 'new')).toMatchObject({ dealCount: 0, totalValue: 0 });
  });
});

describe('computeRepPerformance', () => {
  it('aggregates deals per owner with won value + win rate, sorted by won value', () => {
    const deals: ClosedDealRow[] = [
      {
        value: 10000,
        status: 'won',
        createdAt: new Date(),
        wonAt: new Date(),
        ownerUserId: 'alice',
      },
      {
        value: 5000,
        status: 'won',
        createdAt: new Date(),
        wonAt: new Date(),
        ownerUserId: 'alice',
      },
      {
        value: 3000,
        status: 'lost',
        createdAt: new Date(),
        lostAt: new Date(),
        ownerUserId: 'alice',
      },
      { value: 8000, status: 'won', createdAt: new Date(), wonAt: new Date(), ownerUserId: 'bob' },
      {
        value: 1000,
        status: 'lost',
        createdAt: new Date(),
        lostAt: new Date(),
        ownerUserId: 'bob',
      },
    ];
    const perf = computeRepPerformance(deals);
    expect(perf).toHaveLength(2);
    expect(perf[0]).toMatchObject({ ownerUserId: 'alice', wonDeals: 2, wonValue: 15000, deals: 3 });
    expect(perf[0]!.winRate).toBeCloseTo(2 / 3, 4);
    expect(perf[1]).toMatchObject({ ownerUserId: 'bob', wonDeals: 1, wonValue: 8000 });
  });

  it('skips deals without an owner', () => {
    const perf = computeRepPerformance([
      { value: 1000, status: 'won', createdAt: new Date(), wonAt: new Date() },
    ]);
    expect(perf).toEqual([]);
  });
});
