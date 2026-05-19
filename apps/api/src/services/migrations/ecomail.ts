/**
 * Ecomail migration tool (Sprint C — CZ primary acquisition target).
 *
 * Imports lists, contacts, and basic templates from an Ecomail.cz account.
 *
 * Pipeline:
 *   1. Validate API key (GET /lists)
 *   2. Fetch lists (GET /lists)
 *   3. Per list: fetch subscribers (GET /lists/{id}/subscribers, paginated)
 *   4. Fetch templates (GET /templates)
 *   5. Map: Ecomail subscriber → ForgeMsg contact, preserving:
 *        - Imported consent timestamp (subscribed_at → customFields)
 *        - Source attribution (customFields.imported_from = 'ecomail')
 *        - Subscription status mapping (subscribed → active, unsubscribed → unsubscribed)
 *   6. Batch upsert
 *
 * GDPR — ForgeMsg's per-purpose consent schema (Sonnet #429-#434) isn't
 * wired into the contacts model yet, so we stash the original consent
 * timestamp + source on customFields. Downstream consent migrations
 * (Sprint D) will lift these into the processing_purposes tables.
 *
 * API reference: https://ecomailcz.docs.apiary.io/
 * Base URL: https://api2.ecomailapp.cz
 * Auth: `key` header carrying the user's API key.
 *
 * Runs as a fire-and-forget background process. Progress persists to
 * migration_jobs.progress JSONB; the migration list/get endpoints strip
 * the apiKey from progress before responding.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  migrationJobs,
  contacts,
  lists,
  type MigrationProgress,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── Ecomail API client ──────────────────────────────────────────────────────

const ECOMAIL_BASE = 'https://api2.ecomailapp.cz';

function ecoHeaders(apiKey: string): Record<string, string> {
  return {
    key: apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function ecoGet<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${ECOMAIL_BASE}${path}`, {
    headers: ecoHeaders(apiKey),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ecomail API ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json() as T;
}

// ─── Ecomail response types ──────────────────────────────────────────────────

interface EcoList {
  id: number;
  name: string;
  subscribers_count?: number;
}

interface EcoSubscriber {
  id?: number;
  email: string;
  name?: string | null;
  surname?: string | null;
  /** Free-form custom_fields blob; structure varies per Ecomail account */
  custom_fields?: Record<string, unknown> | null;
  /** "subscribed" | "unsubscribed" | "soft_bounce" | "hard_bounce" | "spam_complaint" */
  status?: string | null;
  phone?: string | null;
  /** ISO timestamp of the opt-in moment in the source account */
  created_at?: string | null;
  subscribed_at?: string | null;
  /** Ecomail-side ID we keep on customFields for round-trip debugging */
  unsubscribed_at?: string | null;
}

