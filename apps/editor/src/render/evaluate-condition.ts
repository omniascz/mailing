import type { DynamicCondition, DynamicRule } from '../schema/blocks.js';
import type { MergeTagContact } from './merge-tags.js';

/**
 * In-memory predicate evaluator for DynamicBlock conditions.
 *
 * This is deliberately *not* the same engine as the server-side segment
 * builder — it only evaluates a single contact and never touches SQL. The two
 * stay in sync by sharing the DynamicCondition JSON shape.
 *
 * Returns `false` for malformed or unknown fields rather than throwing:
 * rendering an email is a hot path and we prefer to silently fall through to
 * the elseContent of a DynamicBlock over crashing the render.
 */
export function evaluateCondition(
  cond: DynamicCondition | undefined | null,
  contact: MergeTagContact | null | undefined,
): boolean {
  if (!cond) return false;
  const ruleResults = (cond.rules ?? []).map((r) => evaluateRule(r, contact));
  const groupResults = (cond.groups ?? []).map((g) => evaluateCondition(g, contact));
  const all = [...ruleResults, ...groupResults];

  let result: boolean;
  if (all.length === 0) {
    result = true;
  } else if (cond.operator === 'OR') {
    result = all.some(Boolean);
  } else {
    result = all.every(Boolean);
  }

  return cond.negate ? !result : result;
}

function resolveField(contact: MergeTagContact | null | undefined, field: string): unknown {
  if (!contact) return undefined;

  if (field === 'tags') {
    return contact['tags'];
  }

  if (field.startsWith('custom.')) {
    const key = field.slice('custom.'.length);
    const custom = contact['custom_fields'] ?? contact['customFields'];
    if (custom && typeof custom === 'object') {
      return (custom as Record<string, unknown>)[key];
    }
    return undefined;
  }

  if (field in contact) return contact[field];
  const camel = field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  if (camel in contact) return contact[camel];
  return undefined;
}

function coerceString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function compareOrdered(a: unknown, b: unknown, op: 'gt' | 'gte' | 'lt' | 'lte'): boolean {
  if (a == null || b == null) return false;
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    switch (op) {
      case 'gt':
        return na > nb;
      case 'gte':
        return na >= nb;
      case 'lt':
        return na < nb;
      case 'lte':
        return na <= nb;
    }
  }
  const sa = String(a);
  const sb = String(b);
  switch (op) {
    case 'gt':
      return sa > sb;
    case 'gte':
      return sa >= sb;
    case 'lt':
      return sa < sb;
    case 'lte':
      return sa <= sb;
  }
}

function evaluateRule(rule: DynamicRule, contact: MergeTagContact | null | undefined): boolean {
  const value = resolveField(contact, rule.field);

  switch (rule.op) {
    case 'eq':
      // Loose equality for number-vs-string coming out of JSONB.
      return String(value ?? '') === String(rule.value ?? '');
    case 'neq':
      return String(value ?? '') !== String(rule.value ?? '');
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compareOrdered(value, rule.value, rule.op);
    case 'contains': {
      const haystack = coerceString(value);
      const needle = coerceString(rule.value);
      return (
        haystack !== null &&
        needle !== null &&
        haystack.toLowerCase().includes(needle.toLowerCase())
      );
    }
    case 'not_contains': {
      const haystack = coerceString(value);
      const needle = coerceString(rule.value);
      return !(
        haystack !== null &&
        needle !== null &&
        haystack.toLowerCase().includes(needle.toLowerCase())
      );
    }
    case 'in': {
      if (!Array.isArray(rule.value)) return false;
      return rule.value.some((v) => String(v) === String(value ?? ''));
    }
    case 'not_in': {
      if (!Array.isArray(rule.value)) return true;
      return !rule.value.some((v) => String(v) === String(value ?? ''));
    }
    case 'is_set':
      return value != null && value !== '';
    case 'is_not_set':
      return value == null || value === '';
    case 'has_tag': {
      const tags = Array.isArray(value) ? (value as unknown[]) : [];
      const target = String(rule.value ?? '');
      return tags.some((t) => String(t) === target);
    }
    case 'not_has_tag': {
      const tags = Array.isArray(value) ? (value as unknown[]) : [];
      const target = String(rule.value ?? '');
      return !tags.some((t) => String(t) === target);
    }
    default:
      return false;
  }
}
