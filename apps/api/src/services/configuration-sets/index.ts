/**
 * Configuration set service — CRUD + resolution + the send-time gate.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  configurationSets,
  DEFAULT_CONFIG_SET_OPTIONS,
  type ConfigurationSet,
  type ConfigurationSetOptions,
  type EventDestination,
} from '../../db/schema/configuration-sets.js';
import { AppError } from '../../lib/app-error.js';

export interface EffectiveSendOptions {
  allowed: boolean;
  blockReason?: string;
  trackingEnabled: boolean;
  tlsPolicy: 'optional' | 'require';
  suppressionEnabled: boolean;
  ipPoolId: string | null;
  /** Webhook destinations that should receive events for this send. */
  webhookDestinations: EventDestination[];
}

/**
 * Pure: derive the effective send options + allow/block decision from a config
 * set row (or null → account defaults). Unit-testable without a DB.
 */
export function resolveEffectiveSendOptions(
  set: Pick<ConfigurationSet, 'sendingEnabled' | 'options'> | null,
): EffectiveSendOptions {
  const opts = set?.options ?? DEFAULT_CONFIG_SET_OPTIONS;
  return {
    allowed: set ? set.sendingEnabled : true,
    blockReason: set && !set.sendingEnabled ? 'configuration set sending is paused' : undefined,
    trackingEnabled: opts.trackingEnabled,
    tlsPolicy: opts.tlsPolicy,
    suppressionEnabled: opts.suppressionEnabled,
    ipPoolId: opts.ipPoolId,
    webhookDestinations: opts.eventDestinations.filter(
      (d) => d.enabled && d.type === 'webhook' && !!d.url,
    ),
  };
}

export async function createConfigurationSet(
  orgId: string,
  input: { name: string; sendingEnabled?: boolean; options?: Partial<ConfigurationSetOptions> },
): Promise<ConfigurationSet> {
  const [row] = await db
    .insert(configurationSets)
    .values({
      orgId,
      name: input.name,
      sendingEnabled: input.sendingEnabled ?? true,
      options: { ...DEFAULT_CONFIG_SET_OPTIONS, ...(input.options ?? {}) },
    })
    .returning();
  return row!;
}

export async function listConfigurationSets(orgId: string): Promise<ConfigurationSet[]> {
  return db
    .select()
    .from(configurationSets)
    .where(eq(configurationSets.orgId, orgId))
    .orderBy(desc(configurationSets.createdAt));
}

export async function getConfigurationSet(orgId: string, id: string): Promise<ConfigurationSet> {
  const [row] = await db
    .select()
    .from(configurationSets)
    .where(and(eq(configurationSets.id, id), eq(configurationSets.orgId, orgId)))
    .limit(1);
  if (!row) throw AppError.notFound('ConfigurationSet');
  return row;
}

/** Resolve a set by NAME (how sends reference it). Returns null if not found. */
export async function resolveConfigurationSet(
  orgId: string,
  name: string,
): Promise<ConfigurationSet | null> {
  const [row] = await db
    .select()
    .from(configurationSets)
    .where(and(eq(configurationSets.orgId, orgId), eq(configurationSets.name, name)))
    .limit(1);
  return row ?? null;
}

export async function updateConfigurationSet(
  orgId: string,
  id: string,
  patch: { sendingEnabled?: boolean; options?: Partial<ConfigurationSetOptions> },
): Promise<ConfigurationSet> {
  const current = await getConfigurationSet(orgId, id);
  const [row] = await db
    .update(configurationSets)
    .set({
      sendingEnabled: patch.sendingEnabled ?? current.sendingEnabled,
      options: patch.options ? { ...current.options, ...patch.options } : current.options,
      updatedAt: new Date(),
    })
    .where(and(eq(configurationSets.id, id), eq(configurationSets.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteConfigurationSet(orgId: string, id: string): Promise<void> {
  const [row] = await db
    .delete(configurationSets)
    .where(and(eq(configurationSets.id, id), eq(configurationSets.orgId, orgId)))
    .returning({ id: configurationSets.id });
  if (!row) throw AppError.notFound('ConfigurationSet');
}

/**
 * Resolve a config set by name and return effective options, throwing 403 if
 * the set's sending is paused. Used by the send path.
 */
export async function applyConfigurationSet(
  orgId: string,
  name: string | undefined,
): Promise<EffectiveSendOptions> {
  if (!name) return resolveEffectiveSendOptions(null);
  const set = await resolveConfigurationSet(orgId, name);
  if (!set) throw AppError.badRequest(`Unknown configuration set: ${name}`);
  const eff = resolveEffectiveSendOptions(set);
  if (!eff.allowed) throw AppError.forbidden(eff.blockReason ?? 'sending paused');
  return eff;
}
