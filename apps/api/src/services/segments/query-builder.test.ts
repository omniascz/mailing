import { describe, it, expect } from 'vitest';
import { buildSegmentWhere, SegmentQueryError } from './query-builder.js';
import type { SegmentConditions } from '../../db/schema/segments.js';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();

function render(fragment: SQL): { sql: string; params: unknown[] } {
  const q = dialect.sqlToQuery(fragment);
  return { sql: q.sql, params: q.params as unknown[] };
}

describe('buildSegmentWhere', () => {
  it('handles a simple equality rule on a direct field', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'status', op: 'eq', value: 'active' }],
    };
    const { sql: text, params } = render(buildSegmentWhere(cond));
    expect(text).toContain('contacts.status');
    expect(text).toContain('=');
    expect(params).toContain('active');
  });

  it('combines multiple rules with AND', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [
        { field: 'phone_operator', op: 'eq', value: 'O2' },
        { field: 'phone_district', op: 'eq', value: 'Praha' },
      ],
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text).toContain('phone_operator');
    expect(text).toContain('phone_district');
    expect(text).toContain('AND');
  });

  it('combines rules with OR when operator is OR', () => {
    const cond: SegmentConditions = {
      operator: 'OR',
      rules: [
        { field: 'phone_operator', op: 'eq', value: 'O2' },
        { field: 'phone_operator', op: 'eq', value: 'T-Mobile' },
      ],
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text).toContain('OR');
  });

  it('nests groups', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'status', op: 'eq', value: 'active' }],
      groups: [
        {
          operator: 'OR',
          rules: [
            { field: 'phone_operator', op: 'eq', value: 'O2' },
            { field: 'phone_operator', op: 'eq', value: 'Vodafone' },
          ],
        },
      ],
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text).toContain('AND');
    expect(text).toContain('OR');
  });

  it('emits EXISTS for has_tag', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'tags', op: 'has_tag', value: 'VIP' }],
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text).toContain('EXISTS');
    expect(text).toContain('contact_tags');
  });

  it('emits NOT EXISTS for not_has_tag', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'tags', op: 'not_has_tag', value: 'VIP' }],
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text).toContain('NOT EXISTS');
  });

  it('emits EXISTS on email_events for opened_campaign', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'events', op: 'opened_campaign', withinDays: 30 }],
    };
    const { sql: text, params } = render(buildSegmentWhere(cond));
    expect(text).toContain('email_events');
    expect(text).toContain('days');
    expect(params).toContain('open');
    expect(params).toContain(30);
  });

  it('treats custom.* fields as custom_fields jsonb access', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'custom.loyalty_tier', op: 'eq', value: 'gold' }],
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text).toContain('custom_fields');
    expect(text).toContain('->>');
  });

  it('generates ILIKE for contains', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'email', op: 'contains', value: 'gmail.com' }],
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text.toLowerCase()).toContain('ilike');
  });

  it('generates IS NULL for is_not_set', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'phone', op: 'is_not_set' }],
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text).toContain('IS NULL');
  });

  it('rejects unknown fields', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'password_hash', op: 'eq', value: 'x' }],
    };
    expect(() => buildSegmentWhere(cond)).toThrow(SegmentQueryError);
  });

  it('rejects unknown operators', () => {
    const cond = {
      operator: 'AND',
      rules: [{ field: 'email', op: 'matches', value: 'x' }],
    } as unknown as SegmentConditions;
    expect(() => buildSegmentWhere(cond)).toThrow(SegmentQueryError);
  });

  it('rejects deep nesting', () => {
    const depth = 12;
    let node: SegmentConditions = { operator: 'AND', rules: [{ field: 'status', op: 'eq', value: 'active' }] };
    for (let i = 0; i < depth; i++) {
      node = { operator: 'AND', rules: [], groups: [node] };
    }
    expect(() => buildSegmentWhere(node)).toThrow(SegmentQueryError);
  });

  it('handles empty IN list by emitting FALSE', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'phone_operator', op: 'in', value: [] }],
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text).toContain('FALSE');
  });

  it('supports the negate flag on a group', () => {
    const cond: SegmentConditions = {
      operator: 'AND',
      rules: [{ field: 'status', op: 'eq', value: 'active' }],
      negate: true,
    };
    const text = render(buildSegmentWhere(cond)).sql;
    expect(text).toContain('NOT');
  });
});
