import { describe, it, expect } from 'vitest';
import { classifyBand, emptyFacts, scoreEngagement, type EngagementFacts } from './pure.js';

const facts = (overrides: Partial<EngagementFacts> = {}): EngagementFacts => ({
  ...emptyFacts(),
  ...overrides,
});

describe('classifyBand', () => {
  it('cold for 0-4', () => {
    expect(classifyBand(0)).toBe('cold');
    expect(classifyBand(4)).toBe('cold');
  });
  it('dormant for 5-19', () => {
    expect(classifyBand(5)).toBe('dormant');
    expect(classifyBand(19)).toBe('dormant');
  });
  it('at_risk for 20-39', () => {
    expect(classifyBand(20)).toBe('at_risk');
    expect(classifyBand(39)).toBe('at_risk');
  });
  it('engaged for 40-69', () => {
    expect(classifyBand(40)).toBe('engaged');
    expect(classifyBand(69)).toBe('engaged');
  });
  it('highly_engaged for 70+', () => {
    expect(classifyBand(70)).toBe('highly_engaged');
    expect(classifyBand(100)).toBe('highly_engaged');
  });
});

describe('scoreEngagement', () => {
  it('zero score + cold band for empty contact', () => {
    const r = scoreEngagement(emptyFacts());
    expect(r.score).toBe(0);
    expect(r.band).toBe('cold');
    expect(r.components).toEqual({
      email: 0,
      sms: 0,
      voice: 0,
      push: 0,
      web: 0,
      commerce: 0,
    });
  });

  it('highly_engaged for recent multi-channel activity', () => {
    const r = scoreEngagement(
      facts({
        emailSends: 30,
        emailOpens: 25,
        emailClicks: 15,
        daysSinceLastEmailEngagement: 1,
        pageViews: 20,
        identifiedPageViews: 10,
        daysSinceLastPageView: 2,
        totalOrders: 5,
        daysSinceLastOrder: 5,
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.band).toBe('highly_engaged');
  });

  it('at_risk band for fading single-channel engagement', () => {
    const r = scoreEngagement(
      facts({
        emailSends: 30,
        emailOpens: 8,
        emailClicks: 2,
        daysSinceLastEmailEngagement: 75,
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(5);
    expect(r.score).toBeLessThan(40);
    expect(['dormant', 'at_risk']).toContain(r.band);
  });

  it('clicks weigh heavier than opens', () => {
    const opensOnly = scoreEngagement(
      facts({
        emailSends: 20,
        emailOpens: 10,
        emailClicks: 0,
        daysSinceLastEmailEngagement: 5,
      }),
    );
    const opensAndClicks = scoreEngagement(
      facts({
        emailSends: 20,
        emailOpens: 10,
        emailClicks: 5,
        daysSinceLastEmailEngagement: 5,
      }),
    );
    expect(opensAndClicks.components.email).toBeGreaterThan(opensOnly.components.email);
  });

  it('identified page views weigh more than anonymous', () => {
    const anon = scoreEngagement(facts({ pageViews: 20, daysSinceLastPageView: 3 }));
    const identified = scoreEngagement(
      facts({ pageViews: 0, identifiedPageViews: 20, daysSinceLastPageView: 3 }),
    );
    expect(identified.components.web).toBeGreaterThan(anon.components.web);
  });

  it('commerce subscore zero when no orders or cart events', () => {
    const r = scoreEngagement(
      facts({
        emailSends: 10,
        emailOpens: 5,
        daysSinceLastEmailEngagement: 5,
      }),
    );
    expect(r.components.commerce).toBe(0);
  });

  it('recency decay: same volume but older drops the composite', () => {
    const fresh = scoreEngagement(
      facts({
        emailSends: 20,
        emailOpens: 20,
        emailClicks: 10,
        daysSinceLastEmailEngagement: 1,
      }),
    );
    const stale = scoreEngagement(
      facts({
        emailSends: 20,
        emailOpens: 20,
        emailClicks: 10,
        daysSinceLastEmailEngagement: 90,
      }),
    );
    expect(fresh.score).toBeGreaterThan(stale.score);
  });

  it('clamps composite to 0..100', () => {
    const r = scoreEngagement(
      facts({
        emailSends: 1_000_000,
        emailOpens: 1_000_000,
        emailClicks: 1_000_000,
        daysSinceLastEmailEngagement: 0,
        smsSends: 1000,
        smsReplies: 1000,
        daysSinceLastSmsReply: 0,
        voiceCalls: 100,
        voiceAnswered: 100,
        daysSinceLastVoiceAnswer: 0,
        pushSends: 1000,
        pushClicks: 1000,
        daysSinceLastPushClick: 0,
        pageViews: 1000,
        identifiedPageViews: 1000,
        daysSinceLastPageView: 0,
        totalOrders: 100,
        daysSinceLastOrder: 0,
      }),
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it('component subscores stay within 0..100', () => {
    const r = scoreEngagement(
      facts({
        emailSends: 50,
        emailOpens: 50,
        emailClicks: 50,
        daysSinceLastEmailEngagement: 0,
        smsSends: 50,
        smsReplies: 50,
        daysSinceLastSmsReply: 0,
      }),
    );
    for (const key of Object.keys(r.components) as Array<keyof typeof r.components>) {
      expect(r.components[key]).toBeGreaterThanOrEqual(0);
      expect(r.components[key]).toBeLessThanOrEqual(100);
    }
  });

  it('single SMS reply alone does not push to highly_engaged', () => {
    const r = scoreEngagement(
      facts({
        smsSends: 1,
        smsReplies: 1,
        daysSinceLastSmsReply: 0,
      }),
    );
    expect(r.band).not.toBe('highly_engaged');
  });

  it('commerce subscore on its own can lift to at_risk band', () => {
    const r = scoreEngagement(
      facts({
        totalOrders: 5,
        daysSinceLastOrder: 30,
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(10);
    expect(['dormant', 'at_risk', 'engaged']).toContain(r.band);
  });
});
