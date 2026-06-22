import { describe, it, expect } from 'vitest';
import { pickBestChannel, CHANNEL_WEIGHTS } from './nba-pure.js';

describe('pickBestChannel', () => {
  it('chooses by WEIGHTED score and reports the weighted score (consistency)', () => {
    // email 50·1.0=50 vs sms 100·0.7=70 → sms wins, reported score is the
    // weighted 70 (the old code stored the unweighted 100 — inconsistent).
    const r = pickBestChannel({ email: 50, sms: 100, push: 0, whatsapp: 0 });
    expect(r.channel).toBe('sms');
    expect(r.score).toBe(70);
  });

  it('email can still win when its weighted score is highest', () => {
    // email 60·1.0=60 vs sms 80·0.7=56 → email wins.
    const r = pickBestChannel({ email: 60, sms: 80, push: 0, whatsapp: 0 });
    expect(r.channel).toBe('email');
    expect(r.score).toBe(60);
  });

  it('does not give email an unfair unweighted baseline edge', () => {
    // email 0 → push 100·0.5=50 should win over email's 0.
    const r = pickBestChannel({ email: 0, sms: 0, push: 100, whatsapp: 0 });
    expect(r.channel).toBe('push');
    expect(r.score).toBe(50);
  });

  it('applies the documented channel weights', () => {
    expect(pickBestChannel({ email: 0, whatsapp: 100 }).score).toBe(100 * CHANNEL_WEIGHTS.whatsapp!);
  });

  it('defaults to email when all scores are zero', () => {
    expect(pickBestChannel({ email: 0, sms: 0, push: 0, whatsapp: 0 }).channel).toBe('email');
  });
});
