/**
 * Sandboxes service (#342).
 *
 * Provision a sibling organization flagged as a sandbox of the parent. Copies
 * opt-in assets (templates / brand kit / workflows), seeds synthetic contacts
 * and flips `sandbox_mode = 'sandbox'` so the sending pipeline can short-
 * circuit external traffic.
 *
 * Key guardrails:
 *   - `noOpMode` (default true) — outbound messages are accepted and logged
 *     but never dispatched. Called by the sending pipeline via
 *     `isSandboxNoOp(orgId)` before any provider call.
 *   - Sandboxes are their own orgs — all data is isolated by orgId. Deleting a
 *     sandbox cascades through existing org-scoped FKs.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { organizations } from '../../db/schema/organizations.js';
import { orgSandboxes, type OrgSandbox } from '../../db/schema/sandboxes.js';
import { templates } from '../../db/schema/templates.js';
import { brandKits, savedBlocks } from '../../db/schema/editor.js';
import { workflows } from '../../db/schema/workflows.js';
import { contacts } from '../../db/schema/contacts.js';
import { AppError } from '../../lib/app-error.js';

export interface CreateSandboxInput {
  name: string;
  purpose?: 'dev' | 'staging' | 'training' | 'demo';
  noOpMode?: boolean;
  expiresAt?: Date | null;
  createdBy?: string;
  seedConfig?: {
    seedContacts?: number;
    copyTemplates?: boolean;
    copyWorkflows?: boolean;
    copyBrandKit?: boolean;
    copySavedBlocks?: boolean;
  };
}

export async function createSandbox(
  parentOrgId: string,
  input: CreateSandboxInput,
): Promise<OrgSandbox> {
  const [parent] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, parentOrgId))
    .limit(1);
  if (!parent) throw AppError.notFound('Parent organization not found');
  if (parent.sandboxMode === 'sandbox') {
    throw AppError.badRequest('Cannot create a sandbox of a sandbox');
  }

  // 1. Create the sibling org, flagged as a sandbox of the parent.
  const sandboxSlug = `${parent.slug}-sbx-${Date.now().toString(36)}`;
  const [sandboxOrg] = await db
    .insert(organizations)
    .values({
      name: `${parent.name} · ${input.name}`,
      slug: sandboxSlug,
      plan: parent.plan,
      dataRegion: parent.dataRegion,
      sandboxOfOrgId: parent.id,
      sandboxMode: 'sandbox',
    })
    .returning();
  if (!sandboxOrg) throw AppError.internal('Failed to create sandbox organization');

  try {
    const seed = input.seedConfig ?? {};

    // 2. Copy opt-in assets. Each COPY is a simple select-then-insert; we do
    //    not replicate referential graphs (e.g. workflow steps across tables)
    //    — that's a future enhancement.
    if (seed.copyTemplates) {
      const rows = await db.select().from(templates).where(eq(templates.orgId, parent.id));
      if (rows.length > 0) {
        await db.insert(templates).values(
          rows.map((r) => ({
            orgId: sandboxOrg.id,
            name: r.name,
            description: r.description,
            category: r.category,
            thumbnailUrl: r.thumbnailUrl,
            subject: r.subject,
            preheader: r.preheader,
            blocks: r.blocks,
            globalStyles: r.globalStyles,
            isPublic: r.isPublic,
            tags: r.tags,
            locale: r.locale,
          })),
        );
      }
    }

    if (seed.copySavedBlocks) {
      const rows = await db.select().from(savedBlocks).where(eq(savedBlocks.orgId, parent.id));
      if (rows.length > 0) {
        await db.insert(savedBlocks).values(
          rows.map((r) => ({
            orgId: sandboxOrg.id,
            name: r.name,
            category: r.category,
            blockData: r.blockData,
            thumbnailUrl: r.thumbnailUrl,
            locale: r.locale,
          })),
        );
      }
    }

    if (seed.copyWorkflows) {
      const rows = await db.select().from(workflows).where(eq(workflows.orgId, parent.id));
      if (rows.length > 0) {
        await db.insert(workflows).values(
          rows.map((r) => ({
            orgId: sandboxOrg.id,
            name: r.name,
            description: r.description,
            status: 'draft' as const,
            triggerType: r.triggerType,
            triggerConfig: r.triggerConfig,
            nodes: r.nodes,
            edges: r.edges,
          })),
        );
      }
    }

    if (seed.copyBrandKit) {
      const [kit] = await db
        .select()
        .from(brandKits)
        .where(eq(brandKits.orgId, parent.id))
        .limit(1);
      if (kit) {
        await db.insert(brandKits).values({
          orgId: sandboxOrg.id,
          logoUrl: kit.logoUrl,
          primaryColor: kit.primaryColor,
          secondaryColor: kit.secondaryColor,
          accentColor: kit.accentColor,
          fontHeading: kit.fontHeading,
          fontBody: kit.fontBody,
          footerText: kit.footerText,
        });
      }
    }

    // 3. Seed synthetic contacts. Uses example.org to avoid real delivery.
    const seedCount = seed.seedContacts ?? 0;
    if (seedCount > 0) {
      const toInsert = Array.from({ length: Math.min(seedCount, 10_000) }, (_, i) => ({
        orgId: sandboxOrg.id,
        email: `seed-${i}@example.org`,
        firstName: `Seed${i}`,
        lastName: 'Contact',
        status: 'active' as const,
        source: 'sandbox_seed',
      }));
      // Chunk to avoid oversize statements.
      for (let i = 0; i < toInsert.length; i += 500) {
        await db.insert(contacts).values(toInsert.slice(i, i + 500));
      }
    }

    // 4. Persist sandbox record.
    const [record] = await db
      .insert(orgSandboxes)
      .values({
        orgId: parent.id,
        sandboxOrgId: sandboxOrg.id,
        name: input.name,
        purpose: input.purpose ?? 'dev',
        status: 'ready',
        seedConfig: seed,
        noOpMode: input.noOpMode ?? true,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt ?? null,
      })
      .returning();
    if (!record) throw AppError.internal('Failed to persist sandbox record');
    return record;
  } catch (err) {
    // Rollback-ish: mark the sandbox org deleted (FK cascades will clean up).
    await db
      .update(organizations)
      .set({ deletedAt: new Date() })
      .where(eq(organizations.id, sandboxOrg.id));
    throw err;
  }
}

export async function listSandboxes(parentOrgId: string): Promise<OrgSandbox[]> {
  return db.select().from(orgSandboxes).where(eq(orgSandboxes.orgId, parentOrgId));
}

export async function getSandbox(parentOrgId: string, sandboxId: string): Promise<OrgSandbox> {
  const [row] = await db
    .select()
    .from(orgSandboxes)
    .where(and(eq(orgSandboxes.id, sandboxId), eq(orgSandboxes.orgId, parentOrgId)))
    .limit(1);
  if (!row) throw AppError.notFound('Sandbox not found');
  return row;
}

export async function deleteSandbox(parentOrgId: string, sandboxId: string): Promise<void> {
  const row = await getSandbox(parentOrgId, sandboxId);
  await db
    .update(organizations)
    .set({ deletedAt: new Date() })
    .where(eq(organizations.id, row.sandboxOrgId));
  await db
    .update(orgSandboxes)
    .set({ status: 'archived', deletedAt: new Date() })
    .where(eq(orgSandboxes.id, row.id));
}

export async function setNoOpMode(
  parentOrgId: string,
  sandboxId: string,
  noOpMode: boolean,
): Promise<void> {
  const row = await getSandbox(parentOrgId, sandboxId);
  await db.update(orgSandboxes).set({ noOpMode }).where(eq(orgSandboxes.id, row.id));
}

/**
 * Sending-pipeline guardrail. Callers consult this before any outbound
 * provider call in a sandbox org and short-circuit to a synthetic "delivered"
 * event if it returns true.
 */
export async function isSandboxNoOp(orgId: string): Promise<boolean> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org || org.sandboxMode !== 'sandbox' || !org.sandboxOfOrgId) return false;
  const [sbx] = await db
    .select()
    .from(orgSandboxes)
    .where(eq(orgSandboxes.sandboxOrgId, orgId))
    .limit(1);
  return Boolean(sbx?.noOpMode);
}
