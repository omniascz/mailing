import { describe, it, expect } from 'vitest';
import { scoreDealHealth, scoreProspect, aggregateIntent, type DealHealthSignals } from './pure.js';

const healthy: DealHealthSignals = {
  stageAgeDays: 3,
  lastActivityDays: 1,
  daysToClose: 20,
  ageDays: 10,
  medianWonCycleDays: 30,
};

describe('scoreDealHealth', () => {
  it('returns healthy for a fresh, active deal', () => {
    const res = scoreDealHealth(healthy);
    expect(res.risk).toBe('healthy');
    expect(res.score).toBeGreaterThanOrEqual(75);
    expect(res.reasons).toEqual([]);
  });

  it('penalises stalled stage heavily', () => {
    const res = scoreDealHealth({ ...healthy, stageAgeDays: 60 });
    expect(res.reasons.some((r) => r.includes('stuck'))).toBe(true);
    expect(res.score).toBeLessThan(75);
  });

  it('penalises silent deals', () => {
    const res = scoreDealHealth({ ...healthy, lastActivityDays: 30 });
    expect(res.reasons.some((r) => r.includes('no activity'))).toBe(true);
  });

  it('penalises overdue deals', () => {
    const res = scoreDealHealth({ ...healthy, daysToClose: -10 });
    expect(res.reasons.some((r) => r.includes('past expected close'))).toBe(true);
  });

  it('flags deals much older than median win cycle', () => {
    const res = scoreDealHealth({ ...healthy, ageDays: 120, medianWonCycleDays: 30 });
    expect(res.reasons.some((r) => r.includes('deal age'))).toBe(true);
  });

  it('clamps to 0..100', () => {
    const res = scoreDealHealth({
      stageAgeDays: 200,
      lastActivityDays: 200,
      daysToClose: -200,
      ageDays: 500,
      medianWonCycleDays: 30,
    });
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
    expect(res.risk).toBe('critical');
  });

  it('returns distinct recommendations per risk level', () => {
    const critical = scoreDealHealth({
      stageAgeDays: 200,
      lastActivityDays: 200,
      daysToClose: -200,
      ageDays: 500,
      medianWonCycleDays: 30,
    });
    const watch = scoreDealHealth({ ...healthy, stageAgeDays: 45 });
    expect(critical.recommendation).toContain('Escalate');
    expect(watch.risk).toBe('watch');
    expect(watch.recommendation).toContain('check-in');
  });
});

describe('scoreProspect', () => {
  it('returns hot for strong ICP + intent', () => {
    const res = scoreProspect({
      icpFit: 85,
      engagementScore: 70,
      intentScore: 90,
      suppressed: false,
    });
    expect(res.tier).toBe('hot');
    expect(res.score).toBeGreaterThanOrEqual(75);
  });

  it('returns skip for suppressed contacts', () => {
    const res = scoreProspect({
      icpFit: 100,
      engagementScore: 100,
      intentScore: 100,
      suppressed: true,
    });
    expect(res.tier).toBe('skip');
    expect(res.score).toBe(0);
  });

  it('weights ICP + intent over engagement', () => {
    const a = scoreProspect({ icpFit: 100, engagementScore: 0, intentScore: 0, suppressed: false });
    const b = scoreProspect({ icpFit: 0, engagementScore: 100, intentScore: 0, suppressed: false });
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('cold tier recommends content touch', () => {
    const res = scoreProspect({
      icpFit: 40,
      engagementScore: 30,
      intentScore: 20,
      suppressed: false,
    });
    expect(res.tier).toBe('cold');
    expect(res.recommendation).toContain('Revisit');
  });
});

describe('aggregateIntent', () => {
  it('returns none for empty events', () => {
    expect(aggregateIntent([])).toEqual({ score: 0, bucket: 'none' });
  });

  it('decays old signals', () => {
    const recent = aggregateIntent([{ weight: 1.0, ageInDays: 0 }]);
    const old = aggregateIntent([{ weight: 1.0, ageInDays: 42 }]); // 3 half-lives
    expect(recent.score).toBeGreaterThan(old.score);
  });

  it('stacks multiple signals', () => {
    const res = aggregateIntent([
      { weight: 0.8, ageInDays: 0 }, // pricing-page visit
      { weight: 0.4, ageInDays: 2 },
      { weight: 0.2, ageInDays: 7 },
    ]);
    expect(res.score).toBeGreaterThan(100 * 0.8);
    expect(['medium', 'high']).toContain(res.bucket);
  });

  it('clamps to 100', () => {
    const res = aggregateIntent(Array.from({ length: 50 }, () => ({ weight: 1.0, ageInDays: 0 })));
    expect(res.score).toBe(100);
    expect(res.bucket).toBe('high');
  });

  it('honours custom half-life', () => {
    const short = aggregateIntent([{ weight: 1.0, ageInDays: 7 }], 7);
    const long = aggregateIntent([{ weight: 1.0, ageInDays: 7 }], 30);
    expect(long.score).toBeGreaterThan(short.score);
  });
});
