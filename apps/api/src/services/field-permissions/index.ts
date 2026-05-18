/**
 * Field-level permissions service (#344).
 *
 * Resolves a rule for (org, role, entity) and exposes two surface helpers
 * used by routes / services:
 *   - `filterReadable(entity, obj, role)` → copy of obj with hidden fields
 *     stripped.
 *   - `assertWritable(entity, patch, role)` → throws if the request body
 *     tries to write fields the role can't.
 *
 * Cached per (orgId, role, entity) for 60s in Redis. Inline updates flush
 * the cache.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { fieldPermissions, type FieldPermission } from '../../db/schema/field-permissions.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/app-error.js';

const TTL = 60;

function cacheKey(orgId: string, role: string, entity: string): string {
  return `fperm:${orgId}:${role}:${entity}`;
}

async function loadRule(
  orgId: string,
  role: string,
  entity: string,
): Promise<FieldPermission | null> {
  const key = cacheKey(orgId, role, entity);
  const cached = await redis.get(key);
  if (cached) {
    if (cached === 'null') return null;
    return JSON.parse(cached) as FieldPermission;
  }
  const [row] = await db.select().from(fieldPermissions).where(and(
    eq(fieldPermissions.orgId, orgId),
    eq(fieldPermissions.role, role),
    eq(fieldPermissions.entity, entity),
  )).limit(1);
  await redis.set(key, row ? JSON.stringify(row) : 'null', 'EX', TTL);
  return row ?? null;
}

export async function filterReadable<T extends Record<string, unknown>>(
  orgId: string,
  role: string,
  entity: string,
  obj: T,
): Promise<Partial<T>> {
  const rule = await loadRule(orgId, role, entity);
  if (!rule) return obj;

  const readableAll = rule.readable.includes('*');
  const hidden = new Set(rule.hidden);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (hidden.has(k)) continue;
    if (readableAll || rule.readable.includes(k)) out[k] = v;
  }
  return out as Partial<T>;
}

export async function filterReadableMany<T extends Record<string, unknown>>(
  orgId: string,
  role: string,
  entity: string,
  rows: T[],
): Promise<Partial<T>[]> {
  if (rows.length === 0) return [];
  const rule = await loadRule(orgId, role, entity);
  if (!rule) return rows;

  const readableAll = rule.readable.includes('*');
  const hidden = new Set(rule.hidden);
  return rows.map((obj) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (hidden.has(k)) continue;
      if (readableAll || rule.readable.includes(k)) out[k] = v;
    }
    return out as Partial<T>;
  });
}

export async function assertWritable(
  orgId: string,
  role: string,
  entity: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const rule = await loadRule(orgId, role, entity);
  if (!rule) return;
  const writableAll = rule.writable.includes('*');
  if (writableAll) return;
  const allowed = new Set(rule.writable);
  for (const k of Object.keys(patch)) {
    if (!allowed.has(k)) {
      throw AppError.forbidden(`Role ${role} cannot write field "${k}" on ${entity}`);
    }
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export interface UpsertInput {
  role: string;
  entity: string;
  readable?: string[];
  hidden?: string[];
  writable?: string[];
}

export async function upsertRule(orgId: string, input: UpsertInput): Promise<FieldPermission> {
  const [existing] = await db.select().from(fieldPermissions).where(and(
    eq(fieldPermissions.orgId, orgId),
    eq(fieldPermissions.role, input.role),
    eq(fieldPermissions.entity, input.entity),
  )).limit(1);

  let row: FieldPermission | undefined;
  if (existing) {
    const [u] = await db.update(fieldPermissions).set({
      readable: input.readable ?? existing.readable,
      hidden: input.hidden ?? existing.hidden,
      writable: input.writable ?? existing.writable,
      updatedAt: new Date(),
    }).where(eq(fieldPermissions.id, existing.id)).returning();
    row = u;
  } else {
    const [i] = await db.insert(fieldPermissions).values({
      orgId,
      role: input.role,
      entity: input.entity,
      readable: input.readable ?? ['*'],
      hidden: input.hidden ?? [],
      writable: input.writable ?? ['*'],
    }).returning();
    row = i;
  }
  if (!row) throw AppError.internal('Failed to upsert field permission');
  await redis.del(cacheKey(orgId, input.role, input.entity));
  return row;
}

export async function listRules(orgId: string): Promise<FieldPermission[]> {
  return db.select().from(fieldPermissions).where(eq(fieldPermissions.orgId, orgId));
}

export async function deleteRule(orgId: string, id: string): Promise<void> {
  const [row] = await db.select().from(fieldPermissions).where(and(
    eq(fieldPermissions.orgId, orgId),
    eq(fieldPermissions.id, id),
  )).limit(1);
  if (!row) return;
  await db.delete(fieldPermissions).where(eq(fieldPermissions.id, id));
  await redis.del(cacheKey(orgId, row.role, row.entity));
}
