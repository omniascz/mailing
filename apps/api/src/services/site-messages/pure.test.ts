import { describe, it, expect } from 'vitest';
import {
  matchesCondition,
  matchesAllConditions,
  canShowMessage,
  type VisitorContext,
  type SiteCondition,
} from './pure.js';

const ctx: VisitorContext = {
  url: 'https://example.cz/pricing',
  timeOnSiteSeconds: 45,
  scrollDepthPercent: 60,
  cartValue: 1200,
  isReturningVisitor: true,
  segmentIds: ['seg-pro', 'seg-eu'],
  exitIntent: false,
};

describe('matchesCondition', () => {
  it('page_visit eq matches exact URL', () => {
    expect(
      matchesCondition(
        { trigger: 'page_visit', operator: 'eq', value: 'https://example.cz/pricing' },
        ctx,
      ),
    ).toBe(true);
  });

  it('page_visit contains matches substring', () => {
    expect(
      matchesCondition({ trigger: 'page_visit', operator: 'contains', value: 'pricing' }, ctx),
    ).toBe(true);
  });

  it('time_on_site gte triggers above threshold', () => {
    expect(matchesCondition({ trigger: 'time_on_site', operator: 'gte', value: 30 }, ctx)).toBe(
      true,
    );
    expect(matchesCondition({ trigger: 'time_on_site', operator: 'gte', value: 120 }, ctx)).toBe(
      false,
    );
  });

  it('scroll_depth gt triggers', () => {
    expect(matchesCondition({ trigger: 'scroll_depth', operator: 'gt', value: 50 }, ctx)).toBe(
      true,
    );
  });

  it('cart_value gte triggers on abandoned-cart threshold', () => {
    expect(matchesCondition({ trigger: 'cart_value', operator: 'gte', value: 1000 }, ctx)).toBe(
      true,
    );
  });

  it('returning_visitor uses boolean flag', () => {
    expect(
      matchesCondition({ trigger: 'returning_visitor', operator: 'eq', value: true }, ctx),
    ).toBe(true);
  });

  it('exit_intent returns false when not set', () => {
    expect(matchesCondition({ trigger: 'exit_intent', operator: 'eq', value: true }, ctx)).toBe(
      false,
    );
  });

  it('segment_match in with array', () => {
    expect(
      matchesCondition(
        { trigger: 'segment_match', operator: 'in', value: ['seg-pro', 'seg-x'] },
        ctx,
      ),
    ).toBe(true);
  });

  it('segment_match eq with single id', () => {
    expect(
      matchesCondition({ trigger: 'segment_match', operator: 'eq', value: 'seg-eu' }, ctx),
    ).toBe(true);
  });

  it('custom_event matches event name', () => {
    const eventCtx = { ...ctx, customEvent: 'checkout_started' };
    expect(
      matchesCondition(
        { trigger: 'custom_event', operator: 'eq', value: 'checkout_started' },
        eventCtx,
      ),
    ).toBe(true);
  });

  it('returns false for unknown trigger', () => {
    expect(matchesCondition({ trigger: 'bogus', operator: 'eq', value: 1 }, ctx)).toBe(false);
  });
});

describe('matchesAllConditions', () => {
  it('empty list matches anything', () => {
    expect(matchesAllConditions([], ctx)).toBe(true);
  });

  it('all conditions must match (AND)', () => {
    const conds: SiteCondition[] = [
      { trigger: 'page_visit', operator: 'contains', value: 'pricing' },
      { trigger: 'time_on_site', operator: 'gte', value: 30 },
    ];
    expect(matchesAllConditions(conds, ctx)).toBe(true);
  });

  it('returns false when any condition fails', () => {
    const conds: SiteCondition[] = [
      { trigger: 'page_visit', operator: 'contains', value: 'pricing' },
      { trigger: 'cart_value', operator: 'gt', value: 10_000 },
    ];
    expect(matchesAllConditions(conds, ctx)).toBe(false);
  });
});

describe('canShowMessage', () => {
  const now = new Date('2026-04-24T12:00:00Z');

  it('allows when neither rule is set', () => {
    expect(canShowMessage({})).toBe(true);
  });

  it('blocks when showOncePerVisitor + already seen', () => {
    expect(canShowMessage({ showOncePerVisitor: true, seenByVisitor: true })).toBe(false);
  });

  it('blocks within cooldown window', () => {
    expect(
      canShowMessage({
        cooldownMinutes: 60,
        lastShownAt: new Date(now.getTime() - 10 * 60_000),
        now,
      }),
    ).toBe(false);
  });

  it('allows after cooldown expires', () => {
    expect(
      canShowMessage({
        cooldownMinutes: 60,
        lastShownAt: new Date(now.getTime() - 120 * 60_000),
        now,
      }),
    ).toBe(true);
  });
});