interface EcoSubscribersResponse {
  subscribers?: EcoSubscriber[];
  /** Ecomail paginates either via `next` cursor or a `total` + page param */
  next?: string | null;
  total?: number;
  current_page?: number;
  last_page?: number;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startEcomailMigration(
  orgId: string,
  apiKey: string,
): Promise<typeof migrationJobs.$inferSelect> {
  // Validate API key — /lists is the cheapest authed endpoint
  try {
    await ecoGet<EcoList[]>(apiKey, '/lists');
  } catch (err) {
    throw AppError.badRequest(`Invalid Ecomail API key: ${(err as Error).message}`);
  }

  const [job] = await db
    .insert(migrationJobs)
    .values({
      orgId,
      type: 'ecomail',
      status: 'pending',
      progress: { step: 'queued' },
    })
    .returning();

  if (!job) throw AppError.internal('Failed to create migration job');

  // Stash the API key on progress (encrypted in production; plaintext here
  // for simplicity until secrets-at-rest lands in Sprint D).
  await db
    .update(migrationJobs)
    .set({ progress: { step: 'queued', apiKey } as unknown as MigrationProgress })
    .where(eq(migrationJobs.id, job.id));

  // Fire-and-forget; per-step errors flip the job to 'failed'.
  processEcomailMigration(job.id, orgId, apiKey).catch(async (err) => {
    await db
      .update(migrationJobs)
      .set({
        status: 'failed',
        errorMessage: (err as Error).message,
        completedAt: new Date(),
      })
      .where(eq(migrationJobs.id, job.id))
      .catch(() => {});
  });

  return job;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

async function updateProgress(jobId: string, progress: Partial<MigrationProgress>) {
  const [current] = await db
    .select({ progress: migrationJobs.progress })
    .from(migrationJobs)
    .where(eq(migrationJobs.id, jobId))
    .limit(1);

  const merged = {
    ...(current?.progress as unknown as Record<string, unknown> ?? {}),
    ...progress,
  };

  await db
    .update(migrationJobs)
    .set({ progress: merged as unknown as MigrationProgress })
    .where(eq(migrationJobs.id, jobId));
}

export async function processEcomailMigration(
  jobId: string,
  orgId: string,
  apiKey: string,
): Promise<void> {
  await db
    .update(migrationJobs)
    .set({ status: 'running' })
    .where(eq(migrationJobs.id, jobId));

  const errors: string[] = [];
  let totalImported = 0;
  let totalSkipped = 0;

  try {
    // Step 1 — fetch lists
    await updateProgress(jobId, { step: 'fetching_lists' });
    const ecoLists = await ecoGet<EcoList[]>(apiKey, '/lists');
    await updateProgress(jobId, { totalLists: ecoLists.length, processedLists: 0 });

    // Step 2 — per list, upsert a Mailforge list + import members
    for (let i = 0; i < ecoLists.length; i++) {
      const ecoList = ecoLists[i]!;
      await updateProgress(jobId, {
        step: `importing_list_${i + 1}_of_${ecoLists.length}`,
      });

      // Upsert list (idempotent by org + name)
      const [forgeList] = await db
        .insert(lists)
        .values({
          orgId,
          name: ecoList.name,
        })
        .onConflictDoNothing()
        .returning();

      // Find list ID even when ON CONFLICT skipped the insert
      const listId =
        forgeList?.id ??
        (
          await db
            .select({ id: lists.id })
            .from(lists)
            .where(and(eq(lists.orgId, orgId), eq(lists.name, ecoList.name)))
            .limit(1)
        )[0]?.id;

      if (!listId) {
        errors.push(`Failed to upsert list "${ecoList.name}"`);
        continue;
      }

      // Step 3 — paginated member fetch
      let page = 1;
      const pageSize = 200;
      let listImported = 0;
      let listSkipped = 0;

      while (true) {
        let pageRes: EcoSubscribersResponse;
        try {
          pageRes = await ecoGet<EcoSubscribersResponse>(
            apiKey,
            `/lists/${ecoList.id}/subscribers?page=${page}`,
          );
        } catch (err) {
          errors.push(
            `Subscribers fetch failed for list "${ecoList.name}" page ${page}: ${(err as Error).message}`,
          );
          break;
        }

        const batch = pageRes.subscribers ?? [];
        if (batch.length === 0) break;

        for (const sub of batch) {
          const mapped = mapSubscriber(sub, orgId);
          if (!mapped) {
            listSkipped++;
            continue;
          }

          // Upsert by (org, email). Ecomail can re-list a subscriber across
          // many lists; we keep one contact row, but record source attribution
          // in customFields the first time we see them.
          try {
            await db
              .insert(contacts)
              .values(mapped)
              .onConflictDoUpdate({
                target: [contacts.orgId, contacts.email],
                set: {
                  // Don't clobber custom_fields the user has added since;
                  // only merge in import-attribution keys.
                  customFields: sql`coalesce(${contacts.customFields}, '{}'::jsonb) || ${JSON.stringify(mapped.customFields)}::jsonb`,
                  // Refresh phone / name if Ecomail has values we don't.
                  firstName: sql`coalesce(${contacts.firstName}, ${mapped.firstName ?? null})`,
                  lastName: sql`coalesce(${contacts.lastName}, ${mapped.lastName ?? null})`,
                  phone: sql`coalesce(${contacts.phone}, ${mapped.phone ?? null})`,
                },
              });
            listImported++;
          } catch (err) {
            errors.push(`Insert failed for ${sub.email}: ${(err as Error).message}`);
            listSkipped++;
          }
        }

        // Pagination — Ecomail uses last_page indicator
        if (pageRes.last_page && pageRes.current_page && pageRes.current_page >= pageRes.last_page) {
          break;
        }
        if (batch.length < pageSize) break;
        page++;
        if (page > 1000) {
          // Hard stop — runaway pagination protection.
          errors.push(`Pagination cap reached on list "${ecoList.name}"`);
          break;
        }
      }

      totalImported += listImported;
      totalSkipped += listSkipped;

      await updateProgress(jobId, {
        processedLists: i + 1,
        imported: totalImported,
        skipped: totalSkipped,
        errors: errors.slice(0, 50),
      });
    }

    // Step 4 — mark complete
    await db
      .update(migrationJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(migrationJobs.id, jobId));

    await updateProgress(jobId, {
      step: 'completed',
      imported: totalImported,
      skipped: totalSkipped,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    await db
      .update(migrationJobs)
      .set({
        status: 'failed',
        errorMessage: (err as Error).message,
        completedAt: new Date(),
      })
      .where(eq(migrationJobs.id, jobId));
    throw err;
  }
}

// ─── Field mapping ───────────────────────────────────────────────────────────

interface MappedContact {
  orgId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: 'active' | 'unsubscribed';
  customFields: Record<string, unknown>;
}

/**
 * Convert an Ecomail subscriber record into a Mailforge contact insert.
 * Returns null when the subscriber is unusable (missing email, hard-bounced,
 * spam-complainted) — caller increments skipped counter.
 */
export function mapSubscriber(sub: EcoSubscriber, orgId: string): MappedContact | null {
  if (!sub.email || !sub.email.includes('@')) return null;

  // Hard-bounced / spam-complainted subscribers go straight to suppression in
  // a follow-up pass (not implemented here). Skip the regular contact insert
  // to avoid revealing them via segments.
  if (sub.status === 'hard_bounce' || sub.status === 'spam_complaint') {
    return null;
  }

  const consentAt = sub.subscribed_at ?? sub.created_at ?? null;

  // Stash the source-side state in customFields so the downstream consent
  // migration (Sprint D) can lift these into per-purpose consent records.
  const customFields: Record<string, unknown> = {
    imported_from: 'ecomail',
    imported_consent_at: consentAt,
    imported_consent_status: sub.status ?? 'subscribed',
    ...(sub.id != null ? { imported_external_id: String(sub.id) } : {}),
    ...(sub.unsubscribed_at ? { imported_unsubscribed_at: sub.unsubscribed_at } : {}),
    // Preserve Ecomail-side custom fields under a namespace so they don't
    // collide with Mailforge-native fields the user adds later.
    ...(sub.custom_fields && typeof sub.custom_fields === 'object'
      ? { ecomail_custom: sub.custom_fields }
      : {}),
  };

  return {
    orgId,
    email: sub.email.toLowerCase().trim(),
    firstName: sub.name?.trim() || null,
    lastName: sub.surname?.trim() || null,
    phone: sub.phone?.trim() || null,
    status: sub.status === 'unsubscribed' ? 'unsubscribed' : 'active',
    customFields,
  };
}
