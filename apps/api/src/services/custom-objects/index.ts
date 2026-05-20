import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  customObjectDefinitions,
  customObjectRecords,
  customObjectRelations,
  type CustomObjectDefinition,
  type CustomObjectField,
  type CustomObjectRecord,
} from '../../db/schema/custom-objects.js';
import { AppError } from '../../lib/app-error.js';

const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/;

function assertKey(key: string, label: string): void {
  if (!KEY_RE.test(key)) {
    throw AppError.badRequest(`${label} must be snake_case and start with a letter (1-63 chars)`);
  }
}

function assertFields(fields: CustomObjectField[]): void {
  const seen = new Set<string>();
  for (const f of fields) {
    assertKey(f.key, `field "${f.key}"`);
    if (seen.has(f.key)) throw AppError.badRequest(`duplicate field key: ${f.key}`);
    seen.add(f.key);
    if (f.type === 'select' && (!f.options || f.options.length === 0)) {
      throw AppError.badRequest(`select field "${f.key}" requires non-empty options`);
    }
    if (f.type === 'reference' && !f.referenceTo) {
      throw AppError.badRequest(`reference field "${f.key}" requires referenceTo`);
    }
    if (f.referenceTo === 'custom' && !f.referenceCustomKey) {
      throw AppError.badRequest(
        `field "${f.key}": referenceCustomKey required when referenceTo='custom'`,
      );
    }
  }
}

// ─── Definitions CRUD ────────────────────────────────────────────────────────

export async function createDefinition(input: {
  orgId: string;
  key: string;
  singularLabel: string;
  pluralLabel: string;
  description?: string;
  fields?: CustomObjectField[];
  primaryFieldKey?: string;
}): Promise<CustomObjectDefinition> {
  assertKey(input.key, 'object key');
  const fields = input.fields ?? [];
  assertFields(fields);
  if (input.primaryFieldKey && !fields.some((f) => f.key === input.primaryFieldKey)) {
    throw AppError.badRequest(`primaryFieldKey "${input.primaryFieldKey}" not found in fields`);
  }
  try {
    const [row] = await db
      .insert(customObjectDefinitions)
      .values({
        orgId: input.orgId,
        key: input.key,
        singularLabel: input.singularLabel,
        pluralLabel: input.pluralLabel,
        description: input.description,
        fields,
        primaryFieldKey: input.primaryFieldKey,
      })
      .returning();
    return row!;
  } catch (err) {
    if (String(err).includes('custom_object_defs_org_key_idx')) {
      throw AppError.conflict(`Custom object with key "${input.key}" already exists`);
    }
    throw err;
  }
}

export async function listDefinitions(orgId: string): Promise<CustomObjectDefinition[]> {
  return db
    .select()
    .from(customObjectDefinitions)
    .where(eq(customObjectDefinitions.orgId, orgId))
    .orderBy(asc(customObjectDefinitions.key));
}

export async function getDefinition(
  orgId: string,
  idOrKey: string,
): Promise<CustomObjectDefinition> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrKey);
  const where = isUuid
    ? and(eq(customObjectDefinitions.id, idOrKey), eq(customObjectDefinitions.orgId, orgId))
    : and(eq(customObjectDefinitions.key, idOrKey), eq(customObjectDefinitions.orgId, orgId));
  const [row] = await db.select().from(customObjectDefinitions).where(where).limit(1);
  if (!row) throw AppError.notFound('Custom object definition');
  return row;
}

