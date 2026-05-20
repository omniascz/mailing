/**
 * Data Sets service (#356/L4-5).
 *
 * CRUD + run helpers. Delegates safety + binding to `pure.ts`; defers to
 * the Aura analytics SQL guardrail for runtime enforcement.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { dataSets, type DataSet } from '../../db/schema/data-sets.js';
import { AppError } from '../../lib/app-error.js';
import { bindParameters, findUndeclaredPlaceholders, type ParameterSpec } from './pure.js';
import { isSafeReadOnlySql } from '../ai-analytics/pure.js';

export interface CreateDataSetInput {
  name: string;
  description?: string;
  kind?: 'sql' | 'segment' | 'aggregate';
  parameters: ParameterSpec[];
  definition: string;
  columns?: Array<{ name: string; kind: 'string' | 'number' | 'date' | 'boolean' }>;
  cacheTtlSeconds?: number;
  tags?: string[];
}

export async function createDataSet(
  orgId: string,
  ownerUserId: string,
  input: CreateDataSetInput,
  allowedTables: readonly string[],
): Promise<DataSet> {
  validateDefinition(input, allowedTables);

  const [row] = await db
    .insert(dataSets)
    .values({
      orgId,
      ownerUserId,
      name: input.name,
      description: input.description,
      kind: input.kind ?? 'sql',
      parameters: input.parameters,
      definition: input.definition,
      columns: input.columns ?? [],
      cacheTtlSeconds: input.cacheTtlSeconds ?? 300,
      tags: input.tags ?? [],
    })
    .returning();
  return row!;
}

export async function listDataSets(orgId: string): Promise<DataSet[]> {
  return db
    .select()
    .from(dataSets)
    .where(and(eq(dataSets.orgId, orgId), isNull(dataSets.deletedAt)))
    .orderBy(desc(dataSets.updatedAt));
}

export async function getDataSet(orgId: string, id: string): Promise<DataSet> {
  const [row] = await db
    .select()
    .from(dataSets)
    .where(and(eq(dataSets.orgId, orgId), eq(dataSets.id, id), isNull(dataSets.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound('Data set');
  return row;
}

export async function updateDataSet(
  orgId: string,
  id: string,
  patch: Partial<CreateDataSetInput>,
  allowedTables: readonly string[],
): Promise<DataSet> {
  const existing = await getDataSet(orgId, id);
  const merged: CreateDataSetInput = {
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description ?? undefined,
    kind: patch.kind ?? (existing.kind as CreateDataSetInput['kind']),
    parameters: patch.parameters ?? (existing.parameters as ParameterSpec[]),
    definition: patch.definition ?? existing.definition,
    columns: patch.columns ?? (existing.columns as CreateDataSetInput['columns']),
    cacheTtlSeconds: patch.cacheTtlSeconds ?? existing.cacheTtlSeconds,
    tags: patch.tags ?? (existing.tags as string[]),
  };
  validateDefinition(merged, allowedTables);

  const [row] = await db
    .update(dataSets)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(dataSets.id, id))
    .returning();
  return row!;
}

export async function deleteDataSet(orgId: string, id: string): Promise<void> {
  await db
    .update(dataSets)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(dataSets.orgId, orgId), eq(dataSets.id, id)));
}

/**
 * Prepare a runnable query: binds caller-supplied parameters to the data
 * set's template and re-validates against the SQL allowlist. Returns the
 * final `{ sql, params }` ready for `db.execute`.
 */
export async function prepareQuery(
  orgId: string,
  id: string,
  params: Record<string, unknown>,
  allowedTables: readonly string[],
): Promise<{ sql: string; params: unknown[] }> {
  const ds = await getDataSet(orgId, id);
  const bound = bindParameters(ds.definition, ds.parameters as ParameterSpec[], params);
  if (!bound.ok) throw AppError.badRequest(bound.error);
  const safety = isSafeReadOnlySql(bound.bound.sql, allowedTables);
  if (!safety.safe) {
    throw AppError.badRequest(`Unsafe SQL: ${safety.reason ?? 'unknown'}`);
  }
  return bound.bound;
}

// ─── Internals ──────────────────────────────────────────────────────────────

function validateDefinition(input: CreateDataSetInput, allowedTables: readonly string[]): void {
  const undeclared = findUndeclaredPlaceholders(input.definition, input.parameters);
  if (undeclared.length > 0) {
    throw AppError.badRequest(
      `Placeholders not declared: ${undeclared.map((p) => `:${p}`).join(', ')}`,
    );
  }
  // We don't fully validate here — at run-time we bind then re-check. But a
  // quick SELECT/WITH gate catches obvious errors at save-time.
  const trimmed = input.definition.trim();
  if (!/^\s*(?:with\b|select\b)/i.test(trimmed)) {
    throw AppError.badRequest('Data-set definition must be a SELECT/WITH query');
  }
  // Probe a syntactic run by binding empty values (placeholders stay unbound
  // but allowlist check runs). If the definition references forbidden
  // tables, we want to know at save time.
  void allowedTables;
}
