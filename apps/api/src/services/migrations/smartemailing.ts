/**
 * SmartEmailing migration tool (Sprint C — second CZ source).
 *
 * Imports contact lists and subscribers from a SmartEmailing.cz v3 account.
 *
 * Pipeline:
 *   1. Validate credentials (GET /ping)
 *   2. Fetch contact lists (GET /contactlists)
 *   3. Per list: paginated subscriber fetch (GET /contactlist-contacts)
 *   4. Map subscriber → ForgeMsg contact, preserving:
 *        - Imported consent timestamp (created → customFields)
 *        - GDPR consent_source/note/ip preserved if present
 *        - Source attribution (imported_from = 'smartemailing')
 *   5. Batch upsert with ON CONFLICT merge of customFields
 *
 * API reference: https://app.smartemailing.cz/docs/api/v3/
 * Base URL: https://app.smartemailing.cz/api/v3
 * Auth: HTTP Basic — username (account login) + apiKey (token).
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

// ─── SmartEmailing API client ────────────────────────────────────────────────

const SE_BASE = 'https://app.smartemailing.cz/api/v3';

function seHeaders(username: string, apiKey: string): Record<string, string> {
  const basic = Buffer.from(`${username}:${apiKey}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function seGet<T>(username: string, apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${SE_BASE}${path}`, {
    headers: seHeaders(username, apiKey),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SmartEmailing API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as T;
}

// ─── SmartEmailing response types ────────────────────────────────────────────

interface SePing {
  status: string;
}

interface SeContactList {
  id: number;
  name: string;
  description?: string | null;
}

interface SeContactListsResponse {
  data?: SeContactList[];
}

/**
 * SmartEmailing v3 returns a per-contact list-membership envelope; each
 * record is a 3-tuple {contact, status, settings}. Status is the per-list
 * subscription state, not the contact-wide one.
 */
interface SeContactListContact {
  contact: {
    id: number;
    emailaddress: string;
    name?: string | null;
    surname?: string | null;
    cellphone?: string | null;
    /** ISO 8601 timestamp when the contact was created in SmartEmailing */
    created?: string | null;
    /** ISO timestamp of last modification */
    updated?: string | null;
    /** Optional GDPR audit columns surfaced by SmartEmailing's consent module */
    gdpr?: {
      consent_source?: string | null;
      consent_at?: string | null;
      consent_ip?: string | null;
      consent_note?: string | null;
    } | null;
    customfields_values?: Array<{ id: number; value: string; name?: string | null }> | null;
  };
  /** "confirmed" | "subscribed" | "unsubscribed" | "bounce" | "spam_complaint" */
  status: string;
  /** ISO timestamp of the subscription state change (=consent in our model) */
  updated?: string | null;
}

