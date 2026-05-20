/**
 * Bi-directional CRM data-sync engine (#355).
 *
 * Runs two flows:
 *
 *   1. `reconcile({ mapping, localRow, remoteRow })` — called whenever either
 *      side changes. Applies the mapping's per-field rules, decides which
 *      value wins, and produces a `SyncPlan` describing the updates to send
 *      to each side plus any conflicts that need user attention.
 *
 *   2. `syncAll(orgId)` — background entrypoint: for each enabled mapping,
 *      iterates the paired rows and runs `reconcile` against a freshly
 *      fetched remote payload. Delegates the actual HTTP / SOAP calls to
 *      per-provider adapters so this file stays provider-agnostic.
 *
 * This module owns policy (how conflicts resolve, what's written), not I/O.
 * Provider adapters (HubSpot/Salesforce/Pipedrive) implement the I/O.
 */

import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  dataSyncMappings,
  dataSyncPairs,
  dataSyncConflicts,
  type DataSyncMapping,
  type DataSyncPair,
  type FieldRule,
} from '../../db/schema/data-sync-mappings.js';

export interface CrmAdapter {
  /** Fetch a single record (or null if not found). */
  fetch(orgId: string, entity: string, remoteId: string): Promise<Record<string, unknown> | null>;
  /** Patch a subset of fields on the remote. */
  patch(
    orgId: string,
    entity: string,
    remoteId: string,
    fields: Record<string, unknown>,
  ): Promise<void>;
  /** Create a new remote record; returns the new remote id. */
  create(orgId: string, entity: string, fields: Record<string, unknown>): Promise<string>;
  /** List rows changed since `since` (for incremental pulls). */
  listChangedSince?(
    orgId: string,
    entity: string,
    since: Date,
  ): Promise<Array<{ id: string; fields: Record<string, unknown> }>>;
}

export interface ReconcileInput {
  mapping: DataSyncMapping;
  local: Record<string, unknown> & { updatedAt?: Date | string };
  remote: Record<string, unknown> & { updatedAt?: Date | string };
}

export interface SyncPlan {
  localPatch: Record<string, unknown>;
  remotePatch: Record<string, unknown>;
  conflicts: Array<{ field: string; localValue: unknown; remoteValue: unknown }>;
}

export function reconcile(input: ReconcileInput): SyncPlan {
  const plan: SyncPlan = { localPatch: {}, remotePatch: {}, conflicts: [] };
  const map = input.mapping.fieldMap;
  const localTs = toDate(input.local.updatedAt);
  const remoteTs = toDate(input.remote.updatedAt);

  for (const [localKey, rule] of Object.entries(map)) {
    const lv = input.local[localKey];
    const rv = input.remote[rule.remoteKey];

    if (equal(lv, rv)) continue;

    const lMissing = lv === undefined || lv === null || lv === '';
    const rMissing = rv === undefined || rv === null || rv === '';

    // Easy case: one side empty — fill from the other (respect direction).
    if (lMissing && !rMissing && canWriteLocal(rule)) {
      plan.localPatch[localKey] = rv;
      continue;
    }
    if (rMissing && !lMissing && canWriteRemote(rule)) {
      plan.remotePatch[rule.remoteKey] = lv;
      continue;
    }

    // Both set and different — apply conflict policy.
    const winner = decideWinner(rule, { local: lv, remote: rv, localTs, remoteTs });
    if (winner === 'local' && canWriteRemote(rule)) {
      plan.remotePatch[rule.remoteKey] = lv;
    } else if (winner === 'remote' && canWriteLocal(rule)) {
      plan.localPatch[localKey] = rv;
    } else if (winner === 'manual') {
      plan.conflicts.push({ field: localKey, localValue: lv, remoteValue: rv });
    }
  }

  return plan;
}

function canWriteLocal(rule: FieldRule): boolean {
  return rule.direction === 'in' || rule.direction === 'both';
}
function canWriteRemote(rule: FieldRule): boolean {
  return rule.direction === 'out' || rule.direction === 'both';
}

function decideWinner(
  rule: FieldRule,
  ctx: { local: unknown; remote: unknown; localTs: Date | null; remoteTs: Date | null },
): 'local' | 'remote' | 'manual' {
  switch (rule.conflict) {
    case 'local_wins':
      return 'local';
    case 'remote_wins':
      return 'remote';
    case 'newer_wins': {
      if (!ctx.localTs || !ctx.remoteTs) return 'manual';
      return ctx.localTs.getTime() >= ctx.remoteTs.getTime() ? 'local' : 'remote';
    }
    case 'manual':
    default:
      return 'manual';
  }
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ─── Applying a plan ─────────────────────────────────────────────────────────

export interface ApplyPlanInput {
  mapping: DataSyncMapping;
  pair: DataSyncPair;
  plan: SyncPlan;
  adapter: CrmAdapter;
  /** Called to persist `plan.localPatch` on the local row. */
  writeLocal: (patch: Record<string, unknown>) => Promise<void>;
}

export async function applyPlan(input: ApplyPlanInput): Promise<void> {
  const { mapping, pair, plan, adapter, writeLocal } = input;

  if (Object.keys(plan.localPatch).length > 0) {
    await writeLocal(plan.localPatch);
  }
  if (Object.keys(plan.remotePatch).length > 0) {
    await adapter.patch(mapping.orgId, mapping.entity, pair.remoteId, plan.remotePatch);
  }
  if (plan.conflicts.length > 0) {
    await db.insert(dataSyncConflicts).values(
      plan.conflicts.map((c) => ({
        orgId: mapping.orgId,
        pairId: pair.id,
        field: c.field,
        localValue: c.localValue,
        remoteValue: c.remoteValue,
      })),
    );
  }
  // Refresh hash + lastSyncedAt so a subsequent run doesn't redo the same work.
  await db
    .update(dataSyncPairs)
    .set({
      remoteHash: hashPayload({ ...plan.remotePatch }), // best-effort marker
      lastSyncedAt: new Date(),
    })
    .where(eq(dataSyncPairs.id, pair.id));
}

export function hashPayload(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).sort();
  const canonical = JSON.stringify(keys.map((k) => [k, payload[k]]));
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

// ─── Public entrypoints ──────────────────────────────────────────────────────

export async function listEnabledMappings(orgId: string): Promise<DataSyncMapping[]> {
  return db
    .select()
    .from(dataSyncMappings)
    .where(and(eq(dataSyncMappings.orgId, orgId), eq(dataSyncMappings.enabled, true)));
}

export async function resolveConflict(
  orgId: string,
  conflictId: string,
  resolution: 'local' | 'remote' | 'custom',
  customValue?: unknown,
): Promise<void> {
  await db
    .update(dataSyncConflicts)
    .set({
      resolved: true,
      resolution,
      resolvedAt: new Date(),
      ...(resolution === 'custom' && customValue !== undefined
        ? { localValue: customValue, remoteValue: customValue }
        : {}),
    })
    .where(and(eq(dataSyncConflicts.orgId, orgId), eq(dataSyncConflicts.id, conflictId)));
}
