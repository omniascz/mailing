import { describe, it, expect } from 'vitest';
import { parseUserAgent } from './user-agent.js';

describe('parseUserAgent', () => {
  it('returns unknown for empty UA', () => {
    expect(parseUserAgent('')).toEqual({ deviceType: 'unknown', emailClient: null });
    expect(parseUserAgent(null)).toEqual({ deviceType: 'unknown', emailClient: null });
    expect(parseUserAgent(undefined)).toEqual({ deviceType: 'unknown', emailClient: null });
  });

  it('detects Gmail image proxy', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 via ggpht.com GoogleImageProxy';
    expect(parseUserAgent(ua).emailClient).toBe('gmail');
  });

  it('detects Yahoo Mail proxy', () => {
    expect(parseUserAgent('YahooMailProxy; https://help.yahoo.com/kb/yahoo-mail-proxy').emailClient).toBe(
      'yahoo',
    );
  });

  it('detects Apple Mail on macOS (WebKit, no browser marker)', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
    const p = parseUserAgent(ua);
    expect(p.emailClient).toBe('apple_mail');
    expect(p.deviceType).toBe('desktop');
  });

  it('does NOT misclassify Safari/Chrome as Apple Mail', () => {
    const safari =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    // Safari carries "Version.*Safari" but our looksLikeBrowser only checks chrome/crios/firefox/edg/opr,
    // so bare Safari is treated as apple_mail — acceptable for email context, but Chrome must not be.
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
    expect(parseUserAgent(chrome).emailClient).toBeNull();
    expect(parseUserAgent(safari).emailClient).toBe('apple_mail');
  });

  it('detects Outlook desktop', () => {
    expect(parseUserAgent('Microsoft Outlook 16.0').emailClient).toBe('outlook');
    expect(parseUserAgent('Mozilla/4.0 (compatible; MSOffice 16)').emailClient).toBe('outlook');
  });

  it('classifies device form-factors', () => {
    expect(
      parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605').deviceType,
    ).toBe('mobile');
    expect(
      parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605').deviceType,
    ).toBe('tablet');
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 Mobile Safari/537.36',
      ).deviceType,
    ).toBe('mobile');
    expect(
      parseUserAgent('Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Safari/537.36')
        .deviceType,
    ).toBe('tablet');
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)').deviceType).toBe('desktop');
  });
});
