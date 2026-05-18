import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    incr: vi.fn().mockResolvedValue(1),
    incrby: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../../db/client.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  contacts: {},
  emailEvents: {},
  suppressions: {},
}));

import { parseArfReport } from './fbl-processor.js';

// ─── ARF parsing tests (pure function, no DB) ─────────────────────────────────

const SAMPLE_ARF = `From: abuse@yahoo.com
To: fbl@forgemsg.com
Subject: FBL report

--boundary
Content-Type: message/feedback-report

Feedback-Type: abuse
User-Agent: Yahoo!-Mail-Feedback/2.0
Original-Rcpt-To: victim@yahoo.com
Original-Message-ID: <abc123@forgemsg.com>
Reporting-MTA: dns; mx.yahoo.com

--boundary--`;

const GMAIL_ARF = `From: noreply-dmarc-support@google.com
To: postmaster@forgemsg.com
Subject: This is an email abuse report for an email message from forgemsg.com

--boundary
Content-Type: message/feedback-report

Feedback-Type: abuse
Original-Rcpt-To: user@gmail.com
Original-Message-ID: <xyz456@forgemsg.com>
Reporting-MTA: dns; gmr-smtp-in.l.google.com

--boundary--`;

const MINIMAL_ARF = `From: complaints@microsoft.com
Diagnostic-Code: smtp; forwarded complaint
Original-Recipient: user@hotmail.com`;

describe('parseArfReport', () => {
  it('extracts original recipient from yahoo ARF', () => {
    const r = parseArfReport(SAMPLE_ARF);
    expect(r.originalRecipient).toBe('victim@yahoo.com');
  });

  it('extracts original message-id', () => {
    const r = parseArfReport(SAMPLE_ARF);
    expect(r.originalMessageId).toBe('abc123@forgemsg.com');
  });

  it('detects feedback type: abuse', () => {
    const r = parseArfReport(SAMPLE_ARF);
    expect(r.feedbackType).toBe('abuse');
  });

  it('detects source ISP', () => {
    const r = parseArfReport(SAMPLE_ARF);
    expect(r.source).toBeTruthy();
  });

  it('parses gmail ARF', () => {
    const r = parseArfReport(GMAIL_ARF);
    expect(r.originalRecipient).toBe('user@gmail.com');
    expect(r.originalMessageId).toBe('xyz456@forgemsg.com');
  });

  it('handles minimal ARF with Original-Recipient header', () => {
    const r = parseArfReport(MINIMAL_ARF);
    expect(r.originalRecipient).toBe('user@hotmail.com');
  });

  it('sets reportedAt to a valid ISO timestamp', () => {
    const r = parseArfReport(SAMPLE_ARF);
    expect(() => new Date(r.reportedAt)).not.toThrow();
    expect(r.reportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns null for originalRecipient when not found', () => {
    const r = parseArfReport('From: abuse@isp.com\nFeedback-Type: fraud\n');
    // No recipient header present
    expect(r.originalRecipient).toBeNull();
  });

  it('classifies unknown feedback type as other', () => {
    const r = parseArfReport('Feedback-Type: marketing-removal\nOriginal-Rcpt-To: x@y.com\n');
    expect(r.feedbackType).toBe('other');
  });

  it('classifies fraud feedback type', () => {
    const r = parseArfReport('Feedback-Type: fraud\nOriginal-Rcpt-To: x@y.com\n');
    expect(r.feedbackType).toBe('fraud');
  });

  it('classifies virus feedback type', () => {
    const r = parseArfReport('Feedback-Type: virus\nOriginal-Rcpt-To: x@y.com\n');
    expect(r.feedbackType).toBe('virus');
  });
});
