/**
 * Shared assets service (#276).
 *
 * Parent orgs can share templates and saved blocks to all child orgs (read-only).
 * Children see parent's shared assets alongside their own but cannot modify them.
 *
 * Sharing flag: organizations.shared_assets_enabled (column added in migration 0043)
 * Lookup: find parent via organizations.parent_org_id, then pull assets with that orgId.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { savedBlocks, brandKits } from '../../db/schema/editor.js';
import { templates } from '../../db/schema/templates.js';

// ─── Resolve parent org ───────────────────────────────────────────────────────

export async function getParentOrgId(orgId: string): Promise<string | null> {
  const rows = await db.execute<{ parent_org_id: string | null }>(
    sql`SELECT parent_org_id FROM organizations WHERE id = ${orgId} LIMIT 1`,
  );
  return rows[0]?.parent_org_id ?? null;
}

// ─── Shared saved blocks ──────────────────────────────────────────────────────

export async function listSavedBlocksWithShared(
  orgId: string,
  category?: string,
) {
  const parentOrgId = await getParentOrgId(orgId);

  const ownRows = await db.select().from(savedBlocks)
    .where(and(
      eq(savedBlocks.orgId, orgId),
      category ? eq(savedBlocks.category, category) : undefined,
    ));

  if (!parentOrgId) return ownRows.map(r => ({ ...r, isShared: false }));

  const parentRows = await db.select().from(savedBlocks)
    .where(and(
      eq(savedBlocks.orgId, parentOrgId),
      category ? eq(savedBlocks.category, category) : undefined,
    ));

  return [
    ...ownRows.map(r => ({ ...r, isShared: false })),
    ...parentRows.map(r => ({ ...r, isShared: true })),
  ];
}

// ─── Shared templates ─────────────────────────────────────────────────────────

export async function listTemplatesWithShared(
  orgId: string,
  category?: string,
) {
  const parentOrgId = await getParentOrgId(orgId);

  const ownRows = await db.select().from(templates)
    .where(and(
      eq(templates.orgId, orgId),
      category ? eq(templates.category, category as never) : undefined,
      sql`${templates.deletedAt} IS NULL`,
    ));

  if (!parentOrgId) return ownRows.map(r => ({ ...r, isShared: false }));

  const parentRows = await db.select().from(templates)
    .where(and(
      eq(templates.orgId, parentOrgId),
      category ? eq(templates.category, category as never) : undefined,
      sql`${templates.deletedAt} IS NULL`,
    ));

  return [
    ...ownRows.map(r => ({ ...r, isShared: false })),
    ...parentRows.map(r => ({ ...r, isShared: true })),
  ];
}

// ─── Shared brand kit (parent fallback) ──────────────────────────────────────

export async function getEffectiveBrandKit(orgId: string) {
  // Try own brand kit first
  const [own] = await db.select().from(brandKits).where(eq(brandKits.orgId, orgId)).limit(1);
  if (own) return { ...own, isShared: false };

  // Fall back to parent's brand kit
  const parentOrgId = await getParentOrgId(orgId);
  if (!parentOrgId) return null;

  const [parent] = await db.select().from(brandKits).where(eq(brandKits.orgId, parentOrgId)).limit(1);
  return parent ? { ...parent, isShared: true } : null;
}
