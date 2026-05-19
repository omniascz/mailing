/**
 * Klaviyo migration tool (Sprint C — DTC e-commerce flagship source).
 *
 * Imports lists + profiles + email-consent state from a Klaviyo account.
 * Klaviyo is the dominant DTC ESP, so a one-click migration removes the
 * biggest friction in pulling Shopify / WooCommerce customers off it.
 *
 * Pipeline:
 *   1. Validate API key (GET /accounts)
 *   2. Fetch lists (GET /lists)
 *   3. Per list: paginated profile fetch (relationship endpoint)
 *   4. Map profile → ForgeMsg contact, preserving:
 *        - subscriptions.email.marketing.consent → imported_consent_status
 *        - subscriptions.email.marketing.consent_timestamp
 *        - properties → klaviyo_custom namespace
 *        - source attribution (imported_from = 'klaviyo')
 *
 * API reference: https://developers.klaviyo.com/en/reference/api_overview
 * Base URL: https://a.klaviyo.com/api
 * Auth header: `Authorization: Klaviyo-API-Key {private_api_key}`
 * Revision header: required, pinned in KLAVIYO_REVISION below.
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

// ─── Klaviyo API client ──────────────────────────────────────────────────────

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
/**
 * Klaviyo's revisioned API. Pinning the date freezes the response shape;
 * bump deliberately when migrating to a newer revision so we re-test
 * mapSubscriber's field expectations.
 */
const KLAVIYO_REVISION = '2024-10-15';

function klHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: KLAVIYO_REVISION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function klGet<T>(apiKey: string, urlOrPath: string): Promise<T> {
  // Klaviyo returns absolute `links.next` URLs for pagination; accept both.
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${KLAVIYO_BASE}${urlOrPath}`;
  const res = await fetch(url, {
    headers: klHeaders(apiKey),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as T;
}

// ─── Klaviyo response shapes (subset we consume) ─────────────────────────────

interface KlList {
  id: string;
  attributes: { name: string };
}
interface KlListsResponse {
  data?: KlList[];
  links?: { next?: string | null };
}

/**
 * Klaviyo's profile resource. Many fields are optional and the marketing-
 * consent block is nested two levels deep.
 */
interface KlProfile {
  id: string;
  attributes: {
    email?: string | null;
    phone_number?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    organization?: string | null;
    /** Free-form key/value map the customer puts on each profile */
    properties?: Record<string, unknown> | null;
    /** ISO 8601 of profile creation */
    created?: string | null;
    /** ISO 8601 of last update */
    updated?: string | null;
    /** Nested consent tracking — only present if the profile had a subscription event */
    subscriptions?: {
      email?: {
        marketing?: {
          /** "SUBSCRIBED" | "UNSUBSCRIBED" | "NEVER_SUBSCRIBED" */
          consent?: string | null;
          /** ISO 8601 — when the consent state was set */
          consent_timestamp?: string | null;
          /** Optional method label (e.g. "FORM", "API") */
          method?: string | null;
          /** Free-text reason supplied at consent capture */
          method_detail?: string | null;
        } | null;
      } | null;
    } | null;
  };
}

interface KlProfilesResponse {
  data?: KlProfile[];
  links?: { next?: string | null };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function startKlaviyoMigration(
  orgId: string,
  apiKey: string,
): Promise<typeof migrationJobs.$inferSelect> {
  try {
    await klGet<{ data?: unknown }>(apiKey, '/accounts');
  } catch (err) {
    throw AppError.badRequest(`Invalid Klaviyo API key: ${(err as Error).message}`);
  }

  const [job] = await db
    .insert(migrationJobs)
    .values({
      orgId,
      type: 'klaviyo',
      status: 'pending',
      progress: { step: 'queued' },
    })
    .returning();

  if (!job) throw AppError.internal('Failed to create migration job');

  await db
    .update(migrationJobs)
    .set({ progress: { step: 'queued', apiKey } as unknown as MigrationProgress })
    .where(eq(migrationJobs.id, job.id));

  processKlaviyoMigration(job.id, orgId, apiKey).catch(async (err) => {
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

export async function processKlaviyoMigration(
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
    // Step 1 — lists. Klaviyo paginates via `links.next` absolute URLs.
    await updateProgress(jobId, { step: 'fetching_lists' });
    const klLists: KlList[] = [];
    let nextUrl: string | null | undefined = '/lists';
    while (nextUrl) {
      const page: KlListsResponse = await klGet(apiKey, nextUrl);
      if (page.data) klLists.push(...page.data);
      nextUrl = page.links?.next ?? null;
      if (klLists.length > 5000) {
        errors.push('List-pagination cap (5000) reached');
        break;
      }
    }
    await updateProgress(jobId, { totalLists: klLists.length, processedLists: 0 });

    // Step 2 — per list
    for (let i = 0; i < klLists.length; i++) {
      const klList = klLists[i]!;
      const listName = klList.attributes.name;
      await updateProgress(jobId, {
        step: `importing_list_${i + 1}_of_${klLists.length}`,
      });

      const [forgeList] = await db
        .insert(lists)
        .values({ orgId, name: listName })
        .onConflictDoNothing()
        .returning();

      const listId =
        forgeList?.id ??
        (
          await db
            .select({ id: lists.id })
            .from(lists)
            .where(and(eq(lists.orgId, orgId), eq(lists.name, listName)))
            .limit(1)
        )[0]?.id;

      if (!listId) {
        errors.push(`Failed to upsert list "${listName}"`);
        continue;
      }

      // Step 3 — paginated profiles. /lists/{id}/profiles relationship
      // endpoint returns full profile records when ?include=profile is set;
      // we ask for the profile attributes directly via the "profiles for list"
      // endpoint shape used here.
      let pNext: string | null | undefined = `/lists/${klList.id}/profiles`;
      let listImported = 0;
      let listSkipped = 0;
      let page = 0;

      while (pNext) {
        let pageRes: KlProfilesResponse;
        try {
          pageRes = await klGet(apiKey, pNext);
        } catch (err) {
          errors.push(
            `Profiles fetch failed for "${listName}" page ${page + 1}: ${(err as Error).message}`,
          );
          break;
        }

        const batch = pageRes.data ?? [];
        for (const prof of batch) {
          const mapped = mapProfile(prof, orgId);
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
            errors.push(
              `Insert failed for ${prof.attributes.email}: ${(err as Error).message}`,
            );
            listSkipped++;
          }
        }

        pNext = pageRes.links?.next ?? null;
        page++;
        if (page > 5000) {
          errors.push(`Pagination cap reached on list "${listName}"`);
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
 * Map a Klaviyo profile record into a Mailforge contact.
 *
 * Status mapping: subscriptions.email.marketing.consent maps directly —
 * SUBSCRIBED → active, UNSUBSCRIBED → unsubscribed.
 * NEVER_SUBSCRIBED is treated as unsubscribed (we never assume implicit
 * consent at import time; if the customer wants to mass-resubscribe they
 * do it via a re-opt-in campaign post-migration).
 *
 * Klaviyo profiles without an email but with phone_number are skipped —
 * the contacts table is keyed by (org, email) and we don't synthesize
 * phone-only contacts during migration.
 */
export function mapProfile(profile: KlProfile, orgId: string): MappedContact | null {
  const a = profile.attributes;
  if (!a.email || !a.email.includes('@')) return null;

  const consentObj = a.subscriptions?.email?.marketing ?? null;
  const consentRaw = (consentObj?.consent ?? '').toUpperCase();
  const isSubscribed = consentRaw === 'SUBSCRIBED';

  const consentAt = consentObj?.consent_timestamp ?? a.created ?? null;

  const customFields: Record<string, unknown> = {
    imported_from: 'klaviyo',
    imported_consent_at: consentAt,
    imported_consent_status: consentRaw || 'NEVER_SUBSCRIBED',
    imported_external_id: profile.id,
    ...(consentObj?.method ? { imported_consent_method: consentObj.method } : {}),
    ...(consentObj?.method_detail
      ? { imported_consent_method_detail: consentObj.method_detail }
      : {}),
    ...(a.organization ? { imported_organization: a.organization } : {}),
    ...(a.properties && typeof a.properties === 'object' && Object.keys(a.properties).length > 0
      ? { klaviyo_custom: a.properties }
      : {}),
  };

  return {
    orgId,
    email: a.email.toLowerCase().trim(),
    firstName: a.first_name?.trim() || null,
    lastName: a.last_name?.trim() || null,
    phone: a.phone_number?.trim() || null,
    status: isSubscribed ? 'active' : 'unsubscribed',
    customFields,
  };
}
