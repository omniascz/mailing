import { describe, it, expect } from 'vitest';
import { isHoneypotTripped, evaluateCaptchaResponse } from './captcha.js';

describe('isHoneypotTripped', () => {
  it('returns false when no honeypot field configured', () => {
    expect(isHoneypotTripped({ email: 'a@x.com' })).toBe(false);
  });

  it('returns false when honeypot field is empty/absent', () => {
    expect(isHoneypotTripped({ email: 'a@x.com', website: '' }, 'website')).toBe(false);
    expect(isHoneypotTripped({ email: 'a@x.com' }, 'website')).toBe(false);
    expect(isHoneypotTripped({ website: '   ' }, 'website')).toBe(false);
  });

  it('returns true when honeypot field is filled (bot)', () => {
    expect(isHoneypotTripped({ website: 'http://spam' }, 'website')).toBe(true);
  });
});

describe('evaluateCaptchaResponse', () => {
  it('accepts success:true with no score gate', () => {
    expect(evaluateCaptchaResponse({ success: true })).toEqual({ success: true, score: undefined });
  });

  it('rejects success:false', () => {
    const r = evaluateCaptchaResponse({ success: false });
    expect(r.success).toBe(false);
  });

  it('rejects null/undefined response', () => {
    expect(evaluateCaptchaResponse(null).success).toBe(false);
    expect(evaluateCaptchaResponse(undefined).success).toBe(false);
  });

  it('honors reCAPTCHA v3 minScore threshold', () => {
    expect(evaluateCaptchaResponse({ success: true, score: 0.9 }, 0.5).success).toBe(true);
    const low = evaluateCaptchaResponse({ success: true, score: 0.2 }, 0.5);
    expect(low.success).toBe(false);
    expect(low.score).toBe(0.2);
  });

  it('passes when score present but no threshold set', () => {
    expect(evaluateCaptchaResponse({ success: true, score: 0.1 }).success).toBe(true);
  });
});
