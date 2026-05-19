/**
 * Migration rollback (Sprint C.9).
 *
 * After a completed (or failed-mid-run) migration the org may discover
 * the imported data wrecks their list quality, accidentally shipped
 * unsubscribed contacts as active, or simply wants to retry against a
 * different source account. Rollback soft-deletes contacts that the
 * named migration job introduced and marks the job 'rolled_back' so
 * the audit trail stays intact.
 *
 * Safety rails:
 *  1. Only jobs in status 'completed' | 'failed' can be rolled back.
 *  2. Rollback window: 24 hours after completedAt. After that, the org
 *     has likely sent campaigns / built segments on top of the imported
 *     contacts and rolling back is destructive surprise. Force flag
 *     overrides for genuine emergencies.
 *  3. Contacts that already received a campaign send (email_events row
 *     of type 'send') are excluded by default. They've been touched —
 *     deleting them would orphan analytics. Override with includeSent.
 *
 * Soft delete semantics:
 *  - contacts.deletedAt set to now() — contact stays for analytics but
 *    is excluded by every batch-sender + segment query (existing isNull
 *    deletedAt filter).
 *  - migration_jobs.status flipped to 'rolled_back', progress.rollback
 *    annotated with deletedCount + timestamp + actor (orgId).
 */

import { and, eq, isNull, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  migrationJobs,
  contacts,
  emailEvents,
  type MigrationProgress,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

const DEFAULT_ROLLBACK_WINDOW_HOURS = 24;

export interface RollbackOptions {
  /** Bypass the 24-hour-since-completion window. */
  force?: boolean;
  /** Include contacts that have a recorded send event. Default: false (skip). */
  includeSent?: boolean;
}

export interface RollbackResult {
  jobId: string;
  candidatesScanned: number;
  contactsDeleted: number;
  contactsSkippedDueToSends: number;
}

export async function rollbackMigration(
  jobId: string,
  orgId: string,
  opts: RollbackOptions = {},
): Promise<RollbackResult> {
  const [job] = await db
    .select()
    .from(migrationJobs)
    .where(eq(migrationJobs.id, jobId))
    .limit(1);

  if (!job || job.orgId !== orgId) {
    throw AppError.notFound('MigrationJob');
  }

  if (job.status !== 'completed' && job.status !== 'failed') {
    throw AppError.badRequest(
      `Cannot rollback job in status "${job.status}". Only completed or failed jobs are eligible.`,
    );
  }

  // Window check (skipped with force flag)
  if (!opts.force && job.completedAt) {
    const ageMs = Date.now() - job.completedAt.getTime();
    const windowMs = DEFAULT_ROLLBACK_WINDOW_HOURS * 3600 * 1000;
    if (ageMs > windowMs) {
      throw AppError.badRequest(
        `Rollback window expired (job completed ${Math.round(ageMs / 3600000)}h ago, max ${DEFAULT_ROLLBACK_WINDOW_HOURS}h). Pass force=true to override.`,
      );
    }
  }

  // Candidate set: contacts authored by this migration. We use the
  // imported_from tag stored on customFields by the connector mappers,
  // narrowed to the job's time window so we don't catch a later
  // re-import from the same platform.
  const candidates = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, orgId),
        isNull(contacts.deletedAt),
        // customFields->>'imported_from' = job.type
        sql`${contacts.customFields}->>'imported_from' = ${job.type}`,
        // contacts.createdAt within the job's run window. completedAt
        // may be null for failed jobs, fall back to now() in that case
        // (the WHERE clause becomes open-ended, scoped only by from).
        sql`${contacts.createdAt} >= ${job.createdAt}`,
        sql`${contacts.createdAt} <= ${job.completedAt ?? new Date()}`,
      ),
    );

  if (candidates.length === 0) {
    // Still flip status so the rollback decision is recorded.
    await markRolledBack(jobId, { deletedCount: 0, skippedDueToSends: 0 });
    return {
      jobId,
      candidatesScanned: 0,
      contactsDeleted: 0,
      contactsSkippedDueToSends: 0,
    };
  }

  const candidateIds = candidates.map((c) => c.id);

  // Exclude contacts that have a 'send' event recorded. Splitting in JS
  // is simpler + portable than a subquery here, and the candidate set is
  // bounded by a single org + migration window so it never grows beyond
  // a few million in the worst case.
  let safeToDelete: string[] = candidateIds;
  let skippedDueToSends = 0;

  if (!opts.includeSent) {
    const touched = await db
      .selectDistinct({ contactId: emailEvents.contactId })
      .from(emailEvents)
      .where(
        and(
          eq(emailEvents.orgId, orgId),
          eq(emailEvents.eventType, 'send'),
          inArray(emailEvents.contactId, candidateIds),
        ),
      );

    const touchedSet = new Set(touched.map((t) => t.contactId));
    safeToDelete = candidateIds.filter((id) => !touchedSet.has(id));
    skippedDueToSends = candidateIds.length - safeToDelete.length;
  }

  if (safeToDelete.length > 0) {
    await db
      .update(contacts)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(contacts.orgId, orgId),
          inArray(contacts.id, safeToDelete),
          isNull(contacts.deletedAt),
        ),
      );
  }

  await markRolledBack(jobId, {
    deletedCount: safeToDelete.length,
    skippedDueToSends,
  });

  return {
    jobId,
    candidatesScanned: candidateIds.length,
    contactsDeleted: safeToDelete.length,
    contactsSkippedDueToSends: skippedDueToSends,
  };
}

async function markRolledBack(
  jobId: string,
  annotation: { deletedCount: number; skippedDueToSends: number },
): Promise<void> {
  const [current] = await db
    .select({ progress: migrationJobs.progress })
    .from(migrationJobs)
    .where(eq(migrationJobs.id, jobId))
    .limit(1);

  const mergedProgress = {
    ...(current?.progress as unknown as Record<string, unknown> ?? {}),
    rollback: {
      at: new Date().toISOString(),
      deletedCount: annotation.deletedCount,
      skippedDueToSends: annotation.skippedDueToSends,
    },
  };

  await db
    .update(migrationJobs)
    .set({
      status: 'rolled_back',
      progress: mergedProgress as unknown as MigrationProgress,
    })
    .where(eq(migrationJobs.id, jobId));
}
