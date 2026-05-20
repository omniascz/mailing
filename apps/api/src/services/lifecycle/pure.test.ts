import { describe, it, expect } from 'vitest';
import {
  isLifecycleStage,
  canTransition,
  lifecyclePosition,
  suggestedStageFromSignals,
  LIFECYCLE_PIPELINE,
  LIFECYCLE_STAGES,
} from './pure.js';

describe('LIFECYCLE_PIPELINE', () => {
  it('follows HubSpot ordering', () => {
    expect(LIFECYCLE_PIPELINE).toEqual([
      'subscriber',
      'lead',
      'marketing_qualified_lead',
      'sales_qualified_lead',
      'opportunity',
      'customer',
      'evangelist',
    ]);
  });

  it('LIFECYCLE_STAGES includes "other"', () => {
    expect(LIFECYCLE_STAGES).toContain('other');
  });
});

describe('isLifecycleStage', () => {
  it('accepts known stages', () => {
    expect(isLifecycleStage('lead')).toBe(true);
    expect(isLifecycleStage('customer')).toBe(true);
    expect(isLifecycleStage('other')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isLifecycleStage('unknown')).toBe(false);
    expect(isLifecycleStage(null)).toBe(false);
    expect(isLifecycleStage(42)).toBe(false);
  });
});

describe('lifecyclePosition', () => {
  it('returns 0-indexed pipeline position', () => {
    expect(lifecyclePosition('subscriber')).toBe(0);
    expect(lifecyclePosition('customer')).toBe(5);
    expect(lifecyclePosition('other')).toBe(-1);
  });
});

describe('canTransition', () => {
  it('allows forward transitions by default', () => {
    expect(canTransition('subscriber', 'lead')).toBe(true);
    expect(canTransition('lead', 'customer')).toBe(true);
  });

  it('rejects downgrades by default', () => {
    expect(canTransition('customer', 'lead')).toBe(false);
    expect(canTransition('evangelist', 'subscriber')).toBe(false);
  });

  it('rejects no-op transitions', () => {
    expect(canTransition('lead', 'lead')).toBe(false);
  });

  it('allows downgrades when opted in', () => {
    expect(canTransition('customer', 'lead', { allowDowngrade: true })).toBe(true);
  });

  it('treats "other" as always-enterable', () => {
    expect(canTransition('customer', 'other')).toBe(true);
    expect(canTransition('subscriber', 'other')).toBe(true);
  });

  it('treats moving out of "other" as a downgrade', () => {
    expect(canTransition('other', 'lead')).toBe(false);
    expect(canTransition('other', 'lead', { allowDowngrade: true })).toBe(true);
  });
});

describe('suggestedStageFromSignals', () => {
  it('picks the highest matching signal', () => {
    expect(suggestedStageFromSignals({ hasOptedIn: true, hasMarketingEngagement: true })).toBe(
      'marketing_qualified_lead',
    );
  });

  it('prefers "evangelist" when referral signal is set', () => {
    expect(suggestedStageFromSignals({ hasClosedWonDeal: true, hasReferred: true })).toBe(
      'evangelist',
    );
  });

  it('falls back to "other" when no signal is set', () => {
    expect(suggestedStageFromSignals({})).toBe('other');
  });
});
