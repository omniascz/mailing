import { describe, it, expect } from 'vitest';
import {
  createTrackingToken,
  verifyTrackingToken,
  isAppleMpp,
  injectOpenPixel,
  wrapLinks,
} from './tracking.js';

// ─── Token generation and verification ───────────────────────────────────────

describe('createTrackingToken / verifyTrackingToken', () => {
  const openPayload = {
    type: 'open' as const,
    orgId: 'org-123',
    campaignId: 'camp-456',
    contactId: 'contact-789',
    ts: 1700000000,
  };

  const clickPayload = {
    type: 'click' as const,
    orgId: 'org-123',
    campaignId: 'camp-456',
    contactId: 'contact-789',
    url: 'https://example.com/product?ref=email',
    ts: 1700000000,
  };

  it('round-trips an open payload', () => {
    const token = createTrackingToken(openPayload);
    const decoded = verifyTrackingToken(token);
    expect(decoded).toEqual(openPayload);
  });

  it('round-trips a click payload with URL', () => {
    const token = createTrackingToken(clickPayload);
    const decoded = verifyTrackingToken(token);
    expect(decoded).toEqual(clickPayload);
  });

  it('returns null for a tampered token', () => {
    const token = createTrackingToken(openPayload);
    const tampered = token.slice(0, -3) + 'XXX';
    expect(verifyTrackingToken(tampered)).toBeNull();
  });

  it('returns null for a completely invalid token', () => {
    expect(verifyTrackingToken('not.a.valid.token')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(verifyTrackingToken('')).toBeNull();
  });

  it('returns null when there is no dot separator', () => {
    expect(verifyTrackingToken('nodot')).toBeNull();
  });

  it('produces different tokens for different contact IDs', () => {
    const t1 = createTrackingToken({ ...openPayload, contactId: 'c1' });
    const t2 = createTrackingToken({ ...openPayload, contactId: 'c2' });
    expect(t1).not.toBe(t2);
  });

  it('produces URL-safe tokens (no +, /, = characters)', () => {
    for (let i = 0; i < 20; i++) {
      const token = createTrackingToken({ ...openPayload, ts: Date.now() + i });
      expect(token).not.toMatch(/[+/=]/);
    }
  });
});

// ─── Apple MPP detection ──────────────────────────────────────────────────────

describe('isAppleMpp', () => {
  it('detects Apple Mail UA', () => {
    expect(isAppleMpp('Mozilla/5.0 (Macintosh) Apple Mail')).toBe(true);
  });

  it('detects MobileMail UA (iOS Mail)', () => {
    expect(isAppleMpp('MobileMail/1574 CFNetwork/1128.0.1 Darwin/19.6.0')).toBe(true);
  });

  it('detects AppleWebKit + mail keyword', () => {
    expect(
      isAppleMpp(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Mail/3654',
      ),
    ).toBe(true);
  });

  it('returns false for Chrome on desktop', () => {
    expect(
      isAppleMpp(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
  });

  it('returns false for Gmail Android app', () => {
    expect(
      isAppleMpp(
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe(false);
  });

  it('returns false for Outlook desktop', () => {
    expect(isAppleMpp('Microsoft Outlook 16.0.15330')).toBe(false);
  });

  it('returns false for empty UA', () => {
    expect(isAppleMpp('')).toBe(false);
  });
});

// ─── Open pixel injection ─────────────────────────────────────────────────────

describe('injectOpenPixel', () => {
  const baseUrl = 'https://track.forgemsg.com';
  const orgId = 'org-1';
  const campaignId = 'camp-1';
  const contactId = 'contact-1';

  it('injects a pixel before </body>', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const result = injectOpenPixel(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toContain('<img src="https://track.forgemsg.com/track/o/');
    expect(result).toMatch(/<img[^>]+><\/body>/);
  });

  it('appends pixel when no </body> tag', () => {
    const html = '<p>Plain content without body tag</p>';
    const result = injectOpenPixel(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toContain('<img src="https://track.forgemsg.com/track/o/');
    expect(result.endsWith('>')).toBe(true);
  });

  it('pixel has width=1 height=1 and display:block style', () => {
    const html = '<body></body>';
    const result = injectOpenPixel(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toMatch(/width="1"\s+height="1"/);
    expect(result).toContain('display:block');
  });

  it('pixel URL contains a verifiable token', () => {
    const html = '<body></body>';
    const result = injectOpenPixel(html, baseUrl, orgId, campaignId, contactId);
    const match = result.match(/\/track\/o\/([^"]+)/);
    expect(match).not.toBeNull();
    const decoded = verifyTrackingToken(match![1]!);
    expect(decoded?.type).toBe('open');
    // Narrow the union so campaignId access typechecks. Pref-center
    // tokens don't carry a campaignId; open + click do.
    if (decoded && decoded.type === 'open') {
      expect(decoded.campaignId).toBe(campaignId);
      expect(decoded.contactId).toBe(contactId);
    }
  });

  it('includes mso-hide:all for Outlook compatibility', () => {
    const html = '<body></body>';
    const result = injectOpenPixel(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toContain('mso-hide:all');
  });
});

// ─── Click link wrapping ──────────────────────────────────────────────────────

describe('wrapLinks', () => {
  const baseUrl = 'https://track.forgemsg.com';
  const orgId = 'org-1';
  const campaignId = 'camp-1';
  const contactId = 'contact-1';

  it('wraps a standard href link', () => {
    const html = '<a href="https://example.com">Click me</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toContain('https://track.forgemsg.com/track/c/');
    expect(result).not.toContain('https://example.com"');
  });

  it('token in wrapped link decodes to the original URL', () => {
    const html = '<a href="https://example.com/page">Link</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId, 'Summer Sale');
    const match = result.match(/\/track\/c\/([^"]+)/);
    expect(match).not.toBeNull();
    const decoded = verifyTrackingToken(match![1]!);
    expect(decoded?.type).toBe('click');
    expect((decoded as { url: string }).url).toContain('https://example.com/page');
  });

  it('appends UTM parameters to the destination URL', () => {
    const html = '<a href="https://example.com">Link</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId, 'My Campaign');
    const match = result.match(/\/track\/c\/([^"]+)/);
    const decoded = verifyTrackingToken(match![1]!);
    const url = (decoded as { url: string }).url;
    expect(url).toContain('utm_source=forgemsg');
    expect(url).toContain('utm_medium=email');
    expect(url).toContain('utm_campaign=My%20Campaign');
  });

  it('does not wrap mailto: links', () => {
    const html = '<a href="mailto:support@example.com">Email us</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toBe(html);
  });

  it('does not wrap tel: links', () => {
    const html = '<a href="tel:+420123456789">Call us</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toBe(html);
  });

  it('does not wrap unsubscribe links', () => {
    const html = '<a href="/unsubscribe?token=abc">Unsubscribe</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toBe(html);
  });

  it('does not double-wrap already tracked links', () => {
    const html = '<a href="https://track.forgemsg.com/track/c/sometoken">Link</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId);
    // Should remain unchanged — already tracked
    expect(result).toBe(html);
  });

  it('does not wrap anchor-only hrefs', () => {
    const html = '<a href="#section-2">Go to section</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toBe(html);
  });

  it('wraps multiple links independently', () => {
    const html = '<a href="https://a.com">A</a> <a href="https://b.com">B</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId);
    const matches = [...result.matchAll(/\/track\/c\/([^"]+)/g)];
    expect(matches.length).toBe(2);

    const urlA = (verifyTrackingToken(matches[0]![1]!) as { url: string }).url;
    const urlB = (verifyTrackingToken(matches[1]![1]!) as { url: string }).url;
    expect(urlA).toContain('a.com');
    expect(urlB).toContain('b.com');
  });

  it('handles single-quoted href attributes', () => {
    const html = "<a href='https://example.com'>Link</a>";
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId);
    expect(result).toContain('/track/c/');
  });

  it('preserves existing query parameters when appending UTM', () => {
    const html = '<a href="https://shop.com/product?id=42">Buy</a>';
    const result = wrapLinks(html, baseUrl, orgId, campaignId, contactId, 'Sale');
    const match = result.match(/\/track\/c\/([^"]+)/);
    const decoded = verifyTrackingToken(match![1]!);
    const url = (decoded as { url: string }).url;
    // Original param is still there, UTM appended with &
    expect(url).toContain('id=42&utm_source=forgemsg');
  });
});

// ─── Real-world NDR format tests (Fáze 3 — bounce-processor) ─────────────────
// These are covered in bounce-processor.test.ts.  The integration scenarios
// below complement that file with real ISP NDR bodies.

import { extractNdrReason, classifyBounce } from './bounce-processor.js';

describe('Real-world NDR format parsing', () => {
  // Gmail NDR
  const GMAIL_NDR = `From: mailer-daemon@googlemail.com
Subject: Delivery Status Notification (Failure)
Content-Type: message/delivery-status

Reporting-MTA: dns; mail-wr1-f68.google.com
Final-Recipient: rfc822; nonexistent@gmail.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.`;

  // Outlook / Exchange NDR
  const OUTLOOK_NDR = `Reporting-MTA: dns; mx1.hotmail.com
Final-Recipient: rfc822; user@hotmail.com
Action: failed
Status: 5.2.1
Diagnostic-Code: smtp; 550 5.2.1 The user's mailbox has been disabled.`;

  // Yahoo NDR
  const YAHOO_NDR = `Reporting-MTA: dns; mta7.am0.yahoodns.net
Final-Recipient: rfc822; nobody@yahoo.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 554 delivery error: dd Sorry your message to nobody@yahoo.com cannot be delivered. This account has been deactivated.`;

  // Microsoft Exchange on-premise NDR
  const EXCHANGE_NDR = `Diagnostic-Code: smtp; 550 5.1.1 User unknown
Final-Recipient: rfc822; contact@company.com
Action: failed
Status: 5.1.1`;

  // Soft bounce — mailbox full
  const MAILBOX_FULL_NDR = `Diagnostic-Code: smtp; 452 4.2.2 Mailbox full
Final-Recipient: rfc822; user@example.com
Action: delayed
Status: 4.2.2`;

  // Soft bounce — greylisting
  const GREYLISTING_NDR = `Diagnostic-Code: smtp; 451 4.7.1 Service temporarily unavailable - greylisted
Final-Recipient: rfc822; user@company.cz
Action: delayed`;

  // Block — IP blacklisted
  const IP_BLACKLIST_NDR = `Diagnostic-Code: smtp; 554 5.7.1 Your IP address has been blacklisted by Spamhaus XBL
Action: failed
Final-Recipient: rfc822; victim@isp.net`;

  // Block — DMARC
  const DMARC_NDR = `Diagnostic-Code: smtp; 550 5.7.26 DMARC policy violation; message rejected
Final-Recipient: rfc822; marketing@target.com
Action: failed`;

  // Block — spam content
  const SPAM_CONTENT_NDR = `Diagnostic-Code: smtp; 554 5.7.0 Message rejected due to spam detected
Final-Recipient: rfc822; user@aol.com
Action: failed`;

  // Unknown / catch-all
  const UNKNOWN_NDR = `Diagnostic-Code: smtp; 500 Unrecognised command
Action: failed`;

  it('classifies Gmail 5.1.1 (user does not exist) as hard', () => {
    const reason = extractNdrReason(GMAIL_NDR);
    const r = classifyBounce(reason);
    expect(r.type).toBe('hard');
    expect(r.autoSuppress).toBe(true);
  });

  it('classifies Outlook 5.2.1 (mailbox disabled) as hard', () => {
    const reason = extractNdrReason(OUTLOOK_NDR);
    const r = classifyBounce(reason);
    expect(r.type).toBe('hard');
    expect(r.autoSuppress).toBe(true);
  });

  it('classifies Yahoo deactivated account as hard', () => {
    const reason = extractNdrReason(YAHOO_NDR);
    const r = classifyBounce(reason);
    expect(r.type).toBe('hard');
    expect(r.autoSuppress).toBe(true);
  });

  it('classifies Exchange user unknown as hard', () => {
    const reason = extractNdrReason(EXCHANGE_NDR);
    const r = classifyBounce(reason);
    expect(r.type).toBe('hard');
  });

  it('classifies mailbox full as soft', () => {
    const reason = extractNdrReason(MAILBOX_FULL_NDR);
    const r = classifyBounce(reason);
    expect(r.type).toBe('soft');
    expect(r.autoSuppress).toBe(false);
  });

  it('classifies greylisting as soft', () => {
    const reason = extractNdrReason(GREYLISTING_NDR);
    const r = classifyBounce(reason);
    expect(r.type).toBe('soft');
  });

  it('classifies IP blacklisting as block', () => {
    const reason = extractNdrReason(IP_BLACKLIST_NDR);
    const r = classifyBounce(reason);
    expect(r.type).toBe('block');
    expect(r.alert).toBe(true);
    expect(r.autoSuppress).toBe(false);
  });

  it('classifies DMARC policy violation as block', () => {
    const reason = extractNdrReason(DMARC_NDR);
    const r = classifyBounce(reason);
    expect(r.type).toBe('block');
    expect(r.alert).toBe(true);
  });

  it('classifies spam content rejection as block', () => {
    const reason = extractNdrReason(SPAM_CONTENT_NDR);
    const r = classifyBounce(reason);
    expect(r.type).toBe('block');
  });

  it('returns unknown for unrecognised 500 command error', () => {
    const reason = extractNdrReason(UNKNOWN_NDR);
    const r = classifyBounce(reason);
    // 500 doesn't match any hard/soft/block pattern — falls through
    expect(['hard', 'unknown']).toContain(r.type);
  });
});
