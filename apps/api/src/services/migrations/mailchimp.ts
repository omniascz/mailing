/**
 * Mailchimp migration tool (task 6.7).
 *
 * Imports lists, contacts, and templates from a Mailchimp account.
 *
 * Pipeline:
 *   1. Validate API key (GET /3.0/ping)
 *   2. Fetch lists (GET /3.0/lists, paginated)
 *   3. Fetch members per list (GET /3.0/lists/{id}/members, paginated)
 *   4. Fetch templates (GET /3.0/templates?type=user)
 *   5. Map data → ForgeMsg format
 *   6. Batch import contacts + lists + templates
 *
 * Runs as a background job. Progress is persisted to migration_jobs.progress.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  migrationJobs,
  contacts,
  lists,
  templates,
  type MigrationProgress,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';

// ─── Mailchimp API client ─────────────────────────────────────────────────────

function mcHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

function mcBase(apiKey: string): string {
  // Mailchimp API key format: <key>-<dc>
  const dc = apiKey.split('-').pop() ?? 'us1';
  return `https://${dc}.api.mailchimp.com/3.0`;
}

async function mcGet<T>(apiKey: string, path: string): Promise<T> {
  const base = mcBase(apiKey);
  const res = await fetch(`${base}${path}`, {
    headers: mcHeaders(apiKey),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mailchimp API ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json() as T;
}

// ─── Mailchimp types ──────────────────────────────────────────────────────────

interface McPing {
  health_status: string;
}

interface McList {
  id: string;
  name: string;
  stats: { member_count: number };
}

interface McListsResponse {
  lists: McList[];
  total_items: number;
}

interface McMember {
  id: string;
  email_address: string;
  status: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending';
  merge_fields: Record<string, string>;
  tags: Array<{ id: number; name: string }>;
}

interface McMembersResponse {
  members: McMember[];
  total_items: number;
}

interface McTemplate {
  id: number;
  name: string;
  category: string;
  source_url: string;
}

interface McTemplatesResponse {
  templates: McTemplate[];
  total_items: number;
}

// ─── Job management ───────────────────────────────────────────────────────────

export async function startMailchimpMigration(
  orgId: string,
  apiKey: string,
): Promise<typeof migrationJobs.$inferSelect> {
  // Validate API key first
  try {
    await mcGet<McPing>(apiKey, '/ping');
  } catch (err) {
    throw AppError.badRequest(`Invalid Mailchimp API key: ${(err as Error).message}`);
  }

  const [job] = await db
    .insert(migrationJobs)
    .values({
      orgId,
      type: 'mailchimp',
      status: 'pending',
      progress: { step: 'queued' },
    })
    .returning();

  if (!job) throw AppError.internal('Failed to create migration job');

  // Store API key in job progress temporarily (encrypted in prod; plain here for simplicity)
  await db
    .update(migrationJobs)
    .set({ progress: { step: 'queued', apiKey } as unknown as MigrationProgress })
    .where(eq(migrationJobs.id, job.id));

  // Queue background job (fire-and-forget)
  processMigration(job.id, orgId, apiKey).catch(async (err) => {
    await db
      .update(migrationJobs)
      .set({ status: 'failed', errorMessage: (err as Error).message, completedAt: new Date() })
      .where(eq(migrationJobs.id, job.id))
      .catch(() => {});
  });

  return job;
}

export async function getMigrationJob(id: string, orgId: string) {
  const [job] = await db.select().from(migrationJobs).where(eq(migrationJobs.id, id)).limit(1);

  if (!job || job.orgId !== orgId) throw AppError.notFound('MigrationJob');

  // Remove stored API key from progress before returning
  const { apiKey: _ak, ...safeProgress } = job.progress as unknown as Record<string, unknown>;
  return { ...job, progress: safeProgress as unknown as MigrationProgress };
}

export async function listMigrationJobs(orgId: string) {
  const rows = await db
    .select()
    .from(migrationJobs)
    .where(eq(migrationJobs.orgId, orgId))
    .orderBy(migrationJobs.createdAt);

  return rows.map((j) => {
    const { apiKey: _ak, ...safeProgress } = j.progress as unknown as Record<string, unknown>;
    return { ...j, progress: safeProgress as unknown as MigrationProgress };
  });
}

// ─── Migration pipeline ───────────────────────────────────────────────────────

async function updateProgress(jobId: string, progress: Partial<MigrationProgress>) {
  const [current] = await db
    .select({ progress: migrationJobs.progress })
    .from(migrationJobs)
    .where(eq(migrationJobs.id, jobId))
    .limit(1);

  const merged = {
    ...((current?.progress as unknown as Record<string, unknown>) ?? {}),
    ...progress,
  };

  await db
    .update(migrationJobs)
    .set({ progress: merged as unknown as MigrationProgress })
    .where(eq(migrationJobs.id, jobId));
}

export async function processMigration(
  jobId: string,
  orgId: string,
  apiKey: string,
): Promise<void> {
  await db.update(migrationJobs).set({ status: 'running' }).where(eq(migrationJobs.id, jobId));

  try {
    // ── Step 1: fetch lists ──────────────────────────────────────────────────
    await updateProgress(jobId, { step: 'fetching_lists' });

    const mcLists: McList[] = [];
    let offset = 0;
    const pageSize = 100;

    while (true) {
      const page = await mcGet<McListsResponse>(
        apiKey,
        `/lists?count=${pageSize}&offset=${offset}&fields=lists.id,lists.name,lists.stats,total_items`,
      );
      mcLists.push(...page.lists);
      if (mcLists.length >= page.total_items) break;
      offset += pageSize;
    }

    await updateProgress(jobId, { totalLists: mcLists.length, processedLists: 0 });

    // ── Step 2: import lists ─────────────────────────────────────────────────
    await updateProgress(jobId, { step: 'importing_lists' });

    const listIdMap = new Map<string, string>(); // mcListId → forgeListId

    for (const mcList of mcLists) {
      const [forgeList] = await db
        .insert(lists)
        .values({ orgId, name: mcList.name })
        .onConflictDoNothing()
        .returning({ id: lists.id });

      if (forgeList) listIdMap.set(mcList.id, forgeList.id);
      await updateProgress(jobId, {
        processedLists: listIdMap.size,
      });
    }

    // ── Step 3: fetch + import contacts per list ─────────────────────────────
    await updateProgress(jobId, { step: 'importing_contacts' });

    let totalContacts = 0;
    let processedContacts = 0;
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Count total
    for (const mcList of mcLists) {
      const peek = await mcGet<McMembersResponse>(
        apiKey,
        `/lists/${mcList.id}/members?count=1&fields=total_items`,
      );
      totalContacts += peek.total_items;
    }
    await updateProgress(jobId, { totalContacts });

    for (const mcList of mcLists) {
      const forgeListId = listIdMap.get(mcList.id);
      let memberOffset = 0;

      while (true) {
        const page = await mcGet<McMembersResponse>(
          apiKey,
          `/lists/${mcList.id}/members?count=${pageSize}&offset=${memberOffset}&status=subscribed&fields=members.id,members.email_address,members.status,members.merge_fields,members.tags,total_items`,
        );

        for (const member of page.members) {
          try {
            const email = member.email_address.trim().toLowerCase();
            const firstName = member.merge_fields['FNAME'] || null;
            const lastName = member.merge_fields['LNAME'] || null;

            // Upsert contact
            const existing = await db
              .select({ id: contacts.id })
              .from(contacts)
              .where(eq(contacts.email, email))
              .limit(1);

            let contactId: string;

            if (existing.length > 0 && existing[0]) {
              contactId = existing[0].id;
              skipped++;
            } else {
              const [c] = await db
                .insert(contacts)
                .values({
                  orgId,
                  email,
                  firstName,
                  lastName,
                  source: 'mailchimp_migration',
                })
                .returning({ id: contacts.id });
              if (!c) continue;
              contactId = c.id;
              imported++;
            }

            // Add to list
            if (forgeListId) {
              const { contactLists } = await import('../../db/schema/index.js');
              await db
                .insert(contactLists)
                .values({ contactId, listId: forgeListId })
                .onConflictDoNothing()
                .catch(() => {});
            }

            // Apply tags
            if (member.tags.length > 0) {
              const { tags: tagsTable, contactTags } = await import('../../db/schema/index.js');
              for (const mcTag of member.tags) {
                let [tag] = await db
                  .select({ id: tagsTable.id })
                  .from(tagsTable)
                  .where(eq(tagsTable.name, mcTag.name))
                  .limit(1);

                if (!tag) {
                  const [newTag] = await db
                    .insert(tagsTable)
                    .values({ orgId, name: mcTag.name })
                    .returning({ id: tagsTable.id });
                  tag = newTag;
                }
                if (!tag) continue;

                await db
                  .insert(contactTags)
                  .values({ contactId, tagId: tag.id })
                  .onConflictDoNothing()
                  .catch(() => {});
              }
            }
          } catch (err) {
            errors.push(`${member.email_address}: ${(err as Error).message}`);
          }

          processedContacts++;
        }

        await updateProgress(jobId, {
          processedContacts,
          imported,
          skipped,
          errors: errors.slice(-10),
        });

        if (processedContacts >= totalContacts) break;
        memberOffset += pageSize;
        if (page.members.length < pageSize) break;
      }
    }

    // ── Step 4: import templates ─────────────────────────────────────────────
    await updateProgress(jobId, { step: 'importing_templates' });

    const mcTemplates = await mcGet<McTemplatesResponse>(apiKey, `/templates?type=user&count=100`);

    await updateProgress(jobId, {
      totalTemplates: mcTemplates.templates.length,
      processedTemplates: 0,
    });

    let processedTemplates = 0;
    for (const mcTpl of mcTemplates.templates) {
      try {
        await db
          .insert(templates)
          .values({
            orgId,
            name: `[MC] ${mcTpl.name}`,
            category: 'custom',
            subject: mcTpl.name,
            blocks: [],
          })
          .onConflictDoNothing();
        processedTemplates++;
      } catch {
        // skip template errors
      }
    }

    await updateProgress(jobId, { processedTemplates, step: 'completed' });

    // ── Done ─────────────────────────────────────────────────────────────────
    await db
      .update(migrationJobs)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(migrationJobs.id, jobId));
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
