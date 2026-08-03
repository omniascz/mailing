import { describe, it, expect } from 'vitest';
import {
  classifyGraymail,
  computeEmailHealthScore,
  aggregateReputation,
  buildPublicBadge,
  gradeToStatus,
  gradeToColor,
  renderReputationBadgeSvg,
  type GraymailSignals,
  type EmailHealthMetrics,
  type ReputationProviderInput,
  type PublicBadgeInput,
} from './pure.js';

const base: GraymailSignals = {
  sendsInWindow: 20,
  engagementsInWindow: 5,
  daysSinceLastEngagement: 10,
  ageInDays: 180,
};

describe('classifyGraymail', () => {
  it('returns "engaged" for active contacts', () => {
    const res = classifyGraymail(base);
    expect(res.tier).toBe('engaged');
    expect(res.suppressBroadcast).toBe(false);
    expect(res.engagementRate).toBe(0.25);
  });

  it('returns "at_risk" when engagement rate is below floor', () => {
    const res = classifyGraymail({
      ...base,
      sendsInWindow: 100,
      engagementsInWindow: 1,
    });
    expect(res.tier).toBe('at_risk');
    expect(res.suppressBroadcast).toBe(false);
  });

  it('returns "graymail" when no engagement for 90+ days', () => {
    const res = classifyGraymail({
      ...base,
      daysSinceLastEngagement: 100,
      engagementsInWindow: 0,
    });
    expect(res.tier).toBe('graymail');
    expect(res.suppressBroadcast).toBe(true);
  });

  it('returns "dormant" when no engagement for 180+ days', () => {
    const res = classifyGraymail({
      ...base,
      daysSinceLastEngagement: 200,
      engagementsInWindow: 0,
    });
    expect(res.tier).toBe('dormant');
    expect(res.suppressBroadcast).toBe(true);
  });

  it('returns "dormant" when heavily mailed with zero engagement', () => {
    const res = classifyGraymail({
      ...base,
      sendsInWindow: 30,
      engagementsInWindow: 0,
      daysSinceLastEngagement: null,
    });
    expect(res.tier).toBe('dormant');
  });

  it('skips classification for brand-new contacts', () => {
    const res = classifyGraymail({
      ...base,
      ageInDays: 3,
      engagementsInWindow: 0,
    });
    expect(res.tier).toBe('engaged');
    expect(res.reason).toContain('new contact');
  });

  it('skips classification with too few sends', () => {
    const res = classifyGraymail({
      ...base,
      sendsInWindow: 2,
      engagementsInWindow: 0,
      daysSinceLastEngagement: 200,
    });
    expect(res.tier).toBe('engaged');
    expect(res.reason).toContain('insufficient');
  });

  it('respects custom thresholds', () => {
    const res = classifyGraymail(
      { ...base, daysSinceLastEngagement: 60, engagementsInWindow: 0 },
      { staleDays: 30 },
    );
    expect(res.tier).toBe('graymail');
  });
});

