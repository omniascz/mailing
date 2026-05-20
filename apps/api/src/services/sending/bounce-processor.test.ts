import { describe, it, expect } from 'vitest';
import {
  classifyBounce,
  extractNdrReason,
  extractSmtpCode,
  shouldSuppressAfterSoftBounces,
} from './bounce-processor.js';

describe('extractSmtpCode', () => {
  it('extracts 3-digit SMTP code', () => {
    expect(extractSmtpCode('550 User unknown')).toBe(550);
    expect(extractSmtpCode('452 Mailbox full')).toBe(452);
    expect(extractSmtpCode('421 Service unavailable')).toBe(421);
  });

  it('extracts code from enhanced status', () => {
    expect(extractSmtpCode('5.1.1 bad destination mailbox')).toBe(550);
    expect(extractSmtpCode('4.2.2 mailbox full')).toBe(450);
  });

  it('returns null when no code present', () => {
    expect(extractSmtpCode('some random message')).toBeNull();
  });
});

describe('extractNdrReason', () => {
  it('extracts Diagnostic-Code line', () => {
    const ndr =
      'From: mailer-daemon@example.com\nDiagnostic-Code: smtp; 550 User unknown\nStatus: 5.1.1';
    const reason = extractNdrReason(ndr);
    expect(reason).toContain('550 User unknown');
  });

  it('falls back to Status line', () => {
    const ndr = 'From: mailer-daemon@example.com\nStatus: 5.1.1';
    const reason = extractNdrReason(ndr);
    expect(reason).toContain('5.1.1');
  });

  it('falls back to first non-empty line', () => {
    const ndr = '\nThis is a bounce reason that is long enough';
    const reason = extractNdrReason(ndr);
    expect(reason).toBeTruthy();
  });
});

describe('classifyBounce — hard bounces', () => {
  it('classifies 550 as hard', () => {
    const r = classifyBounce(
      550,
      'Delivery Status Notification\nDiagnostic-Code: smtp; 550 User unknown',
    );
    expect(r.type).toBe('hard');
    expect(r.autoSuppress).toBe(true);
    expect(r.alert).toBe(false);
  });

  it('classifies "user unknown" as hard', () => {
    const r = classifyBounce('User unknown');
    expect(r.type).toBe('hard');
    expect(r.autoSuppress).toBe(true);
  });

  it('classifies "no such user" as hard', () => {
    const r = classifyBounce('550 no such user here');
    expect(r.type).toBe('hard');
  });

  it('classifies "mailbox does not exist" as hard', () => {
    const r = classifyBounce('mailbox does not exist');
    expect(r.type).toBe('hard');
  });

  it('classifies "account disabled" as hard', () => {
    const r = classifyBounce('account disabled');
    expect(r.type).toBe('hard');
  });

  it('classifies 5.1.1 enhanced status as hard', () => {
    const r = classifyBounce('5.1.1 bad destination mailbox address');
    expect(r.type).toBe('hard');
  });

  it('classifies any 5xx code as hard (fallback)', () => {
    const r = classifyBounce(556);
    expect(r.type).toBe('hard');
  });
});

describe('classifyBounce — soft bounces', () => {
  it('classifies 452 as soft', () => {
    const r = classifyBounce(452);
    expect(r.type).toBe('soft');
    expect(r.autoSuppress).toBe(false);
    expect(r.alert).toBe(false);
  });

  it('classifies "mailbox full" as soft', () => {
    const r = classifyBounce('452 mailbox full, please try again later');
    expect(r.type).toBe('soft');
  });

  it('classifies "temporarily unavailable" as soft', () => {
    const r = classifyBounce('temporarily unavailable');
    expect(r.type).toBe('soft');
  });

  it('classifies "greylisted" as soft', () => {
    const r = classifyBounce('greylisted, please retry');
    expect(r.type).toBe('soft');
  });

  it('classifies 421 as soft', () => {
    const r = classifyBounce(421);
    expect(r.type).toBe('soft');
  });

  it('classifies 4xx code range as soft (fallback)', () => {
    const r = classifyBounce(450);
    expect(r.type).toBe('soft');
  });
});

describe('classifyBounce — block bounces', () => {
  it('classifies "blocked by policy" as block', () => {
    const r = classifyBounce('554 blocked by policy violation');
    expect(r.type).toBe('block');
    expect(r.alert).toBe(true);
    expect(r.autoSuppress).toBe(false);
  });

  it('classifies "ip blacklisted" as block', () => {
    const r = classifyBounce('Your IP is blacklisted');
    expect(r.type).toBe('block');
  });

  it('classifies "spam detected" as block', () => {
    const r = classifyBounce('spam detected — message rejected');
    expect(r.type).toBe('block');
  });

  it('classifies "DKIM fail" as block', () => {
    const r = classifyBounce('550 DKIM fail — signature invalid');
    expect(r.type).toBe('block');
  });

  it('classifies "SPF softfail" as block', () => {
    const r = classifyBounce('SPF softfail — not authorised sender');
    expect(r.type).toBe('block');
  });
});

describe('classifyBounce — unknown', () => {
  it('returns unknown for unrecognised message with no code', () => {
    const r = classifyBounce('something completely unexpected happened');
    expect(r.type).toBe('unknown');
    expect(r.autoSuppress).toBe(false);
  });
});

describe('shouldSuppressAfterSoftBounces', () => {
  it('returns true at the default threshold of 3', () => {
    expect(shouldSuppressAfterSoftBounces(3)).toBe(true);
    expect(shouldSuppressAfterSoftBounces(4)).toBe(true);
  });

  it('returns false below threshold', () => {
    expect(shouldSuppressAfterSoftBounces(2)).toBe(false);
    expect(shouldSuppressAfterSoftBounces(0)).toBe(false);
  });

  it('respects custom threshold', () => {
    expect(shouldSuppressAfterSoftBounces(5, 5)).toBe(true);
    expect(shouldSuppressAfterSoftBounces(4, 5)).toBe(false);
  });
});
