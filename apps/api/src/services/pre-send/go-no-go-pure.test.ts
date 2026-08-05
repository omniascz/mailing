import { describe, it, expect } from 'vitest';
import {
  classifyMergeTags,
  aggregateVerdict,
  classifyAudienceSize,
  classifyBounceRate,
  classifyComplaintRate,
  classifyDomainAuth,
  classifyFrequencyCap,
  classifyPlainText,
  classifyPreferenceCenter,
  classifyScheduledTime,
  classifySpamScore,
  classifySubject,
  classifySuppression,
  classifyUnsubscribeLink,
  countBySeverity,
  prioritise,
  type CheckResult,
} from './go-no-go-pure.js';

const passing = (id = 'x', category: CheckResult['category'] = 'content'): CheckResult => ({
  id,
  category,
  severity: 'pass',
  title: 't',
});

describe('aggregateVerdict', () => {
  it('go when all pass', () => {
    expect(aggregateVerdict([passing('a'), passing('b')])).toBe('go');
  });
  it('go when only info', () => {
    expect(aggregateVerdict([{ ...passing('a'), severity: 'info' }, passing('b')])).toBe('go');
  });
  it('caution when any warn but no fail', () => {
    expect(aggregateVerdict([{ ...passing('a'), severity: 'warn' }, passing('b')])).toBe('caution');
  });
  it('no-go when any fail', () => {
    expect(
      aggregateVerdict([
        { ...passing('a'), severity: 'fail' },
        { ...passing('b'), severity: 'warn' },
      ]),
    ).toBe('no-go');
  });
  it('go on empty input', () => {
    expect(aggregateVerdict([])).toBe('go');
  });
});

describe('countBySeverity', () => {
  it('counts each severity bucket', () => {
    const r = countBySeverity([
      { ...passing('1'), severity: 'fail' },
      { ...passing('2'), severity: 'warn' },
      { ...passing('3'), severity: 'warn' },
      { ...passing('4'), severity: 'info' },
      { ...passing('5'), severity: 'pass' },
    ]);
    expect(r).toEqual({ pass: 1, info: 1, warn: 2, fail: 1 });
  });
});

describe('prioritise', () => {
  it('puts fails first, passes last', () => {
    const sorted = prioritise([
      passing('a'),
      { ...passing('b'), severity: 'fail' },
      { ...passing('c'), severity: 'warn' },
    ]);
    expect(sorted.map((r) => r.severity)).toEqual(['fail', 'warn', 'pass']);
  });

  it('within severity, sorts by category order (auth before audience)', () => {
    const sorted = prioritise([
      { ...passing('a', 'audience'), severity: 'fail' },
      { ...passing('b', 'authentication'), severity: 'fail' },
    ]);
    expect(sorted[0]!.id).toBe('b');
  });
});

describe('classifyDomainAuth', () => {
  it('passes when all three present', () => {
    expect(
      classifyDomainAuth({ spfValid: true, dkimValid: true, dmarcPresent: true }).severity,
    ).toBe('pass');
  });
  it('fails when DKIM missing', () => {
    const r = classifyDomainAuth({ spfValid: true, dkimValid: false, dmarcPresent: true });
    expect(r.severity).toBe('fail');
    expect(r.title).toContain('DKIM');
  });
  it('fails when SPF missing', () => {
    const r = classifyDomainAuth({ spfValid: false, dkimValid: true, dmarcPresent: true });
    expect(r.severity).toBe('fail');
    expect(r.title).toContain('SPF');
  });
  it('warns when only DMARC missing', () => {
    const r = classifyDomainAuth({ spfValid: true, dkimValid: true, dmarcPresent: false });
    expect(r.severity).toBe('warn');
  });
});

