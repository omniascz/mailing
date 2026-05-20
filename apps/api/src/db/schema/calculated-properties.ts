import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Calculated properties (#350) — user-defined computed fields on an entity
 * (contact, deal, account). Evaluated lazily at read time, or eagerly via the
 * workers when the formula references fields that rarely change.
 *
 * Formula is a tiny AST: a JSON tree describing arithmetic / comparisons /
 * function calls over `{ $field: "path" }` references and literals. The
 * evaluator is deterministic, side-effect-free, and cheap enough to run per
 * contact on the hot path.
 *
 *   result_type = 'number'
 *     formula: { "op": "-", "left": { "fn": "now" }, "right": { "$field": "last_order_at" } }
 *   result_type = 'boolean'
 *     formula: { "op": ">", "left": { "$ref": "orders_count" }, "right": 5 }
 *
 * `$field` reads from the entity's root-level column or `custom_fields.*` (we
 * auto-fallback). `$ref` reads another calculated property's cached value on
 * the same entity (evaluator detects cycles).
 */

export const calcPropEntityEnum = pgEnum('calc_prop_entity', ['contact', 'deal', 'account']);

export const calcPropResultTypeEnum = pgEnum('calc_prop_result_type', [
  'number',
  'string',
  'boolean',
  'date',
]);

export const calculatedProperties = pgTable(
  'calculated_properties',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entity: calcPropEntityEnum('entity').notNull(),
    key: varchar('key', { length: 64 }).notNull(),
    label: varchar('label', { length: 128 }).notNull(),
    description: text('description'),
    resultType: calcPropResultTypeEnum('result_type').notNull(),
    /** Formula AST — see module doc. */
    formula: jsonb('formula').$type<CalcNode>().notNull(),
    /**
     * Cache strategy:
     *   'none'   — always compute on read (cheap formulas)
     *   'lazy'   — cache per-entity with TTL; stale reads trigger background refresh
     *   'eager'  — refreshed by workers when any referenced field changes
     */
    cacheStrategy: varchar('cache_strategy', { length: 16 }).notNull().default('lazy'),
    cacheTtlSeconds: integer('cache_ttl_seconds').notNull().default(3600),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('calc_props_org_entity_key_uq').on(t.orgId, t.entity, t.key),
    index('calc_props_org_idx').on(t.orgId),
  ],
);

/** Per-entity cached values, keyed by (propId, entityId). */
export const calculatedPropertyValues = pgTable(
  'calculated_property_values',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    propId: uuid('prop_id')
      .notNull()
      .references(() => calculatedProperties.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').notNull(),
    /** The computed value, JSON-serialised to survive any of the result types. */
    value: jsonb('value').$type<unknown>(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('calc_prop_values_prop_entity_uq').on(t.propId, t.entityId),
    index('calc_prop_values_org_idx').on(t.orgId),
  ],
);

// ─── Formula AST ──────────────────────────────────────────────────────────────

export type CalcLiteral = number | string | boolean | null;

export interface CalcFieldRef {
  $field: string;
}
export interface CalcPropRef {
  $ref: string;
}

export interface CalcBinOp {
  op: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||';
  left: CalcNode;
  right: CalcNode;
}

export interface CalcCall {
  fn:
    | 'now'
    | 'today'
    | 'days_between'
    | 'hours_between'
    | 'coalesce'
    | 'if'
    | 'lower'
    | 'upper'
    | 'concat'
    | 'length'
    | 'round'
    | 'floor'
    | 'ceil'
    | 'abs'
    | 'min'
    | 'max';
  args?: CalcNode[];
}

export type CalcNode = CalcLiteral | CalcFieldRef | CalcPropRef | CalcBinOp | CalcCall;

export type CalculatedProperty = typeof calculatedProperties.$inferSelect;
export type NewCalculatedProperty = typeof calculatedProperties.$inferInsert;
export type CalculatedPropertyValue = typeof calculatedPropertyValues.$inferSelect;
