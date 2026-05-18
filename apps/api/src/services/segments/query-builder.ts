import { sql, type SQL } from 'drizzle-orm';
import type { SegmentConditions, SegmentRule, SegmentRuleOp } from '../../db/schema/segments.js';

/**
 * Build a parameterized SQL WHERE fragment (Drizzle SQL template) from a
 * SegmentConditions tree. Caller is expected to plug the fragment into a
 * query already scoped to `org_id` and `deleted_at IS NULL`.
 *
 * Design notes:
 * - All user-supplied values flow through sql.param() so this is injection-safe.
 * - Field identifiers are validated against an allow-list; unknown fields throw.
 * - Tag-based rules emit EXISTS subqueries against contact_tags + tags.
 * - Event-based rules emit EXISTS subqueries against email_events.
 */

const DIRECT_FIELDS: Record<string, { column: string; type: 'text' | 'enum' | 'number' | 'date' | 'bool' }> = {
  email: { column: 'email', type: 'text' },
  phone: { column: 'phone', type: 'text' },
  first_name: { column: 'first_name', type: 'text' },
  last_name: { column: 'last_name', type: 'text' },
  status: { column: 'status', type: 'enum' },
  source: { column: 'source', type: 'text' },
  phone_type: { column: 'phone_type', type: 'enum' },
  phone_status: { column: 'phone_status', type: 'enum' },
  phone_operator: { column: 'phone_operator', type: 'text' },
  phone_region: { column: 'phone_region', type: 'text' },
  phone_district: { column: 'phone_district', type: 'text' },
  phone_country: { column: 'phone_country', type: 'text' },
  phone_ported: { column: 'phone_ported', type: 'bool' },
  phone_roaming: { column: 'phone_roaming', type: 'bool' },
  last_opened_at: { column: 'last_opened_at', type: 'date' },
  last_clicked_at: { column: 'last_clicked_at', type: 'date' },
  created_at: { column: 'created_at', type: 'date' },
  updated_at: { column: 'updated_at', type: 'date' },
};

/**
 * E-commerce / engagement fields from the contact_engagement table.
 * These are resolved as correlated subqueries so the caller does not
 * need to add an extra JOIN to the contacts query.
 *
 * Usage in segment conditions: { field: 'engagement.total_orders', op: 'gte', value: 3 }
 */
const ENGAGEMENT_FIELDS: Record<string, { column: string; type: 'number' | 'date' | 'text' }> = {
  total_orders:          { column: 'total_orders',           type: 'number' },
  total_revenue:         { column: 'total_revenue',          type: 'number' },
  last_order_at:         { column: 'last_order_at',          type: 'date'   },
  first_order_at:        { column: 'first_order_at',         type: 'date'   },
  predicted_clv:         { column: 'predicted_clv',          type: 'number' },
  purchase_likelihood:   { column: 'purchase_likelihood',    type: 'number' },
  churn_risk:            { column: 'churn_risk',             type: 'number' },
  rfm_segment:           { column: 'rfm_segment',            type: 'text'   },
  rfm_score:             { column: 'rfm_score',              type: 'number' },
  total_opens:           { column: 'total_opens',            type: 'number' },
  total_clicks:          { column: 'total_clicks',           type: 'number' },
  total_sends:           { column: 'total_sends',            type: 'number' },
  avg_order_interval_days: { column: 'avg_order_interval_days', type: 'number' },
};

const ENGAGEMENT_PREFIX = 'engagement.';
const CUSTOM_FIELD_PREFIX = 'custom.';

export class SegmentQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SegmentQueryError';
  }
}

function fieldRef(field: string): SQL {
  // Engagement / e-commerce fields — correlated subquery into contact_engagement
  if (field.startsWith(ENGAGEMENT_PREFIX)) {
    const key = field.slice(ENGAGEMENT_PREFIX.length);
    const def = ENGAGEMENT_FIELDS[key];
    if (!def) throw new SegmentQueryError(`Unknown engagement field: ${field}`);
    return sql`(SELECT ${sql.raw('ce.' + def.column)} FROM contact_engagement ce WHERE ce.contact_id = contacts.id LIMIT 1)`;
  }

  if (field.startsWith(CUSTOM_FIELD_PREFIX)) {
    const key = field.slice(CUSTOM_FIELD_PREFIX.length);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
      throw new SegmentQueryError(`Invalid custom field key: ${field}`);
    }
    return sql`contacts.custom_fields ->> ${key}`;
  }
  const def = DIRECT_FIELDS[field];
  if (!def) throw new SegmentQueryError(`Unknown field: ${field}`);
  // Column names here come from the allow-list above — safe to raw-interpolate.
  return sql.raw(`contacts.${def.column}`);
}

function comparisonOps(): Set<SegmentRuleOp> {
  return new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
}