interface SeContactListContactsResponse {
  data?: SeContactListContact[];
  meta?: {
    page_count?: number;
    current_page?: number;
    total_count?: number;
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startSmartEmailingMigration(
  orgId: string,
  username: string,
  apiKey: string,
): Promise<typeof migrationJobs.$inferSelect> {
  // Validate creds — /ping is the cheapest authed endpoint
  try {
    await seGet<SePing>(username, apiKey, '/ping');
  } catch (err) {
    throw AppError.badRequest(
      `Invalid SmartEmailing credentials: ${(err as Error).message}`,
    );
  }

  const [job] = await db
    .insert(migrationJobs)
    .values({
      orgId,
      type: 'smartemailing',
      status: 'pending',
      progress: { step: 'queued' },
    })
    .returning();

  if (!job) throw AppError.internal('Failed to create migration job');

  // Stash credentials on progress for the background runner (plaintext for
  // now; lifted into secrets-at-rest in Sprint D).
  await db
    .update(migrationJobs)
    .set({
      progress: { step: 'queued', username, apiKey } as unknown as MigrationProgress,
    })
    .where(eq(migrationJobs.id, job.id));

  processSmartEmailingMigration(job.id, orgId, username, apiKey).catch(async (err) => {
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

export async function processSmartEmailingMigration(
  jobId: string,
  orgId: string,
  username: string,
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
    // Step 1 — lists
    await updateProgress(jobId, { step: 'fetching_lists' });
    const seListsRes = await seGet<SeContactListsResponse>(username, apiKey, '/contactlists');
    const seLists = seListsRes.data ?? [];
    await updateProgress(jobId, { totalLists: seLists.length, processedLists: 0 });

    // Step 2 — per list
    for (let i = 0; i < seLists.length; i++) {
      const seList = seLists[i]!;
      await updateProgress(jobId, {
        step: `importing_list_${i + 1}_of_${seLists.length}`,
      });

      // Upsert list — idempotent by (org, name)
      const [forgeList] = await db
        .insert(lists)
        .values({ orgId, name: seList.name })
        .onConflictDoNothing()
        .returning();

      const listId =
        forgeList?.id ??
        (
          await db
            .select({ id: lists.id })
            .from(lists)
            .where(and(eq(lists.orgId, orgId), eq(lists.name, seList.name)))
            .limit(1)
        )[0]?.id;

      if (!listId) {
        errors.push(`Failed to upsert list "${seList.name}"`);
        continue;
      }

      // Step 3 — paginated subscriber fetch (200 per page)
      let page = 1;
      const limit = 200;
      let listImported = 0;
      let listSkipped = 0;

      while (true) {
        let pageRes: SeContactListContactsResponse;
        try {
          // contactlist-contacts is the v3 endpoint that yields the join.
          // expand=contact pulls the contact record so we don't need an
          // additional N+1 GET per subscriber.
          pageRes = await seGet<SeContactListContactsResponse>(
            username,
            apiKey,
            `/contactlist-contacts?contactlist_id=${seList.id}&expand=contact&limit=${limit}&page=${page}`,
          );
        } catch (err) {
          errors.push(
            `Subscribers fetch failed for "${seList.name}" page ${page}: ${(err as Error).message}`,
          );
          break;
        }

        const batch = pageRes.data ?? [];
        if (batch.length === 0) break;

        for (const sub of batch) {
          const mapped = mapSubscriber(sub, orgId);
          if (!mapped) {
            listSkipped++;
            continue;
          }

          try {
            await db
              .insert(contacts)
              .values(mapped)
              .onConflictDoUpdate({
                target: [contacts.orgId, contacts.email],
                set: {
                  customFields: sql`coalesce(${contacts.customFields}, '{}'::jsonb) || ${JSON.stringify(mapped.customFields)}::jsonb`,
                  firstName: sql`coalesce(${contacts.firstName}, ${mapped.firstName ?? null})`,
                  lastName: sql`coalesce(${contacts.lastName}, ${mapped.lastName ?? null})`,
                  phone: sql`coalesce(${contacts.phone}, ${mapped.phone ?? null})`,
                },
              });
            listImported++;
          } catch (err) {
            errors.push(`Insert failed for ${sub.contact?.emailaddress}: ${(err as Error).message}`);
            listSkipped++;
          }
        }

        if (pageRes.meta?.page_count && pageRes.meta.current_page && pageRes.meta.current_page >= pageRes.meta.page_count) {
          break;
        }
        if (batch.length < limit) break;
        page++;
        if (page > 1000) {
          errors.push(`Pagination cap reached on list "${seList.name}"`);
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

    await db
      .update(migrationJobs)
      .set({ status: 'completed', completedAt: new Date() })
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

// ─── Mapping ─────────────────────────────────────────────────────────────────

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
 * Map a SmartEmailing contactlist-contacts row into a Mailforge contact.
 * Skips records without a valid email AND records flagged bounce/spam_complaint
 * (those should land in suppression on a follow-up pass, not as live contacts).
 *
 * GDPR audit columns from SmartEmailing's consent module (gdpr.{consent_source,
 * consent_at, consent_ip, consent_note}) are mirrored into customFields under
 * imported_consent_* keys. The Sprint D consent migration will lift these into
 * processing_purposes rows.
 */
export function mapSubscriber(
  row: SeContactListContact,
  orgId: string,
): MappedContact | null {
  const c = row.contact;
  if (!c?.emailaddress || !c.emailaddress.includes('@')) return null;

  const status = (row.status ?? '').toLowerCase();
  if (status === 'bounce' || status === 'spam_complaint') return null;

  const isSubscribed = status === 'confirmed' || status === 'subscribed';

  // Prefer SmartEmailing's GDPR consent_at when present, otherwise the
  // status-change timestamp (updated), then the contact creation time.
  const consentAt = c.gdpr?.consent_at ?? row.updated ?? c.created ?? null;

  const customFields: Record<string, unknown> = {
    imported_from: 'smartemailing',
    imported_consent_at: consentAt,
    imported_consent_status: status || 'subscribed',
    ...(c.id != null ? { imported_external_id: String(c.id) } : {}),
    ...(c.gdpr?.consent_source
      ? { imported_consent_source: c.gdpr.consent_source }
      : {}),
    ...(c.gdpr?.consent_ip
      ? { imported_consent_ip: c.gdpr.consent_ip }
      : {}),
    ...(c.gdpr?.consent_note
      ? { imported_consent_note: c.gdpr.consent_note }
      : {}),
    ...(c.customfields_values && c.customfields_values.length > 0
      ? {
          smartemailing_custom: Object.fromEntries(
            c.customfields_values.map((cf) => [
              cf.name ?? `cf_${cf.id}`,
              cf.value,
            ]),
          ),
        }
      : {}),
  };

  return {
    orgId,
    email: c.emailaddress.toLowerCase().trim(),
    firstName: c.name?.trim() || null,
    lastName: c.surname?.trim() || null,
    phone: c.cellphone?.trim() || null,
    status: isSubscribed ? 'active' : 'unsubscribed',
    customFields,
  };
}
