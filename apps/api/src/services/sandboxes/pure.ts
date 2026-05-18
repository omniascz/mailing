/**
 * Sandboxes pure-logic helpers (#342).
 *
 * Extracted so the rules below get unit-tested without spinning up the schema
 * barrel (which the timestamptz() bug breaks at import time).
 */

export const SANDBOX_SLUG_PREFIX = 'sbx';
export const MAX_SEED_CONTACTS = 10_000;
export const SEED_INSERT_CHUNK = 500;

export interface SandboxRecordLike {
  noOpMode: boolean;
}

export interface OrgLike {
  sandboxMode?: 'live' | 'sandbox' | string | null;
  sandboxOfOrgId?: string | null;
}

/** Build the slug for a sandbox sibling org from the parent slug + a timestamp seed. */
export function buildSandboxSlug(parentSlug: string, ts: number): string {
  return `${parentSlug}-${SANDBOX_SLUG_PREFIX}-${ts.toString(36)}`;
}

/** Cap and floor the seedContacts request — UI may pass anything. */
export function clampSeedCount(requested: number | undefined | null): number {
  if (!requested || requested <= 0) return 0;
  return Math.min(Math.floor(requested), MAX_SEED_CONTACTS);
}

/** Produce evenly-sized chunks for the bulk insert (last chunk may be shorter). */
export function chunkRange(total: number, chunkSize = SEED_INSERT_CHUNK): Array<[number, number]> {
  if (total <= 0 || chunkSize <= 0) return [];
  const chunks: Array<[number, number]> = [];
  for (let i = 0; i < total; i += chunkSize) {
    chunks.push([i, Math.min(i + chunkSize, total)]);
  }
  return chunks;
}

/** Synthetic contact for sandbox seeding — uses example.org so a misrouted send can't reach a real mailbox. */
export function syntheticContactEmail(index: number): string {
  return `seed-${index}@example.org`;
}

/** Decide whether a parent org is allowed to spawn a sandbox. Sandboxes can't recurse. */
export function canParentSpawnSandbox(parent: OrgLike): { ok: true } | { ok: false; reason: string } {
  if (parent.sandboxMode === 'sandbox') {
    return { ok: false, reason: 'Cannot create a sandbox of a sandbox' };
  }
  return { ok: true };
}

/** Pure boolean for the sending pipeline guardrail. */
export function shouldNoOpSend(org: OrgLike, sandboxRecord: SandboxRecordLike | null): boolean {
  if (!org || org.sandboxMode !== 'sandbox' || !org.sandboxOfOrgId) return false;
  return Boolean(sandboxRecord?.noOpMode);
}