describe('computeEmailHealthScore', () => {
  const healthy: EmailHealthMetrics = {
    sends: 10_000,
    delivered: 9_900,
    bounces: 50,
    hardBounces: 20,
    softBounces: 30,
    complaints: 5,
    opens: 3_000,
    clicks: 500,
    unsubscribes: 30,
  };

  it('gives an A to a healthy sender', () => {
    const result = computeEmailHealthScore(healthy);
    expect(result.grade).toBe('A');
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.issues).toEqual([]);
  });

  it('penalises high complaint rate harder than delivery dip', () => {
    const complaintHeavy = computeEmailHealthScore({
      ...healthy,
      complaints: 100,
    });
    const deliveryDip = computeEmailHealthScore({
      ...healthy,
      delivered: 9_000,
    });
    expect(complaintHeavy.score).toBeLessThan(deliveryDip.score);
    expect(complaintHeavy.issues.some((i) => i.includes('Complaint'))).toBe(true);
  });

  it('flags hard bounces separately from soft', () => {
    const result = computeEmailHealthScore({
      ...healthy,
      hardBounces: 500,
      bounces: 500,
    });
    expect(result.issues.some((i) => i.includes('Hard bounce'))).toBe(true);
  });

  it('computes component sub-rates', () => {
    const result = computeEmailHealthScore(healthy);
    expect(result.components.deliveryRate).toBeCloseTo(0.99, 2);
    expect(result.components.engagementRate).toBeCloseTo(0.3535, 4);
    expect(result.components.complaintRate).toBeCloseTo(5 / 9900, 4);
  });

  it('falls to F for a disastrous sender', () => {
    const disaster = computeEmailHealthScore({
      sends: 1000,
      delivered: 700,
      bounces: 300,
      hardBounces: 200,
      softBounces: 100,
      complaints: 50,
      opens: 5,
      clicks: 0,
      unsubscribes: 40,
      blocks: 50,
    });
    expect(disaster.grade).toBe('F');
    expect(disaster.score).toBeLessThan(40);
    expect(disaster.issues.length).toBeGreaterThan(3);
  });

  it('handles zero sends gracefully', () => {
    const empty = computeEmailHealthScore({
      sends: 0,
      delivered: 0,
      bounces: 0,
      hardBounces: 0,
      softBounces: 0,
      complaints: 0,
      opens: 0,
      clicks: 0,
      unsubscribes: 0,
    });
    // Zero sends means no data — default perfect score
    expect(empty.grade).toBe('A');
    expect(empty.issues).toEqual([]);
  });

  it('clamps score to 0..100', () => {
    const result = computeEmailHealthScore({
      sends: 1000,
      delivered: 0,
      bounces: 1000,
      hardBounces: 1000,
      softBounces: 0,
      complaints: 500,
      opens: 0,
      clicks: 0,
      unsubscribes: 500,
      blocks: 500,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('aggregateReputation', () => {
  const high: ReputationProviderInput = { tier: 'high', score: 90, spamRate: 0.0001 };
  const medium: ReputationProviderInput = { tier: 'medium', score: 60, spamRate: 0.002 };
  const low: ReputationProviderInput = { tier: 'low', score: 25, spamRate: 0.012 };
  const unknown: ReputationProviderInput = { tier: 'unknown' };

  it('returns "high" when all providers report high', () => {
    const res = aggregateReputation([high, high]);
    expect(res.overallTier).toBe('high');
    expect(res.hasAlert).toBe(false);
    expect(res.overallScore).toBe(90);
  });

  it('downgrades to worst tier — medium wins over high', () => {
    const res = aggregateReputation([high, medium]);
    expect(res.overallTier).toBe('medium');
  });

  it('downgrades to low if any provider says low', () => {
    const res = aggregateReputation([high, medium, low]);
    expect(res.overallTier).toBe('low');
    expect(res.hasAlert).toBe(true);
  });

  it('returns unknown when all providers are unknown', () => {
    const res = aggregateReputation([unknown, unknown]);
    expect(res.overallTier).toBe('unknown');
    expect(res.overallScore).toBeNull();
    expect(res.maxSpamRate).toBeNull();
  });

  it('ignores unknown providers when computing overall tier', () => {
    const res = aggregateReputation([unknown, high]);
    expect(res.overallTier).toBe('high');
  });

  it('averages numeric scores across providers with data', () => {
    const res = aggregateReputation([
      { tier: 'high', score: 80 },
      { tier: 'medium', score: 60 },
    ]);
    expect(res.overallScore).toBe(70);
  });

  it('sets hasAlert for spam rate > 0.5%', () => {
    const res = aggregateReputation([{ tier: 'medium', spamRate: 0.006 }]);
    expect(res.hasAlert).toBe(true);
  });

  it('does not set hasAlert for low spam rate below threshold', () => {
    const res = aggregateReputation([{ tier: 'high', spamRate: 0.001 }]);
    expect(res.hasAlert).toBe(false);
  });

  it('handles empty providers array', () => {
    const res = aggregateReputation([]);
    expect(res.overallTier).toBe('unknown');
    expect(res.overallScore).toBeNull();
    expect(res.hasAlert).toBe(false);
  });

  it('ignores error providers in tier calculation', () => {
    const errProvider: ReputationProviderInput = { tier: 'unknown', error: 'API timeout' };
    const res = aggregateReputation([high, errProvider]);
    expect(res.overallTier).toBe('high');
  });
});

describe('public reputation badge (#440)', () => {
  const base: PublicBadgeInput = {
    domain: 'mail.acme.cz',
    score: 92,
    grade: 'A',
    bounceRate: 0.0123,
    complaintRate: 0.00042,
    warmupStatus: 'warm',
    verified: true,
    windowDays: 30,
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  it('maps grade to status', () => {
    expect(gradeToStatus('A')).toBe('excellent');
    expect(gradeToStatus('B')).toBe('good');
    expect(gradeToStatus('C')).toBe('fair');
    expect(gradeToStatus('D')).toBe('poor');
    expect(gradeToStatus('F')).toBe('poor');
  });

  it('assigns distinct colours per grade', () => {
    const colors = ['A', 'B', 'C', 'D', 'F'].map((g) =>
      gradeToColor(g as PublicBadgeInput['grade']),
    );
    expect(new Set(colors).size).toBe(5);
  });

  it('rounds rates to percentages and preserves coarse fields', () => {
    const badge = buildPublicBadge(base);
    expect(badge.bounceRatePct).toBe(1.23); // 0.0123 → 1.23%
    expect(badge.complaintRatePct).toBe(0.042); // 0.00042 → 0.042%
    expect(badge.status).toBe('excellent');
    expect(badge.warmupStatus).toBe('warm');
    expect(badge.verified).toBe(true);
    expect(badge.windowDays).toBe(30);
    expect(badge.updatedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('does not leak raw send volumes', () => {
    const badge = buildPublicBadge(base) as unknown as Record<string, unknown>;
    expect(badge.sends).toBeUndefined();
    expect(badge.delivered).toBeUndefined();
  });

  it('renders a valid self-contained SVG badge', () => {
    const svg = renderReputationBadgeSvg('sender reputation', 'A (92)', gradeToColor('A'));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    expect(svg).toContain('sender reputation');
    expect(svg).toContain('A (92)');
    expect(svg).toContain('#4c1');
  });

  it('escapes XML-special characters in badge text', () => {
    const svg = renderReputationBadgeSvg('a<b>&c', 'x', '#4c1');
    expect(svg).toContain('a&lt;b&gt;&amp;c');
    expect(svg).not.toContain('a<b>&c');
  });
});
