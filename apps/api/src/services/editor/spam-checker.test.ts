import { describe, it, expect } from 'vitest';
import { checkSpam } from './spam-checker.js';

describe('checkSpam — subject line checks', () => {
  it('returns score 0 for a clean email', () => {
    const html = '<html lang="en"><body><p>Hello, here is your monthly update.</p><p><a href="https://example.com/unsubscribe">Unsubscribe</a></p></body></html>';
    const result = checkSpam('Your monthly update', html, true);
    expect(result.score).toBeLessThan(3);
  });

  it('penalises missing subject', () => {
    const html = '<p>Content</p><a href="https://example.com/unsubscribe">Unsubscribe</a>';
    const result = checkSpam('', html, true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('MISSING_SUBJECT');
  });

  it('penalises ALL CAPS subject', () => {
    const result = checkSpam('HUGE SALE TODAY BUY NOW', '<p>Content</p>', true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SUBJECT_ALL_CAPS');
  });

  it('penalises excessive exclamation marks', () => {
    const result = checkSpam('You won!!! Click here!!!', '<p>Content</p>', true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SUBJECT_EXCESS_EXCLAMATION');
  });

  it('penalises spam trigger words in subject', () => {
    const result = checkSpam('Free cash prize winner guaranteed', '<p>Content</p>', true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SUBJECT_SPAM_WORDS');
  });

  it('penalises subject over 70 chars', () => {
    const longSubject = 'This is an extremely long subject line that goes way beyond seventy characters limit';
    const result = checkSpam(longSubject, '<p>Content</p>', true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SUBJECT_TOO_LONG');
  });
});

describe('checkSpam — HTML body checks', () => {
  it('penalises image-only email', () => {
    const html = '<img src="promo.jpg" alt="Promo"><img src="promo2.jpg" alt="P2">';
    const result = checkSpam('Hello', html, true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('IMAGE_ONLY_EMAIL');
  });

  it('penalises missing alt texts', () => {
    const html = '<p>' + 'word '.repeat(50) + '</p><img src="test.jpg"><a href="https://example.com/unsubscribe">Unsubscribe</a>';
    const result = checkSpam('Hello', html, true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('MISSING_ALT_TEXTS');
  });

  it('penalises suspicious links', () => {
    const html = '<p>' + 'word '.repeat(20) + '</p><a href="http://192.168.1.1/phish">Click</a><a href="https://example.com/unsubscribe">Unsubscribe</a>';
    const result = checkSpam('Hello', html, true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('SUSPICIOUS_LINKS');
  });

  it('penalises missing unsubscribe link', () => {
    const html = '<p>' + 'word '.repeat(30) + '</p>';
    const result = checkSpam('Hello', html, true);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('MISSING_UNSUBSCRIBE');
  });

  it('penalises missing plain-text alternative', () => {
    const html = '<p>' + 'word '.repeat(20) + '</p><a href="https://example.com/unsubscribe">Unsubscribe</a>';
    const result = checkSpam('Hello', html, false);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain('NO_PLAIN_TEXT');
  });
});

describe('checkSpam — score and verdict', () => {
  it('score is clamped to max 10', () => {
    const terrible = 'FREE CASH PRIZE WINNER!!! CLICK HERE NOW!!!';
    const html = '<img src="x.jpg"><a href="http://192.168.1.1/x">click</a>';
    const result = checkSpam(terrible, html, false);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.score).toBeGreaterThan(0);
  });

  it('verdict reflects low score', () => {
    const result = checkSpam('Monthly newsletter', '<p>' + 'word '.repeat(50) + '</p><a href="https://example.com/unsubscribe">Unsubscribe</a>', true);
    expect(result.verdict).toMatch(/excellent|good/i);
  });

  it('issues array is an array', () => {
    const result = checkSpam('Test', '<p>Content</p>', true);
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
