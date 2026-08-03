import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forgemsg/shared/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
}));

// We only test rule-based logic here (no real Claude API calls)
import { checkAccessibility } from './accessibility-checker.js';

describe('checkAccessibility — rule-based checks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detects missing lang attribute', async () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const report = await checkAccessibility(html, undefined);
    const codes = report.issues.map((i) => i.issue);
    expect(codes.some((c) => c.toLowerCase().includes('lang'))).toBe(true);
  });

  it('does not flag lang when present', async () => {
    const html = '<html lang="cs"><body><p>Hello</p></body></html>';
    const report = await checkAccessibility(html, undefined);
    const codes = report.issues.map((i) => i.issue);
    expect(codes.some((c) => c.toLowerCase().includes('lang attribute'))).toBe(false);
  });

  it('detects image missing alt', async () => {
    const html = '<html lang="en"><body><img src="logo.png"></body></html>';
    const report = await checkAccessibility(html, undefined);
    const codes = report.issues.map((i) => i.issue);
    expect(codes.some((c) => c.toLowerCase().includes('alt'))).toBe(true);
  });

  it('does not flag img with alt=""', async () => {
    const html = '<html lang="en"><body><img src="logo.png" alt=""></body></html>';
    const report = await checkAccessibility(html, undefined);
    const codes = report.issues.map((i) => i.issue);
    // alt="" is valid for decorative images
    expect(codes.some((c) => c.includes('Image missing alt attribute'))).toBe(false);
  });

  it('detects tables without role=presentation', async () => {
    const html = '<html lang="en"><body><table><tr><td>Cell</td></tr></table></body></html>';
    const report = await checkAccessibility(html, undefined);
    const codes = report.issues.map((i) => i.issue);
    expect(codes.some((c) => c.includes('role="presentation"'))).toBe(true);
  });

  it('does not flag tables with role=presentation', async () => {
    const html =
      '<html lang="en"><body><table role="presentation"><tr><td>Cell</td></tr></table></body></html>';
    const report = await checkAccessibility(html, undefined);
    const codes = report.issues.map((i) => i.issue);
    expect(codes.some((c) => c.includes('role="presentation"'))).toBe(false);
  });

  it('detects empty links', async () => {
    const html = '<html lang="en"><body><a href="https://example.com"></a></body></html>';
    const report = await checkAccessibility(html, undefined);
    const codes = report.issues.map((i) => i.issue);
    expect(codes.some((c) => c.toLowerCase().includes('no visible text'))).toBe(true);
  });

  it('detects generic link text', async () => {
    const html = '<html lang="en"><body><a href="https://example.com">click here</a></body></html>';
    const report = await checkAccessibility(html, undefined);
    const codes = report.issues.map((i) => i.issue);
    expect(codes.some((c) => c.toLowerCase().includes('generic link'))).toBe(true);
  });

  it('returns a score between 0 and 100', async () => {
    const html = '<html lang="en"><body><p>Good email</p></body></html>';
    const report = await checkAccessibility(html, undefined);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  it('returns cached result on second call', async () => {
    const { redis } = await import('@forgemsg/shared/redis');
    const cached = JSON.stringify({ issues: [], score: 100 });
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cached);

    const html = '<html lang="en"><body><p>Content</p></body></html>';
    const report = await checkAccessibility(html, undefined);
    expect(report.score).toBe(100);
    expect(report.issues).toHaveLength(0);
  });
});
