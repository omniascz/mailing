import { describe, it, expect } from 'vitest';
import { DEFAULT_SYSTEM_RULES } from './index.js';

describe('DEFAULT_SYSTEM_RULES', () => {
  it('ships with a sensible set of default rules', () => {
    expect(DEFAULT_SYSTEM_RULES.length).toBeGreaterThanOrEqual(8);
  });

  it('includes critical bounce-rate rule with pause action', () => {
    const rule = DEFAULT_SYSTEM_RULES.find(
      (r) => r.signalType === 'high_bounce_rate' && r.severity === 'critical',
    );
    expect(rule).toBeDefined();
    expect(rule!.action).toBe('pause_campaigns');
    expect(rule!.threshold).toBeGreaterThanOrEqual(10);
  });

  it('includes a spam trap rule', () => {
    const rule = DEFAULT_SYSTEM_RULES.find((r) => r.signalType === 'spam_trap_hit');
    expect(rule).toBeDefined();
  });

  it('complaint rate thresholds follow Gmail/ESP guidance (≤0.3% alert, ≤1% critical)', () => {
    const complaints = DEFAULT_SYSTEM_RULES.filter((r) => r.signalType === 'high_complaint_rate');
    const alertRule = complaints.find((r) => r.severity === 'high');
    const criticalRule = complaints.find((r) => r.severity === 'critical');
    expect(alertRule!.threshold).toBeLessThanOrEqual(0.3);
    expect(criticalRule!.threshold).toBeLessThanOrEqual(1);
  });

  it('every rule has a positive window and sample size', () => {
    for (const rule of DEFAULT_SYSTEM_RULES) {
      expect(rule.windowMinutes).toBeGreaterThan(0);
      expect(rule.minSampleSize).toBeGreaterThanOrEqual(0);
    }
  });

  it('every rule has a valid action', () => {
    const valid = [
      'none',
      'alert',
      'throttle',
      'pause_campaigns',
      'suspend_sending',
      'suspend_account',
      'require_review',
    ];
    for (const rule of DEFAULT_SYSTEM_RULES) {
      expect(valid).toContain(rule.action);
    }
  });
});
