import { describe, it, expect } from 'vitest';
import {
  classifyGraymail,
  computeEmailHealthScore,
  type GraymailSignals,
  type EmailHealthMetrics,
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
