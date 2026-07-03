/**
 * Template version history — snapshot on update + list + restore.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { templates, templateVersions, type Template } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

/** Snapshot fields carried in each version. */
type Snapshotable = Pick<Template, 'name' | 'subject' | 'preheader' | 'blocks' | 'globalStyles'>;

/**
 * Write a snapshot of a template's current content as the next version number.
 * Idempotent-safe under the unique (template_id, version) index — a concurrent
 * writer that grabbed the same number will conflict and can retry.
 */
export async function snapshotTemplateVersion(
  orgId: string,
  templateId: string,
  snapshot: Snapshotable,
  userId?: string | null,
): Promise<number> {
  const rows = await db
    .select({ next: sql<number>`coalesce(max(${templateVersions.version}), 0) + 1` })
    .from(templateVersions)
    .where(eq(templateVersions.templateId, templateId));
  const version = rows[0]?.next ?? 1;

  await db.insert(templateVersions).values({
    orgId,
    templateId,
    version,
    name: snapshot.name,
    subject: snapshot.subject,
    preheader: snapshot.preheader,
    blocks: snapshot.blocks,
    globalStyles: snapshot.globalStyles,
    createdBy: userId ?? null,
  });
  return version;
}

/** List a template's version history, newest first. */
export async function listTemplateVersions(orgId: string, templateId: string) {
  return db
    .select()
    .from(templateVersions)
    .where(and(eq(templateVersions.orgId, orgId), eq(templateVersions.templateId, templateId)))
    .orderBy(desc(templateVersions.version));
}

/**
 * Restore a template to a prior version. The current content is snapshotted
 * first (so restore is itself undoable), then the version's content is written
 * back onto the live template.
 */
export async function restoreTemplateVersion(
  orgId: string,
  templateId: string,
  versionId: string,
  userId?: string | null,
): Promise<Template> {
  const [target] = await db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.id, versionId),
        eq(templateVersions.templateId, templateId),
        eq(templateVersions.orgId, orgId),
      ),
    )
    .limit(1);
  if (!target) throw AppError.notFound('Template version');

  const [current] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.orgId, orgId)))
    .limit(1);
  if (!current) throw AppError.notFound('Template');

  // Snapshot the live state before overwriting so the restore is reversible.
  await snapshotTemplateVersion(orgId, templateId, current, userId);

  const [row] = await db
    .update(templates)
    .set({
      name: target.name ?? current.name,
      subject: target.subject,
      preheader: target.preheader,
      blocks: target.blocks,
      globalStyles: target.globalStyles,
      updatedAt: new Date(),
    })
    .where(and(eq(templates.id, templateId), eq(templates.orgId, orgId)))
    .returning();
  return row!;
}