export async function updateDefinition(
  orgId: string,
  id: string,
  patch: Partial<{
    singularLabel: string;
    pluralLabel: string;
    description: string;
    fields: CustomObjectField[];
    primaryFieldKey: string;
  }>,
): Promise<CustomObjectDefinition> {
  if (patch.fields) assertFields(patch.fields);
  const [row] = await db
    .update(customObjectDefinitions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(customObjectDefinitions.id, id), eq(customObjectDefinitions.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Custom object definition');
  return row;
}

export async function deleteDefinition(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(customObjectDefinitions)
    .where(and(eq(customObjectDefinitions.id, id), eq(customObjectDefinitions.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Custom object definition');
}

// ─── Record validation ───────────────────────────────────────────────────────

function coerce(value: unknown, type: CustomObjectField['type']): unknown {
  if (value === null || value === undefined) return value;
  switch (type) {
    case 'number': {
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    case 'date':
      if (value instanceof Date) return value.toISOString();
      return value;
    default:
      return value;
  }
}

function validateRecordData(
  def: CustomObjectDefinition,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  const fieldMap = new Map(def.fields.map((f) => [f.key, f]));

  for (const f of def.fields) {
    const raw = data[f.key];
    const value = coerce(raw, f.type);
    if (value === undefined || value === null || value === '') {
      if (f.required) errors.push(`field "${f.key}" is required`);
      continue;
    }
    switch (f.type) {
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value))
          errors.push(`"${f.key}" must be number`);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`"${f.key}" must be boolean`);
        break;
      case 'date':
        if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
          errors.push(`"${f.key}" must be ISO date`);
        break;
      case 'select':
        if (!f.options?.includes(String(value)))
          errors.push(`"${f.key}" must be one of: ${f.options?.join(', ')}`);
        break;
      case 'reference':
        if (typeof value !== 'string') errors.push(`"${f.key}" must be a referenced id (string)`);
        break;
      case 'text':
        if (typeof value !== 'string') errors.push(`"${f.key}" must be string`);
        break;
    }
    out[f.key] = value;
  }

  // Reject keys not in schema (strict-ish — keeps data clean).
  for (const k of Object.keys(data)) {
    if (!fieldMap.has(k)) errors.push(`unknown field "${k}"`);
  }

  if (errors.length > 0) throw AppError.badRequest('Custom object validation failed', { errors });
  return out;
}

// ─── Records CRUD ────────────────────────────────────────────────────────────

export async function createRecord(input: {
  orgId: string;
  objectKey: string;
  data: Record<string, unknown>;
  externalId?: string;
}): Promise<CustomObjectRecord> {
  const def = await getDefinition(input.orgId, input.objectKey);
  const validated = validateRecordData(def, input.data);
  const [row] = await db
    .insert(customObjectRecords)
    .values({
      orgId: input.orgId,
      objectDefId: def.id,
      objectKey: def.key,
      externalId: input.externalId,
      data: validated,
    })
    .returning();
  return row!;
}

export async function upsertRecord(input: {
  orgId: string;
  objectKey: string;
  externalId: string;
  data: Record<string, unknown>;
}): Promise<CustomObjectRecord> {
  const def = await getDefinition(input.orgId, input.objectKey);
  const validated = validateRecordData(def, input.data);
  const [row] = await db
    .insert(customObjectRecords)
    .values({
      orgId: input.orgId,
      objectDefId: def.id,
      objectKey: def.key,
      externalId: input.externalId,
      data: validated,
    })
    .onConflictDoUpdate({
      target: [
        customObjectRecords.orgId,
        customObjectRecords.objectKey,
        customObjectRecords.externalId,
      ],
      set: { data: validated, updatedAt: new Date(), deletedAt: null },
    })
    .returning();
  return row!;
}

export async function listRecords(input: {
  orgId: string;
  objectKey: string;
  limit?: number;
  cursor?: string;
}): Promise<{ data: CustomObjectRecord[]; cursor: string | null }> {
  const limit = Math.min(input.limit ?? 50, 200);
  const def = await getDefinition(input.orgId, input.objectKey);
  const rows = await db
    .select()
    .from(customObjectRecords)
    .where(
      and(
        eq(customObjectRecords.orgId, input.orgId),
        eq(customObjectRecords.objectDefId, def.id),
        isNull(customObjectRecords.deletedAt),
        input.cursor ? sql`${customObjectRecords.createdAt} < ${input.cursor}` : sql`true`,
      ),
    )
    .orderBy(desc(customObjectRecords.createdAt))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    data: slice,
    cursor: hasMore ? slice[slice.length - 1]!.createdAt.toISOString() : null,
  };
}

export async function getRecord(orgId: string, id: string): Promise<CustomObjectRecord> {
  const [row] = await db
    .select()
    .from(customObjectRecords)
    .where(and(eq(customObjectRecords.id, id), eq(customObjectRecords.orgId, orgId)))
    .limit(1);
  if (!row || row.deletedAt) throw AppError.notFound('Custom object record');
  return row;
}

export async function updateRecord(
  orgId: string,
  id: string,
  data: Record<string, unknown>,
): Promise<CustomObjectRecord> {
  const existing = await getRecord(orgId, id);
  const def = await getDefinition(orgId, existing.objectDefId);
  const merged = { ...existing.data, ...data };
  const validated = validateRecordData(def, merged);
  const [row] = await db
    .update(customObjectRecords)
    .set({ data: validated, updatedAt: new Date() })
    .where(and(eq(customObjectRecords.id, id), eq(customObjectRecords.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteRecord(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .update(customObjectRecords)
    .set({ deletedAt: new Date() })
    .where(and(eq(customObjectRecords.id, id), eq(customObjectRecords.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Custom object record');
}

// ─── Relations ───────────────────────────────────────────────────────────────

export async function relateRecord(input: {
  orgId: string;
  recordId: string;
  entityType: 'contact' | 'account' | 'deal' | 'custom';
  entityId: string;
  entityCustomKey?: string;
  role?: string;
}) {
  await getRecord(input.orgId, input.recordId);
  if (input.entityType === 'custom' && !input.entityCustomKey) {
    throw AppError.badRequest('entityCustomKey is required when entityType=custom');
  }
  const [row] = await db.insert(customObjectRelations).values(input).returning();
  return row!;
}

export async function listRelationsForRecord(orgId: string, recordId: string) {
  return db
    .select()
    .from(customObjectRelations)
    .where(
      and(eq(customObjectRelations.orgId, orgId), eq(customObjectRelations.recordId, recordId)),
    )
    .orderBy(desc(customObjectRelations.createdAt));
}

export async function listRelationsForEntity(
  orgId: string,
  entityType: 'contact' | 'account' | 'deal' | 'custom',
  entityId: string,
) {
  return db
    .select()
    .from(customObjectRelations)
    .where(
      and(
        eq(customObjectRelations.orgId, orgId),
        eq(customObjectRelations.entityType, entityType),
        eq(customObjectRelations.entityId, entityId),
      ),
    )
    .orderBy(desc(customObjectRelations.createdAt));
}

export async function unrelateRecord(orgId: string, relationId: string): Promise<void> {
  const [row] = await db
    .delete(customObjectRelations)
    .where(and(eq(customObjectRelations.id, relationId), eq(customObjectRelations.orgId, orgId)))
    .returning();
  if (!row) throw AppError.notFound('Relation');
}
