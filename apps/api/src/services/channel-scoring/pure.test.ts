import { describe, it, expect } from 'vitest';
import {
  CHANNEL_KINDS,
  confidenceBand,
  daysSince,
  pickPreferredChannel,
  scoreAllChannels,
  scoreChannel,
  type ChannelFacts,
} from './pure.js';

const fact = (overrides: Partial<ChannelFacts> = {}): ChannelFacts => ({
  sends: 0,
  engagements: 0,
  daysSinceLastEngagement: null,
  reachable: true,
  ...overrides,
});

describe('scoreChannel', () => {
  it('returns null when unreachable + no history', () => {
    expect(scoreChannel(fact({ reachable: false }))).toBeNull();
  });

  it('returns 0 when reachable but no sends', () => {
    expect(scoreChannel(fact())).toBe(0);
  });

  it('mid-range score for 5/10 with recent engagement', () => {
    const s = scoreChannel(
      fact({ sends: 10, engagements: 5, daysSinceLastEngagement: 1, reachable: true }),
    );
    expect(s).toBeGreaterThan(30);
    expect(s).toBeLessThan(80);
  });

  it('approaches the upper band on 50/50 + same-day engagement', () => {
    const s = scoreChannel(
      fact({ sends: 50, engagements: 50, daysSinceLastEngagement: 0, reachable: true })!,
    )!;
    expect(s).toBeGreaterThan(85);
  });

  it('volume penalty: 1/1 perfect rate scores less than 50/50', () => {
    const small = scoreChannel(fact({ sends: 1, engagements: 1, daysSinceLastEngagement: 0 }))!;
    const large = scoreChannel(fact({ sends: 50, engagements: 50, daysSinceLastEngagement: 0 }))!;
    expect(large).toBeGreaterThan(small);
  });

  it('recency decay: old engagement scores below recent', () => {
    const recent = scoreChannel(fact({ sends: 20, engagements: 10, daysSinceLastEngagement: 1 }))!;
    const old = scoreChannel(fact({ sends: 20, engagements: 10, daysSinceLastEngagement: 180 }))!;
    expect(recent).toBeGreaterThan(old);
  });

  it('half-life: 30-day-old engagement scores ~half of fresh', () => {
    const fresh = scoreChannel(fact({ sends: 20, engagements: 20, daysSinceLastEngagement: 0 }))!;
    const halfLife = scoreChannel(
      fact({ sends: 20, engagements: 20, daysSinceLastEngagement: 30 }),
    )!;
    // recency component drops by half — overall score drops, but not by
    // exactly half because rate + volume don't decay. Within ~30 points.
    expect(fresh - halfLife).toBeGreaterThan(5);
    expect(fresh - halfLife).toBeLessThan(40);
  });

  it('unreachable channel with history scores at half', () => {
    const reachable = scoreChannel(
      fact({ sends: 50, engagements: 50, daysSinceLastEngagement: 0, reachable: true }),
    )!;
    const unreachable = scoreChannel(
      fact({ sends: 50, engagements: 50, daysSinceLastEngagement: 0, reachable: false }),
    )!;
    expect(unreachable).toBeLessThanOrEqual(Math.ceil(reachable * 0.5) + 1);
  });

  it('clamps to 0..100', () => {
    const s = scoreChannel(
      fact({ sends: 1_000_000, engagements: 1_000_000, daysSinceLastEngagement: 0 }),
    )!;
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe('scoreAllChannels', () => {
  it('returns null for unreachable+empty channels', () => {
    const scores = scoreAllChannels({
      email: fact({ reachable: true, sends: 5, engagements: 3, daysSinceLastEngagement: 5 }),
      sms: fact({ reachable: false }),
      whatsapp: fact({ reachable: false }),
      voice: fact({ reachable: false }),
      push: fact({ reachable: false }),
    });
    expect(scores.email).toBeGreaterThan(0);
    expect(scores.sms).toBeNull();
    expect(scores.whatsapp).toBeNull();
    expect(scores.voice).toBeNull();
    expect(scores.push).toBeNull();
  });
});

describe('pickPreferredChannel', () => {
  it('returns null when all channels are unscored', () => {
    expect(
      pickPreferredChannel({
        email: null,
        sms: null,
        whatsapp: null,
        voice: null,
        push: null,
      }),
    ).toBeNull();
  });

  it('returns the highest scoring channel', () => {
    expect(
      pickPreferredChannel({
        email: 40,
        sms: 80,
        whatsapp: null,
        voice: 30,
        push: 10,
      }),
    ).toBe('sms');
  });

  it('breaks ties using CHANNEL_KINDS order (email first)', () => {
    expect(
      pickPreferredChannel({
        email: 70,
        sms: 70,
        whatsapp: 70,
        voice: 70,
        push: 70,
      }),
    ).toBe('email');
  });

  it('skips null channels even when others are zero', () => {
    expect(
      pickPreferredChannel({
        email: null,
        sms: 0,
        whatsapp: null,
        voice: null,
        push: null,
      }),
    ).toBe('sms');
  });
});

describe('confidenceBand', () => {
  it('none when no channel scored', () => {
    expect(
      confidenceBand({ email: null, sms: null, whatsapp: null, voice: null, push: null }),
    ).toBe('none');
  });

  it('low when top score is below 10', () => {
    expect(confidenceBand({ email: 5, sms: 3, whatsapp: null, voice: null, push: null })).toBe(
      'low',
    );
  });

  it('high when gap to second is ≥ 20', () => {
    expect(confidenceBand({ email: 80, sms: 50, whatsapp: null, voice: null, push: null })).toBe(
      'high',
    );
  });

  it('medium when gap is 8-19', () => {
    expect(confidenceBand({ email: 60, sms: 50, whatsapp: null, voice: null, push: null })).toBe(
      'medium',
    );
  });

  it('low when gap is under 8 (close race)', () => {
    expect(confidenceBand({ email: 55, sms: 52, whatsapp: null, voice: null, push: null })).toBe(
      'low',
    );
  });
});

describe('daysSince', () => {
  it('returns null for null input', () => {
    expect(daysSince(null)).toBeNull();
  });

  it('returns 0 for future dates (clamp)', () => {
    const future = new Date(Date.now() + 86_400_000);
    expect(daysSince(future)).toBe(0);
  });

  it('returns days between two dates', () => {
    const now = new Date('2026-05-30T12:00:00Z');
    const past = new Date('2026-05-25T12:00:00Z');
    expect(daysSince(past, now)).toBe(5);
  });
});

describe('CHANNEL_KINDS ordering', () => {
  it('has the documented preference order', () => {
    expect(CHANNEL_KINDS).toEqual(['email', 'sms', 'whatsapp', 'voice', 'push']);
  });
});
