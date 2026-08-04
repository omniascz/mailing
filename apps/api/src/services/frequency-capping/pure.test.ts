import { describe, it, expect } from 'vitest';
import {
  filterApplicableRules,
  hourInWindow,
  isInQuietHours,
  localHourIn,
  pickStrictestRule,
  priorityBypasses,
  ruleMatchesBand,
  strictnessSendsPerHour,
  type AnyRule,
} from './pure.js';

const r = (overrides: Partial<AnyRule> = {}): AnyRule => ({
  maxCount: 5,
  periodHours: 24,
  channel: 'email',
  ...overrides,
});

describe('priorityBypasses', () => {
  it('transactional always bypasses transactional floor', () => {
    expect(priorityBypasses('transactional', 'transactional')).toBe(true);
  });
  it('marketing bypasses marketing floor', () => {
    expect(priorityBypasses('marketing', 'marketing')).toBe(true);
  });
  it('promotional does not bypass marketing floor', () => {
    expect(priorityBypasses('promotional', 'marketing')).toBe(false);
  });
  it('transactional bypasses marketing floor (transactional is stricter)', () => {
    expect(priorityBypasses('transactional', 'marketing')).toBe(true);
  });
  it('no floor → no bypass', () => {
    expect(priorityBypasses('transactional', null)).toBe(false);
    expect(priorityBypasses('transactional', undefined)).toBe(false);
  });
});

describe('ruleMatchesBand', () => {
  it('null rule band → matches any contact band', () => {
    expect(ruleMatchesBand('engaged', null)).toBe(true);
    expect(ruleMatchesBand(null, null)).toBe(true);
  });
  it('rule band-scoped: matches exact band', () => {
    expect(ruleMatchesBand('dormant', 'dormant')).toBe(true);
  });
  it('rule band-scoped: rejects different band', () => {
    expect(ruleMatchesBand('engaged', 'dormant')).toBe(false);
  });
  it('rule band-scoped: rejects null contact band', () => {
    expect(ruleMatchesBand(null, 'dormant')).toBe(false);
  });
});

describe('hourInWindow', () => {
  it('simple range 9-17', () => {
    expect(hourInWindow(10, 9, 17)).toBe(true);
    expect(hourInWindow(17, 9, 17)).toBe(false); // end exclusive
    expect(hourInWindow(8, 9, 17)).toBe(false);
  });
  it('midnight wrap 22-8', () => {
    expect(hourInWindow(23, 22, 8)).toBe(true);
    expect(hourInWindow(2, 22, 8)).toBe(true);
    expect(hourInWindow(8, 22, 8)).toBe(false);
    expect(hourInWindow(12, 22, 8)).toBe(false);
  });
  it('empty window when start === end', () => {
    expect(hourInWindow(10, 5, 5)).toBe(false);
  });
});

describe('localHourIn', () => {
  it('returns 0-23 for a valid IANA TZ', () => {
    const h = localHourIn('Europe/Prague', new Date('2026-05-30T12:00:00Z'));
    expect(h).not.toBeNull();
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(23);
  });
  it('null for invalid tz', () => {
    expect(localHourIn('Mars/OlympusMons', new Date())).toBeNull();
  });
  it('Prague is +2h vs UTC in May (DST)', () => {
    // 2026-05-30T20:00:00Z → 22:00 in Prague during DST
    expect(localHourIn('Europe/Prague', new Date('2026-05-30T20:00:00Z'))).toBe(22);
  });
});

describe('isInQuietHours', () => {
  it('false when window unset', () => {
    expect(isInQuietHours({ start: null, end: 8, timezone: 'Europe/Prague' })).toBe(false);
    expect(isInQuietHours({ start: 22, end: null, timezone: 'Europe/Prague' })).toBe(false);
  });
  it('false when timezone missing', () => {
    expect(isInQuietHours({ start: 22, end: 8, timezone: null })).toBe(false);
  });
  it('false for out-of-range hours', () => {
    expect(isInQuietHours({ start: 25, end: 8, timezone: 'Europe/Prague' })).toBe(false);
  });
  it('true when current Prague hour is inside quiet window', () => {
    // 23:00 UTC → 01:00 Prague (DST)
    const now = new Date('2026-05-30T23:00:00Z');
    expect(isInQuietHours({ start: 22, end: 8, timezone: 'Europe/Prague', now })).toBe(true);
  });
  it('false when current Prague hour is outside', () => {
    // 10:00 UTC → 12:00 Prague (DST)
    const now = new Date('2026-05-30T10:00:00Z');
    expect(isInQuietHours({ start: 22, end: 8, timezone: 'Europe/Prague', now })).toBe(false);
  });
});

describe('strictnessSendsPerHour', () => {
  it('rule with fewer sends per hour is stricter', () => {
    const lax = { maxCount: 10, periodHours: 1 }; // 10 / hour
    const strict = { maxCount: 1, periodHours: 24 }; // 0.04 / hour
    expect(strictnessSendsPerHour(strict)).toBeLessThan(strictnessSendsPerHour(lax));
  });
});

describe('pickStrictestRule', () => {
  it('null on empty input', () => {
    expect(pickStrictestRule([])).toBeNull();
  });
  it('picks the rule with fewest sends per hour', () => {
    const rules = [r({ maxCount: 10, periodHours: 24 }), r({ maxCount: 2, periodHours: 24 })];
    expect(pickStrictestRule(rules)!.maxCount).toBe(2);
  });
});

describe('filterApplicableRules', () => {
  it('keeps rules where channel matches or rule is "all"', () => {
    const rules = [r({ channel: 'sms' }), r({ channel: 'all' }), r({ channel: 'email' })];
    const filtered = filterApplicableRules(rules, 'email', 'marketing', 'engaged');
    expect(filtered.length).toBe(2); // 'all' + 'email'
  });
  it('skips rules bypassed by priority', () => {
    const rules = [r({ priorityFloor: 'marketing' }), r({ priorityFloor: 'transactional' })];
    const filtered = filterApplicableRules(rules, 'email', 'transactional', null);
    expect(filtered).toEqual([]);
  });
  it('skips rules band-locked to a different band', () => {
    const rules = [r({ engagementBand: 'dormant' }), r({ engagementBand: null })];
    const filtered = filterApplicableRules(rules, 'email', 'marketing', 'engaged');
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.engagementBand).toBe(null);
  });
});