describe('classifyAudienceSize', () => {
  it('fails on zero recipients', () => {
    expect(classifyAudienceSize({ recipientCount: 0 }).severity).toBe('fail');
  });
  it('warns over 100K', () => {
    expect(classifyAudienceSize({ recipientCount: 250_000 }).severity).toBe('warn');
  });
  it('passes for typical send', () => {
    expect(classifyAudienceSize({ recipientCount: 5_000 }).severity).toBe('pass');
  });
});

describe('classifySuppression', () => {
  it('info on empty audience', () => {
    expect(classifySuppression({ recipientCount: 0, suppressedCount: 0 }).severity).toBe('info');
  });
  it('warns over 10% suppression overlap', () => {
    expect(classifySuppression({ recipientCount: 1000, suppressedCount: 200 }).severity).toBe(
      'warn',
    );
  });
  it('passes under 10%', () => {
    expect(classifySuppression({ recipientCount: 1000, suppressedCount: 30 }).severity).toBe(
      'pass',
    );
  });
});

describe('classifyUnsubscribeLink', () => {
  it('fails when absent (GDPR/ePrivacy)', () => {
    expect(classifyUnsubscribeLink({ hasUnsubscribe: false }).severity).toBe('fail');
  });
  it('passes when present', () => {
    expect(classifyUnsubscribeLink({ hasUnsubscribe: true }).severity).toBe('pass');
  });
});

describe('classifyPreferenceCenter', () => {
  it('info when missing (nudge, not block)', () => {
    expect(classifyPreferenceCenter({ hasPreferenceCenterTag: false }).severity).toBe('info');
  });
  it('passes when present', () => {
    expect(classifyPreferenceCenter({ hasPreferenceCenterTag: true }).severity).toBe('pass');
  });
});

describe('classifySubject', () => {
  it('fails on empty', () => {
    expect(classifySubject({ subject: '' }).severity).toBe('fail');
    expect(classifySubject({ subject: '   ' }).severity).toBe('fail');
  });
  it('fails under 5 chars', () => {
    expect(classifySubject({ subject: 'Hi' }).severity).toBe('fail');
  });
  it('warns over 80 chars', () => {
    expect(classifySubject({ subject: 'x'.repeat(120) }).severity).toBe('warn');
  });
  it('passes for typical subject', () => {
    expect(classifySubject({ subject: 'Welcome to MailForge' }).severity).toBe('pass');
  });
});

describe('classifySpamScore', () => {
  it('fails at score 8+', () => {
    expect(classifySpamScore({ spamScore: 9, topIssues: [] }).severity).toBe('fail');
  });
  it('warns at score 5-7', () => {
    expect(classifySpamScore({ spamScore: 6, topIssues: [] }).severity).toBe('warn');
  });
  it('passes below 5', () => {
    expect(classifySpamScore({ spamScore: 2, topIssues: [] }).severity).toBe('pass');
  });
});

describe('classifyPlainText', () => {
  it('warns when missing', () => {
    expect(classifyPlainText({ hasPlainText: false }).severity).toBe('warn');
  });
  it('passes when present', () => {
    expect(classifyPlainText({ hasPlainText: true }).severity).toBe('pass');
  });
});

describe('classifyBounceRate', () => {
  it('info when no history', () => {
    expect(classifyBounceRate({ recent7dBounceRatePct: null }).severity).toBe('info');
  });
  it('fails at 5%+', () => {
    expect(classifyBounceRate({ recent7dBounceRatePct: 7 }).severity).toBe('fail');
  });
  it('warns 2–5%', () => {
    expect(classifyBounceRate({ recent7dBounceRatePct: 3 }).severity).toBe('warn');
  });
  it('passes under 2%', () => {
    expect(classifyBounceRate({ recent7dBounceRatePct: 0.5 }).severity).toBe('pass');
  });
});