function buildRule(rule: SegmentRule): SQL {
  switch (rule.op) {
    case 'has_tag':
    case 'not_has_tag': {
      const tagValue = rule.value;
      if (typeof tagValue !== 'string' || tagValue.length === 0) {
        throw new SegmentQueryError('has_tag requires a tag name or id string');
      }
      const sub = sql`SELECT 1 FROM contact_tags ct
        JOIN tags t ON t.id = ct.tag_id
        WHERE ct.contact_id = contacts.id
          AND (t.id::text = ${tagValue} OR t.name = ${tagValue})`;
      return rule.op === 'has_tag' ? sql`EXISTS (${sub})` : sql`NOT EXISTS (${sub})`;
    }

    case 'opened_campaign':
    case 'not_opened_campaign':
    case 'clicked_link':
    case 'not_clicked_link': {
      const campaignId = rule.value;
      if (campaignId !== undefined && typeof campaignId !== 'string') {
        throw new SegmentQueryError('campaign id must be a string when provided');
      }
      const eventType = rule.op.includes('opened') ? 'open' : 'click';
      const withinDays = typeof rule.withinDays === 'number' && rule.withinDays > 0 ? rule.withinDays : null;

      const parts: SQL[] = [
        sql`SELECT 1 FROM email_events ee WHERE ee.contact_id = contacts.id AND ee.event_type = ${eventType}`,
      ];
      if (campaignId) parts.push(sql` AND ee.campaign_id = ${campaignId}`);
      if (withinDays !== null) {
        parts.push(sql` AND ee.created_at >= NOW() - (${withinDays} || ' days')::interval`);
      }
      const sub = sql.join(parts);
      return rule.op.startsWith('not_') ? sql`NOT EXISTS (${sub})` : sql`EXISTS (${sub})`;
    }

    case 'is_set':
      return sql`${fieldRef(rule.field)} IS NOT NULL`;

    case 'is_not_set':
      return sql`${fieldRef(rule.field)} IS NULL`;

    case 'contains':
      return sql`${fieldRef(rule.field)} ILIKE ${'%' + String(rule.value ?? '') + '%'}`;

    case 'not_contains':
      return sql`(${fieldRef(rule.field)} IS NULL OR ${fieldRef(rule.field)} NOT ILIKE ${'%' + String(rule.value ?? '') + '%'})`;

    case 'starts_with':
      return sql`${fieldRef(rule.field)} ILIKE ${String(rule.value ?? '') + '%'}`;

    case 'ends_with':
      return sql`${fieldRef(rule.field)} ILIKE ${'%' + String(rule.value ?? '')}`;

    case 'in':
    case 'not_in': {
      const arr = Array.isArray(rule.value) ? rule.value : [];
      if (arr.length === 0) {
        return rule.op === 'in' ? sql`FALSE` : sql`TRUE`;
      }
      const joined = sql.join(
        arr.map((v) => sql`${v}`),
        sql`, `,
      );
      return rule.op === 'in'
        ? sql`${fieldRef(rule.field)} IN (${joined})`
        : sql`${fieldRef(rule.field)} NOT IN (${joined})`;
    }

    default: {
      if (!comparisonOps().has(rule.op)) {
        throw new SegmentQueryError(`Unknown operator: ${rule.op}`);
      }
      const opSql = {
        eq: sql.raw('='),
        neq: sql.raw('<>'),
        gt: sql.raw('>'),
        gte: sql.raw('>='),
        lt: sql.raw('<'),
        lte: sql.raw('<='),
      }[rule.op as 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'];
      return sql`${fieldRef(rule.field)} ${opSql} ${rule.value}`;
    }
  }
}

function buildGroup(node: SegmentConditions, depth: number): SQL {
  if (depth > 8) throw new SegmentQueryError('Segment nesting too deep (max 8)');

  const ruleSqls = (node.rules ?? []).map(buildRule);
  const groupSqls = (node.groups ?? []).map((g) => buildGroup(g, depth + 1));
  const parts = [...ruleSqls, ...groupSqls];

  if (parts.length === 0) return sql`TRUE`;

  const separator = node.operator === 'OR' ? sql` OR ` : sql` AND `;
  const combined = sql`(${sql.join(parts, separator)})`;
  return node.negate ? sql`NOT ${combined}` : combined;
}

/**
 * Build a WHERE fragment from the conditions tree.
 * Throws SegmentQueryError for malformed input.
 */
export function buildSegmentWhere(conditions: SegmentConditions): SQL {
  if (!conditions || typeof conditions !== 'object') {
    throw new SegmentQueryError('Conditions must be an object');
  }
  if (conditions.operator !== 'AND' && conditions.operator !== 'OR') {
    throw new SegmentQueryError('Root operator must be AND or OR');
  }
  return buildGroup(conditions, 0);
}
