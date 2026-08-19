/**
 * Anonymous → known identity merge.
 * Web tracking creates anonymous_profiles keyed by visitor_id; once the visitor
 * authenticates or fills a form, all associated email_events / revenue_events
 * get backfilled with the resolved contact_id.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { anonymousProfiles, type AnonymousProfile } from '../../db/schema/index.js';

export async function trackVisitor(
  orgId: string,
  input: {
    visitorId: string;
    deviceId?: string;
    properties?: Record<string, unknown>;
  },
): Promise<AnonymousProfile> {
  const [existing] = await db
    .select()
    .from(anonymousProfiles)
    .where(
      and(eq(anonymousProfiles.orgId, orgId), eq(anonymousProfiles.visitorId, input.visitorId)),
    )
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(anonymousProfiles)
      .set({
        lastSeenAt: new Date(),
        deviceId: input.deviceId ?? existing.deviceId,
        properties: {
          ...(existing.properties as Record<string, unknown>),
          ...(input.properties ?? {}),
        },
      })
      .where(eq(anonymousProfiles.id, existing.id))
      .returning();
    return row!;
  }
  const [row] = await db
    .insert(anonymousProfiles)
    .values({
      orgId,
      visitorId: input.visitorId,
      deviceId: input.deviceId ?? null,
      properties: input.properties ?? {},
    })
    .returning();
  return row!;
}

export interface MergeResult {
  visitorId: string;
  contactId: string;
  siteEventsUpdated: number;
}

/**
 * Backfill a known contactId onto every event previously tagged with the visitorId.
 * Idempotent: re-running with the same visitor ⇒ contact pair is a no-op.
 *
 * `site_events` is the anonymous stream — it is the only event table keyed by
 * `visitor_id`. `email_events` and `revenue_events` have no such column and
 * never had one: they are written with a contact_id already resolved, so there
 * is nothing on them to backfill.
 */
export async function mergeVisitorIntoContact(
  orgId: string,
  input: {
    visitorId: string;
    contactId: string;
  },
): Promise<MergeResult> {
  await db
    .update(anonymousProfiles)
    .set({ mergedInto: input.contactId, mergedAt: new Date() })
    .where(
      and(eq(anonymousProfiles.orgId, orgId), eq(anonymousProfiles.visitorId, input.visitorId)),
    );

  // No .catch() here on purpose: a merge that cannot run must surface as a
  // failed request, not as a 200 reporting zero rows. Swallowing it is how this
  // stayed broken — the query never ran and the caller was told "0 updated".
  const site = await db.execute<{ updated: string }>(sql`
    WITH upd AS (
      UPDATE site_events SET contact_id = ${input.contactId}::uuid
      WHERE org_id = ${orgId}::uuid AND visitor_id = ${input.visitorId} AND contact_id IS NULL
      RETURNING 1
    )
    SELECT COUNT(*)::text AS updated FROM upd
  `);

  const siteN = Number((site as unknown as Array<{ updated: string }>)[0]?.updated ?? 0);
  return {
    visitorId: input.visitorId,
    contactId: input.contactId,
    siteEventsUpdated: siteN,
  };
}

export async function listUnmerged(orgId: string, limit = 100): Promise<AnonymousProfile[]> {
  return db
    .select()
    .from(anonymousProfiles)
    .where(and(eq(anonymousProfiles.orgId, orgId), isNull(anonymousProfiles.mergedInto)))
    .limit(limit);
}
