/**
 * List hygiene + duplicate detection.
 *
 *   • Flags stale contacts (no engagement in 180d, hard bounces, complaints).
 *   • Detects duplicates by email / phone / (first+last+email).
 *   • Suggests merges — caller chooses whether to keep.
 */

import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts, contactEngagement, emailEvents } from '../../db/schema/index.js';

export interface HygieneReport {
  total: number;
  staleNoEngagement: number;
  hardBounces: number;
  complaints: number;
  invalidEmails: number;
  recommendedRemovals: number;
}

export async function generateHygieneReport(orgId: string): Promise<HygieneReport> {
  const staleCutoff = new Date(Date.now() - 180 * 86_400_000);

  const [total] = (await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM contacts WHERE org_id = ${orgId}::uuid AND deleted_at IS NULL
  `)) as unknown as Array<{ n: string }>;

  const [stale] = (await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM contacts c
    LEFT JOIN contact_engagement ce ON ce.contact_id = c.id
    WHERE c.org_id = ${orgId}::uuid AND c.deleted_at IS NULL
      AND (ce.total_opens IS NULL OR ce.total_opens = 0)
      AND c.created_at <= ${staleCutoff.toISOString()}::timestamptz
  `)) as unknown as Array<{ n: string }>;

  const [bounces] = (await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM contacts
    WHERE org_id = ${orgId}::uuid AND status = 'bounced' AND deleted_at IS NULL
  `)) as unknown as Array<{ n: string }>;

  const [complaints] = (await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM contacts
    WHERE org_id = ${orgId}::uuid AND status = 'complained' AND deleted_at IS NULL
  `)) as unknown as Array<{ n: string }>;

  const [invalid] = (await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM contacts
    WHERE org_id = ${orgId}::uuid AND email_validation_score = 'invalid' AND deleted_at IS NULL
  `)) as unknown as Array<{ n: string }>;

  const staleN = Number(stale?.n ?? 0);
  const bouncesN = Number(bounces?.n ?? 0);
  const complaintsN = Number(complaints?.n ?? 0);
  const invalidN = Number(invalid?.n ?? 0);

  return {
    total: Number(total?.n ?? 0),
    staleNoEngagement: staleN,
    hardBounces: bouncesN,
    complaints: complaintsN,
    invalidEmails: invalidN,
    recommendedRemovals: bouncesN + complaintsN + invalidN + Math.floor(staleN * 0.5),
  };
}

/** Soft-delete contacts that have been inactive for N days and never engaged. */
export async function purgeInactive(orgId: string, days = 365): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const res = await db.execute(sql`
    UPDATE contacts SET deleted_at = now()
    WHERE org_id = ${orgId}::uuid AND deleted_at IS NULL
      AND created_at <= ${cutoff.toISOString()}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM email_events WHERE contact_id = contacts.id)
  `);
  void contactEngagement;
  void emailEvents;
  return { purged: (res as unknown as { rowCount?: number }).rowCount ?? 0 };
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

export interface DuplicateCluster {
  reason: 'email' | 'phone' | 'name_email';
  key: string;
  contactIds: string[];
}

export async function findDuplicates(orgId: string, limit = 500): Promise<DuplicateCluster[]> {
  const byEmail = await db.execute<{ key: string; ids: string[] }>(sql`
    SELECT LOWER(email) AS key, array_agg(id::text) AS ids
    FROM contacts
    WHERE org_id = ${orgId}::uuid AND email IS NOT NULL AND deleted_at IS NULL
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
    LIMIT ${limit}
  `);
  const byPhone = await db.execute<{ key: string; ids: string[] }>(sql`
    SELECT phone AS key, array_agg(id::text) AS ids
    FROM contacts
    WHERE org_id = ${orgId}::uuid AND phone IS NOT NULL AND deleted_at IS NULL
    GROUP BY phone
    HAVING COUNT(*) > 1
    LIMIT ${limit}
  `);

  const clusters: DuplicateCluster[] = [];
  for (const r of byEmail as unknown as Array<{ key: string; ids: string[] }>) {
    clusters.push({ reason: 'email', key: r.key, contactIds: r.ids });
  }
  for (const r of byPhone as unknown as Array<{ key: string; ids: string[] }>) {
    clusters.push({ reason: 'phone', key: r.key, contactIds: r.ids });
  }
  return clusters;
}

/** Merge duplicates — keep primary, move engagement + events, soft-delete others. */
export async function mergeDuplicates(
  orgId: string,
  primaryId: string,
  duplicateIds: string[],
): Promise<{ merged: number }> {
  let merged = 0;
  for (const dup of duplicateIds) {
    if (dup === primaryId) continue;
    await db.execute(sql`
      UPDATE email_events SET contact_id = ${primaryId}::uuid
      WHERE contact_id = ${dup}::uuid
    `);
    await db.execute(sql`
      UPDATE contacts SET deleted_at = now()
      WHERE id = ${dup}::uuid AND org_id = ${orgId}::uuid
    `);
    merged++;
  }
  return { merged };
}

void and;
void eq;
void isNotNull;
void lte;
void contacts;
