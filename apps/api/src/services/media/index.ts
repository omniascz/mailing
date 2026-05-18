/**
 * Media library (Content Studio) — upload + list + delete assets.
 * Storage backend is pluggable; by default we write to MinIO / S3 through
 * a simple HTTP PUT. Here we only store the URL that was returned by the
 * caller's storage upload (or a local /uploads path in dev).
 */

import { and, eq, desc, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { mediaAssets, type MediaAsset, type NewMediaAsset } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

export async function createMediaAsset(orgId: string, data: Omit<NewMediaAsset, 'id' | 'orgId'>): Promise<MediaAsset> {
  const [row] = await db.insert(mediaAssets).values({ ...data, orgId }).returning();
  return row!;
}

export async function listMediaAssets(orgId: string, opts: { folder?: string; tag?: string } = {}): Promise<MediaAsset[]> {
  const whereParts = [eq(mediaAssets.orgId, orgId), isNull(mediaAssets.deletedAt)];
  if (opts.folder) whereParts.push(eq(mediaAssets.folder, opts.folder));
  let rows = await db
    .select()
    .from(mediaAssets)
    .where(and(...whereParts))
    .orderBy(desc(mediaAssets.createdAt));
  if (opts.tag) rows = rows.filter((r) => (r.tags ?? []).includes(opts.tag!));
  return rows;
}

export async function getMediaAsset(id: string, orgId: string): Promise<MediaAsset> {
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.orgId, orgId), isNull(mediaAssets.deletedAt)))
    .limit(1);
  if (!row) throw AppError.notFound('MediaAsset');
  return row;
}

export async function deleteMediaAsset(id: string, orgId: string): Promise<void> {
  await db.update(mediaAssets)
    .set({ deletedAt: new Date() })
    .where(and(eq(mediaAssets.id, id), eq(mediaAssets.orgId, orgId)));
}

export async function folderStats(orgId: string): Promise<Array<{ folder: string; count: number; totalBytes: number }>> {
  const rows = await db.execute<{ folder: string; count: string; total: string }>(sql`
    SELECT folder, COUNT(*)::text AS count, COALESCE(SUM(size_bytes),0)::text AS total
    FROM media_assets
    WHERE org_id = ${orgId}::uuid AND deleted_at IS NULL
    GROUP BY folder
    ORDER BY folder
  `);
  return (rows as unknown as Array<{ folder: string; count: string; total: string }>).map((r) => ({
    folder: r.folder,
    count: Number(r.count),
    totalBytes: Number(r.total),
  }));
}
