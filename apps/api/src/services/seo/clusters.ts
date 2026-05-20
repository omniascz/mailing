/**
 * Topic cluster & pillar page management (#287).
 * Organises content into clusters: one pillar page ↔ N spoke pages.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { seoTopicClusters, seoClusterPages } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ── Clusters ──────────────────────────────────────────────────────────────────

export async function listClusters(orgId: string) {
  return db
    .select()
    .from(seoTopicClusters)
    .where(eq(seoTopicClusters.orgId, orgId))
    .orderBy(desc(seoTopicClusters.createdAt));
}

export async function getCluster(orgId: string, clusterId: string) {
  const [row] = await db
    .select()
    .from(seoTopicClusters)
    .where(and(eq(seoTopicClusters.orgId, orgId), eq(seoTopicClusters.id, clusterId)));
  if (!row) throw AppError.notFound('Cluster not found');
  return row;
}

export async function createCluster(
  orgId: string,
  input: {
    name: string;
    description?: string;
    status?: string;
  },
) {
  const [row] = await db
    .insert(seoTopicClusters)
    .values({ orgId, ...input })
    .returning();
  return row;
}

export async function updateCluster(
  orgId: string,
  clusterId: string,
  input: {
    name?: string;
    description?: string;
    status?: string;
  },
) {
  const [row] = await db
    .update(seoTopicClusters)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(seoTopicClusters.orgId, orgId), eq(seoTopicClusters.id, clusterId)))
    .returning();
  if (!row) throw AppError.notFound('Cluster not found');
  return row;
}

export async function deleteCluster(orgId: string, clusterId: string) {
  const [row] = await db
    .delete(seoTopicClusters)
    .where(and(eq(seoTopicClusters.orgId, orgId), eq(seoTopicClusters.id, clusterId)))
    .returning({ id: seoTopicClusters.id });
  if (!row) throw AppError.notFound('Cluster not found');
}

// ── Cluster pages ─────────────────────────────────────────────────────────────

export async function listClusterPages(orgId: string, clusterId: string) {
  return db
    .select()
    .from(seoClusterPages)
    .where(and(eq(seoClusterPages.orgId, orgId), eq(seoClusterPages.clusterId, clusterId)))
    .orderBy(seoClusterPages.pageType, seoClusterPages.createdAt);
}

export async function addClusterPage(
  orgId: string,
  clusterId: string,
  input: {
    pageType?: string;
    title: string;
    url?: string;
    targetKeyword?: string;
    status?: string;
    wordCount?: number;
    notes?: string;
  },
) {
  // Ensure cluster belongs to org
  await getCluster(orgId, clusterId);

  const [row] = await db
    .insert(seoClusterPages)
    .values({ orgId, clusterId, ...input })
    .returning();
  return row;
}

export async function updateClusterPage(
  orgId: string,
  pageId: string,
  input: {
    title?: string;
    url?: string;
    targetKeyword?: string;
    pageType?: string;
    status?: string;
    wordCount?: number;
    notes?: string;
  },
) {
  const [row] = await db
    .update(seoClusterPages)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(seoClusterPages.orgId, orgId), eq(seoClusterPages.id, pageId)))
    .returning();
  if (!row) throw AppError.notFound('Page not found');
  return row;
}

export async function deleteClusterPage(orgId: string, pageId: string) {
  const [row] = await db
    .delete(seoClusterPages)
    .where(and(eq(seoClusterPages.orgId, orgId), eq(seoClusterPages.id, pageId)))
    .returning({ id: seoClusterPages.id });
  if (!row) throw AppError.notFound('Page not found');
}

// ── Cluster overview (pillar + spokes) ───────────────────────────────────────

export async function getClusterWithPages(orgId: string, clusterId: string) {
  const cluster = await getCluster(orgId, clusterId);
  const pages = await listClusterPages(orgId, clusterId);
  const pillar = pages.find((p) => p.pageType === 'pillar') ?? null;
  const spokes = pages.filter((p) => p.pageType === 'spoke');
  return { ...cluster, pillar, spokes, spokeCount: spokes.length };
}
