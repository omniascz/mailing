import { describe, it, expect } from 'vitest';
import { evaluateFormTargeting, matchUrlRules } from './targeting.js';
import type { FormTargeting } from '../../db/schema/signup-forms.js';

const NOW = 1_800_000_000_000;

describe('matchUrlRules', () => {
  it('matches all pages when there are no rules', () => {
    expect(matchUrlRules(undefined, undefined, 'https://x.com/a')).toBe(true);
    expect(matchUrlRules([], 'or', 'https://x.com/a')).toBe(true);
  });

  it('or-logic: any rule matches', () => {
    const rules = [
      { match: 'contains' as const, value: '/pricing' },
      { match: 'contains' as const, value: '/checkout' },
    ];
    expect(matchUrlRules(rules, 'or', 'https://x.com/checkout')).toBe(true);
    expect(matchUrlRules(rules, 'or', 'https://x.com/blog')).toBe(false);
  });

  it('and-logic: every rule must match', () => {
    const rules = [
      { match: 'contains' as const, value: 'shop' },
      { match: 'not_contains' as const, value: 'admin' },
    ];
    expect(matchUrlRules(rules, 'and', 'https://shop.x.com/p')).toBe(true);
    expect(matchUrlRules(rules, 'and', 'https://shop.x.com/admin')).toBe(false);
  });

  it('supports exact, starts_with and regex', () => {
    expect(
      matchUrlRules([{ match: 'exact', value: 'https://x.com/' }], 'or', 'https://x.com/'),
    ).toBe(true);
    expect(
      matchUrlRules(
        [{ match: 'starts_with', value: 'https://x.com/p' }],
        'or',
        'https://x.com/pricing',
      ),
    ).toBe(true);
    expect(
      matchUrlRules([{ match: 'regex', value: '/product/\\d+' }], 'or', 'https://x.com/product/42'),
    ).toBe(true);
  });

  it('treats a malformed regex as never-match', () => {
    expect(matchUrlRules([{ match: 'regex', value: '(' }], 'or', 'https://x.com/')).toBe(false);
  });
});

describe('evaluateFormTargeting', () => {
  it('is eligible + immediate when no targeting configured', () => {
    const d = evaluateFormTargeting(undefined, { nowMs: NOW });
    expect(d.eligible).toBe(true);
    expect(d.trigger.type).toBe('immediate');
  });

  it('resolves a delay trigger with defaults', () => {
    const t: FormTargeting = { trigger: { type: 'delay' } };
    const d = evaluateFormTargeting(t, { nowMs: NOW });
    expect(d.eligible).toBe(true);
    expect(d.trigger).toEqual({ type: 'delay', delaySeconds: 5 });
  });

  it('clamps scroll percent into 1..100', () => {
    const d = evaluateFormTargeting(
      { trigger: { type: 'scroll', scrollPercent: 250 } },
      { nowMs: NOW },
    );
    expect(d.trigger).toEqual({ type: 'scroll', scrollPercent: 100 });
  });

  it('blocks by device targeting', () => {
    const t: FormTargeting = { devices: ['mobile'] };
    expect(evaluateFormTargeting(t, { device: 'desktop', nowMs: NOW }).reason).toBe('device');
    expect(evaluateFormTargeting(t, { device: 'mobile', nowMs: NOW }).eligible).toBe(true);
  });

  it('blocks by URL rules', () => {
    const t: FormTargeting = { urlRules: [{ match: 'contains', value: '/pricing' }] };
    expect(evaluateFormTargeting(t, { url: 'https://x.com/blog', nowMs: NOW }).reason).toBe('url');
    expect(evaluateFormTargeting(t, { url: 'https://x.com/pricing', nowMs: NOW }).eligible).toBe(
      true,
    );
  });

  it('enforces max impressions', () => {
    const t: FormTargeting = { frequency: { maxImpressions: 3 } };
    expect(evaluateFormTargeting(t, { impressionCount: 3, nowMs: NOW }).reason).toBe(
      'max_impressions',
    );
    expect(evaluateFormTargeting(t, { impressionCount: 2, nowMs: NOW }).eligible).toBe(true);
  });

  it('enforces a cooldown window', () => {
    const t: FormTargeting = { frequency: { cooldownDays: 7 } };
    const twoDaysAgo = NOW - 2 * 86_400_000;
    const tenDaysAgo = NOW - 10 * 86_400_000;
    expect(evaluateFormTargeting(t, { lastSeenMs: twoDaysAgo, nowMs: NOW }).reason).toBe(
      'cooldown',
    );
    expect(evaluateFormTargeting(t, { lastSeenMs: tenDaysAgo, nowMs: NOW }).eligible).toBe(true);
  });

  it('hides after submit when configured', () => {
    const t: FormTargeting = { frequency: { hideAfterSubmit: true } };
    expect(evaluateFormTargeting(t, { hasSubmitted: true, nowMs: NOW }).reason).toBe(
      'already_submitted',
    );
    expect(evaluateFormTargeting(t, { hasSubmitted: false, nowMs: NOW }).eligible).toBe(true);
  });
});
