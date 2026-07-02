import { describe, it, expect } from 'vitest';
import { normalizeConditionConfig, isConditionSupported } from './condition-rules.js';

describe('normalizeConditionConfig', () => {
  it('passes through an executor-shaped condition unchanged', () => {
    expect(normalizeConditionConfig({ field: 'has_tag', op: 'eq', value: 'VIP' })).toEqual({
      field: 'has_tag',
      op: 'eq',
      value: 'VIP',
      withinDays: undefined,
    });
  });

  it('maps email_opened / email_clicked rules', () => {
    expect(normalizeConditionConfig({ rule: { type: 'email_opened' } }).field).toBe('email_opened');
    expect(normalizeConditionConfig({ rule: { type: 'email_clicked' } }).field).toBe('email_clicked');
  });

  it('maps *_within rules to email_opened + withinDays', () => {
    expect(normalizeConditionConfig({ rule: { type: 'email_opened_within', days: 3 } })).toEqual({
      field: 'email_opened',
      withinDays: 3,
    });
    expect(normalizeConditionConfig({ rule: { type: 'opened_email_within', days: 7 } })).toEqual({
      field: 'email_opened',
      withinDays: 7,
    });
  });

  it('maps api_event_occurred to an api_event lookup', () => {
    expect(
      normalizeConditionConfig({ rule: { type: 'api_event_occurred', eventName: 'feature_activated' } }),
    ).toEqual({ field: 'api_event', op: 'occurred', value: 'feature_activated', withinDays: undefined });
  });

  it('marks unknown business rules as unsupported (traceable, not silent)', () => {
    expect(normalizeConditionConfig({ rule: { type: 'nps_score_gte', value: 9 } }).field).toBe(
      'unsupported:nps_score_gte',
    );
    expect(normalizeConditionConfig({ rule: { type: 'cart_still_abandoned' } }).field).toBe(
      'unsupported:cart_still_abandoned',
    );
    expect(normalizeConditionConfig({}).field).toBe('unsupported:missing_rule');
  });

  it('isConditionSupported reflects mappability', () => {
    expect(isConditionSupported({ rule: { type: 'email_opened' } })).toBe(true);
    expect(isConditionSupported({ field: 'has_tag' })).toBe(true);
    expect(isConditionSupported({ rule: { type: 'feature_used', value: 'x' } })).toBe(false);
  });
});
