/**
 * Segment membership materialization (#Klaviyo-parity).
 *
 * Reconciles each segment's stored membership (`segment_members`) against the
 * current on-read match, detecting entries/exits to power real-time
 * "entered/exited segment" workflow triggers.
 *
 * First sync of a segment (last_membership_sync_at IS NULL) only baselines the
 * membership — no entered triggers — so existing members don't flood workflows.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { contacts } from '../../db/schema/contacts.js';
import { segments, segmentMembers, type SegmentConditions } from '../../db/schema/segments.js';
import { buildSegmentWhere } from './query-builder.js';
import { onSegmentEntered, onSegmentExited } from '../workflows/triggers.js';

export interface MembershipSyncResult {
  segmentId: string;
  entered: number;
  exited: number;
  baseline: boolean;
}

/** Reconcile one segment's materialized membership; fire entry/exit triggers. */
export async function refreshSegmentMembership(
  orgId: string,
  segmentId: string,
): Promise<MembershipSyncResult> {
  const [segment] = await db
    .select()
    .from(segments)
    .where(and(eq(segments.id, segmentId), eq(segments.orgId, orgId), isNull(segments.deletedAt)))
    .limit(1);
  if (!segment) return { segmentId, entered: 0, exited: 0, baseline: false };

  const isBaseline = segment.lastMembershipSyncAt === null;

  // Current match set (on-read) vs stored membership.
  const where = buildSegmentWhere(segment.conditions as SegmentConditions);
  const current = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt), where));
  const currentIds = new Set(current.map((r) => r.id));

  const stored = await db
    .select({ contactId: segmentMembers.contactId })
    .from(segmentMembers)
    .where(eq(segmentMembers.segmentId, segmentId));
  const storedIds = new Set(stored.map((r) => r.contactId));

  const enteredIds = [...currentIds].filter((id) => !storedIds.has(id));
  const exitedIds = [...storedIds].filter((id) => !currentIds.has(id));

  // Apply membership changes.
  if (enteredIds.length > 0) {
    await db
      .insert(segmentMembers)
      .values(enteredIds.map((contactId) => ({ orgId, segmentId, contactId })))
      .onConflictDoNothing();
  }
  for (const contactId of exitedIds) {
    await db
      .delete(segmentMembers)
      .where(and(eq(segmentMembers.segmentId, segmentId), eq(segmentMembers.contactId, contactId)));
  }

  await db
    .update(segments)
    .set({ lastMembershipSyncAt: new Date() })
    .where(eq(segments.id, segmentId));

  // Fire triggers only after the baseline sync (never on first materialization).
  if (!isBaseline) {
    for (const contactId of enteredIds) {
      onSegmentEntered(orgId, contactId, segmentId).catch(() => {});
    }
    for (const contactId of exitedIds) {
      onSegmentExited(orgId, contactId, segmentId).catch(() => {});
    }
  }

  return { segmentId, entered: enteredIds.length, exited: exitedIds.length, baseline: isBaseline };
}

/** Cron entrypoint — reconcile membership for every active segment. */
export async function refreshAllSegments(): Promise<{
  segments: number;
  entered: number;
  exited: number;
  errors: number;
}> {
  const rows = await db
    .select({ id: segments.id, orgId: segments.orgId })
    .from(segments)
    .where(isNull(segments.deletedAt));

  let entered = 0;
  let exited = 0;
  let errors = 0;
  for (const s of rows) {
    try {
      const r = await refreshSegmentMembership(s.orgId, s.id);
      entered += r.entered;
      exited += r.exited;
    } catch {
      errors++;
    }
  }
  return { segments: rows.length, entered, exited, errors };
}
