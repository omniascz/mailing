/**
 * Calculated properties service (#350) — CRUD + value cache helpers.
 *
 * The evaluator itself is in ./evaluator.ts. This module handles persistence,
 * ordering (so `$ref` props are evaluated after their dependencies), and the
 * cached-value table.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  calculatedProperties,
  calculatedPropertyValues,
  type CalculatedProperty,
  type CalcNode,
} from '../../db/schema/calculated-properties.js';
import { AppError } from '../../lib/app-error.js';
import { evaluate, referencedFields } from './evaluator.js';

export interface CreatePropInput {
  entity: 'contact' | 'deal' | 'account';
  key: string;
  label: string;
  description?: string;
  resultType: 'number' | 'string' | 'boolean' | 'date';
  formula: CalcNode;
  cacheStrategy?: 'none' | 'lazy' | 'eager';
  cacheTtlSeconds?: number;
}

export async function createProperty(
  orgId: string,
  input: CreatePropInput,
): Promise<CalculatedProperty> {
  if (!/^[a-z][a-z0-9_]*$/.test(input.key)) {
    throw AppError.badRequest('key must be snake_case');
  }
  const [row] = await db
    .insert(calculatedProperties)
    .values({
      orgId,
      entity: input.entity,
      key: input.key,
      label: input.label,
      description: input.description,
      resultType: input.resultType,
      formula: input.formula,
      cacheStrategy: input.cacheStrategy ?? 'lazy',
      cacheTtlSeconds: input.cacheTtlSeconds ?? 3600,
    })
    .returning();
  if (!row) throw AppError.internal('Failed to create calculated property');
  return row;
}

export async function listProperties(
  orgId: string,
  entity?: 'contact' | 'deal' | 'account',
): Promise<CalculatedProperty[]> {
  const where = entity
    ? and(
        eq(calculatedProperties.orgId, orgId),
        eq(calculatedProperties.entity, entity),
        isNull(calculatedProperties.deletedAt),
      )
    : and(eq(calculatedProperties.orgId, orgId), isNull(calculatedProperties.deletedAt));
  return db.select().from(calculatedProperties).where(where);
}

export async function deleteProperty(orgId: string, id: string): Promise<void> {
  await db
    .update(calculatedProperties)
    .set({ deletedAt: new Date() })
    .where(and(eq(calculatedProperties.orgId, orgId), eq(calculatedProperties.id, id)));
}

/**
 * Evaluate every enabled prop for a given entity, honouring `$ref` ordering.
 * Returns a `{ [key]: value }` map.
 */
export function evaluateAll(
  props: CalculatedProperty[],
  entity: Record<string, unknown>,
): Record<string, unknown> {
  const ordered = topoOrder(props);
  const resolved: Record<string, unknown> = {};
  for (const p of ordered) {
    if (!p.enabled) continue;
    try {
      resolved[p.key] = evaluate(p.formula, { entity, resolvedProps: resolved });
    } catch {
      resolved[p.key] = null;
    }
  }
  return resolved;
}

/** Topologically order props so that `$ref` dependencies come first. */
function topoOrder(props: CalculatedProperty[]): CalculatedProperty[] {
  const byKey = new Map(props.map((p) => [p.key, p]));
  const visited = new Set<string>();
  const temp = new Set<string>();
  const out: CalculatedProperty[] = [];

  function visit(key: string): void {
    if (visited.has(key)) return;
    if (temp.has(key)) return; // cycle — skip
    const p = byKey.get(key);
    if (!p) return;
    temp.add(key);
    for (const ref of refsOf(p.formula)) visit(ref);
    temp.delete(key);
    visited.add(key);
    out.push(p);
  }

  for (const p of props) visit(p.key);
  return out;
}

function refsOf(node: CalcNode, out: Set<string> = new Set()): Set<string> {
  if (node === null || typeof node !== 'object') return out;
  if ('$ref' in node) {
    out.add(node.$ref);
    return out;
  }
  if ('$field' in node) return out;
  if ('op' in node) {
    refsOf(node.left, out);
    refsOf(node.right, out);
    return out;
  }
  if ('fn' in node) {
    for (const a of node.args ?? []) refsOf(a, out);
    return out;
  }
  return out;
}

// ─── Cached value helpers ────────────────────────────────────────────────────

export async function writeCachedValues(
  orgId: string,
  entityId: string,
  values: Array<{ propId: string; value: unknown; ttlSeconds: number }>,
): Promise<void> {
  if (values.length === 0) return;
  const now = Date.now();
  await db.delete(calculatedPropertyValues).where(
    and(
      inArray(
        calculatedPropertyValues.propId,
        values.map((v) => v.propId),
      ),
      eq(calculatedPropertyValues.entityId, entityId),
    ),
  );
  await db.insert(calculatedPropertyValues).values(
    values.map((v) => ({
      orgId,
      propId: v.propId,
      entityId,
      value: v.value,
      computedAt: new Date(now),
      expiresAt: new Date(now + v.ttlSeconds * 1000),
    })),
  );
}

export { evaluate, referencedFields };