describe('classifyComplaintRate', () => {
  it('fails at Gmail 0.3% cap (7d fallback)', () => {
    expect(classifyComplaintRate({ recent7dComplaintRatePct: 0.4 }).severity).toBe('fail');
  });
  it('warns 0.1-0.3% on 7d', () => {
    expect(classifyComplaintRate({ recent7dComplaintRatePct: 0.2 }).severity).toBe('warn');
  });
  it('passes under 0.1%', () => {
    expect(classifyComplaintRate({ recent7dComplaintRatePct: 0.05 }).severity).toBe('pass');
  });
  it('fails when 24h rate ≥ 0.3% even if 7d is lower', () => {
    expect(
      classifyComplaintRate({
        recent7dComplaintRatePct: 0.05,
        recent24hComplaintRatePct: 0.35,
      }).severity,
    ).toBe('fail');
  });
  it('passes when 24h rate is fine and 7d is also fine', () => {
    expect(
      classifyComplaintRate({
        recent7dComplaintRatePct: 0.05,
        recent24hComplaintRatePct: 0.05,
      }).severity,
    ).toBe('pass');
  });
  it('warns on 7d trend even if 24h is null (low volume)', () => {
    expect(
      classifyComplaintRate({
        recent7dComplaintRatePct: 0.15,
        recent24hComplaintRatePct: null,
      }).severity,
    ).toBe('warn');
  });
});

describe('classifyFrequencyCap', () => {
  it('warns when over 25% of audience is capped', () => {
    expect(classifyFrequencyCap({ recipientCount: 1000, cappedCount: 300 }).severity).toBe('warn');
  });
  it('passes for low cap impact', () => {
    expect(classifyFrequencyCap({ recipientCount: 1000, cappedCount: 50 }).severity).toBe('pass');
  });
});

describe('classifyScheduledTime', () => {
  it('info when sending immediately (no schedule)', () => {
    expect(classifyScheduledTime({ scheduledAt: null }).severity).toBe('info');
  });
  it('info when scheduled late at night', () => {
    // 23:00 UTC
    const d = new Date('2026-05-30T23:30:00Z');
    expect(classifyScheduledTime({ scheduledAt: d }).severity).toBe('info');
  });
  it('passes for daytime send', () => {
    const d = new Date('2026-05-30T10:00:00Z');
    expect(classifyScheduledTime({ scheduledAt: d }).severity).toBe('pass');
  });
});

describe('classifyMergeTags (15th check)', () => {
  const tag = {
    kind: 'unknown_tag',
    token: 'contact.frist_name',
    suggestion: 'contact.first_name',
  };
  const filter = { kind: 'unknown_filter', token: 'vokativ', suggestion: 'vocative' };

  it('passes when nothing is wrong', () => {
    const r = classifyMergeTags({ warnings: [] });
    expect(r.severity).toBe('pass');
    expect(r.id).toBe('merge-tags');
    expect(r.category).toBe('content');
  });

  it('warns rather than fails — the mail is still deliverable, just wrong', () => {
    expect(classifyMergeTags({ warnings: [tag] }).severity).toBe('warn');
  });

  it('counts tags and filters separately', () => {
    const r = classifyMergeTags({ warnings: [tag, filter] });
    expect(r.title).toContain('1× neznámý merge tag');
    expect(r.title).toContain('1× neznámý filtr');
    expect(r.metrics).toEqual({ unknownTags: 1, unknownFilters: 1 });
  });

  it('names the offenders and their suggestions in the detail', () => {
    const r = classifyMergeTags({ warnings: [tag] });
    expect(r.detail).toBe('contact.frist_name → contact.first_name');
  });

  it('keeps the detail inside the 240-char budget the panel allows', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      kind: 'unknown_tag',
      token: `contact.velmi_dlouhy_nazev_pole_${i}`,
    }));
    expect(classifyMergeTags({ warnings: many }).detail!.length).toBeLessThanOrEqual(240);
  });

  it('turns the verdict to caution, not no-go', () => {
    expect(aggregateVerdict([classifyMergeTags({ warnings: [tag] })])).toBe('caution');
  });
});
