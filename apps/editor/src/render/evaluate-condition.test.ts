import { describe, expect, it } from 'vitest';
import { evaluateCondition } from './evaluate-condition.js';

describe('evaluateCondition', () => {
  it('returns true for an empty AND condition', () => {
    expect(
      evaluateCondition({ operator: 'AND', rules: [] }, { firstName: 'x' }),
    ).toBe(true);
  });

  it('eq operator matches loosely across string/number', () => {
    expect(
      evaluateCondition(
        { operator: 'AND', rules: [{ field: 'age', op: 'eq', value: '30' }] },
        { age: 30 },
      ),
    ).toBe(true);
  });

  it('has_tag finds a matching tag', () => {
    expect(
      evaluateCondition(
        { operator: 'AND', rules: [{ field: 'tags', op: 'has_tag', value: 'VIP' }] },
        { tags: ['newsletter', 'VIP'] },
      ),
    ).toBe(true);
  });

  it('has_tag returns false when the contact lacks the tag', () => {
    expect(
      evaluateCondition(
        { operator: 'AND', rules: [{ field: 'tags', op: 'has_tag', value: 'VIP' }] },
        { tags: ['newsletter'] },
      ),
    ).toBe(false);
  });

  it('resolves custom.* fields from custom_fields', () => {
    expect(
      evaluateCondition(
        { operator: 'AND', rules: [{ field: 'custom.plan', op: 'eq', value: 'pro' }] },
        { custom_fields: { plan: 'pro' } },
      ),
    ).toBe(true);
  });

  it('OR operator short-circuits', () => {
    expect(
      evaluateCondition(
        {
          operator: 'OR',
          rules: [
            { field: 'age', op: 'gt', value: 100 },
            { field: 'firstName', op: 'eq', value: 'Ada' },
          ],
        },
        { age: 30, firstName: 'Ada' },
      ),
    ).toBe(true);
  });

  it('is_set and is_not_set distinguish missing from empty', () => {
    const cond = { operator: 'AND' as const, rules: [{ field: 'email', op: 'is_set' as const }] };
    expect(evaluateCondition(cond, { email: 'a@b.c' })).toBe(true);
    expect(evaluateCondition(cond, { email: '' })).toBe(false);
    expect(evaluateCondition(cond, {})).toBe(false);
  });

  it('contains is case-insensitive', () => {
    expect(
      evaluateCondition(
        { operator: 'AND', rules: [{ field: 'email', op: 'contains', value: 'EXAMPLE' }] },
        { email: 'me@example.com' },
      ),
    ).toBe(true);
  });

  it('negate inverts the result', () => {
    expect(
      evaluateCondition(
        {
          operator: 'AND',
          rules: [{ field: 'tags', op: 'has_tag', value: 'VIP' }],
          negate: true,
        },
        { tags: ['VIP'] },
      ),
    ).toBe(false);
  });

  it('returns false on null contact', () => {
    expect(
      evaluateCondition(
        { operator: 'AND', rules: [{ field: 'firstName', op: 'eq', value: 'Ada' }] },
        null,
      ),
    ).toBe(false);
  });
});
