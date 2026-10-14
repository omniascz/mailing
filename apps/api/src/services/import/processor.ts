import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  contacts,
  contactLists,
  importJobs,
  type ImportError,
  type NewContact,
} from '../../db/schema/index.js';
import { parseFile } from './parser.js';
import { validateRow } from './validator.js';
import type { ContactField } from './column-detect.js';
import { normalizeEmail } from '../../lib/email-address.js';
import { LIVE_CONTACT_EMAIL } from '../contacts/by-email.js';

const BATCH_SIZE = 1000;
const MAX_STORED_ERRORS = 500;

export interface RunImportOptions {
  importJobId: string;
  orgId: string;
}

/**
 * Run a full import: re-parse the uploaded file, validate each row, and
 * upsert contacts in batches of BATCH_SIZE. Progress is flushed to the
 * import_jobs row after every batch. Idempotent by email (per-org).
 */
export async function runImport(opts: RunImportOptions): Promise<void> {
  const [job] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, opts.importJobId), eq(importJobs.orgId, opts.orgId)))
    .limit(1);

  if (!job) throw new Error(`Import job not found: ${opts.importJobId}`);
  if (!job.columnMapping) throw new Error(`Import job ${job.id} has no column mapping`);

  await db
    .update(importJobs)
    .set({ status: 'processing', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(importJobs.id, job.id));

  const mapping = job.columnMapping as Record<string, ContactField>;

  try {
    const parsed = await parseFile(job.storagePath, job.format);
    const rows = parsed.rows;
    const totalRows = rows.length;

    let processed = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errorCount = 0;
    const errors: ImportError[] = [];

    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
      const toInsert: NewContact[] = [];

      for (let i = 0; i < batch.length; i++) {
        const rowNum = batchStart + i + 1; // 1-indexed for humans
        const row = batch[i];
        if (!row) continue;
        const result = validateRow(row, mapping);

        if (!result.ok || !result.row) {
          errorCount++;
          if (errors.length < MAX_STORED_ERRORS) {
            errors.push({ row: rowNum, reason: result.errors.join('; ') });
          }
          continue;
        }

        const n = result.row;

        const contactRow: NewContact = {
          orgId: job.orgId,
          email: n.email,
          phone: n.phone,
          firstName: n.firstName,
          lastName: n.lastName,
          source: n.source ?? 'import',
          customFields: n.customFields,
          phoneType: n.phoneInfo?.type === 'unknown' ? null : (n.phoneInfo?.type ?? null),
          phoneOperator: n.phoneInfo?.operator ?? null,
          phoneRegion: n.phoneInfo?.region ?? null,
          phoneDistrict: n.phoneInfo?.district ?? null,
          phoneCountry: n.phoneInfo?.country ?? null,
          phoneLookupAt: n.phoneInfo?.isValid ? new Date() : null,
        };
        toInsert.push(contactRow);
      }

      // One address, one contact (services/contacts/by-email.ts). A row whose
      // address a live contact already has — in any spelling — is skipped, and
      // so is the second of two rows with the same address in one file; the
      // insert itself names the unique index, so an address that another
      // writer creates meanwhile is skipped too instead of failing the batch.
      // An existing contact's status is never touched.
      const seen = new Set<string>();
      const unique = toInsert.filter((c) => {
        if (!c.email) return true;
        c.email = normalizeEmail(c.email);
        if (seen.has(c.email)) return false;
        seen.add(c.email);
        return true;
      });
      const existing =
        seen.size > 0
          ? await db
              .select({ email: contacts.email })
              .from(contacts)
              .where(
                and(
                  eq(contacts.orgId, job.orgId),
                  inArray(contacts.email, [...seen]),
                  isNull(contacts.deletedAt),
                ),
              )
          : [];
      const existingEmails = new Set(existing.map((r) => r.email));
      const freshInserts = unique.filter((c) => !c.email || !existingEmails.has(c.email));
      const overlaps = toInsert.length - freshInserts.length;

      if (freshInserts.length > 0) {
        const insertedRows = await db
          .insert(contacts)
          .values(freshInserts)
          .onConflictDoNothing({
            target: [contacts.orgId, contacts.email],
            where: LIVE_CONTACT_EMAIL,
          })
          .returning({ id: contacts.id });
        inserted += insertedRows.length;
        skipped += freshInserts.length - insertedRows.length;

        if (job.defaultListId && insertedRows.length > 0) {
          await db
            .insert(contactLists)
            .values(insertedRows.map((r) => ({ contactId: r.id, listId: job.defaultListId! })))
            .onConflictDoNothing();
        }
      }

      updated += overlaps; // currently we skip updating; counted as "already existed"
      skipped += overlaps;

      processed += batch.length;

      await db
        .update(importJobs)
        .set({
          processedRows: processed,
          insertedRows: inserted,
          updatedRows: updated,
          skippedRows: skipped,
          errorRows: errorCount,
          totalRows,
          errors,
          updatedAt: new Date(),
        })
        .where(eq(importJobs.id, job.id));
    }

    await db
      .update(importJobs)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        totalRows,
        processedRows: processed,
        insertedRows: inserted,
        updatedRows: updated,
        skippedRows: skipped,
        errorRows: errorCount,
        errors,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id));
  } catch (err) {
    await db
      .update(importJobs)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        errors: [{ row: 0, reason: err instanceof Error ? err.message : String(err) }],
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id));
    throw err;
  }
}
