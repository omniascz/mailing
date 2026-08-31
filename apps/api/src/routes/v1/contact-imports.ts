import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { importJobs } from '../../db/schema/index.js';
import { AppError } from '../../lib/app-error.js';
import {
  parseFile,
  detectFormat,
  detectColumnMapping,
  runImport,
  type ContactField,
} from '../../services/import/index.js';
import { checkContactCapacity } from '../../services/billing/plan-enforcement.js';

const UPLOAD_DIR = process.env.IMPORT_UPLOAD_DIR || path.join(os.tmpdir(), 'forgemsg-imports');

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SAMPLE_SIZE = 10;

const contactFieldSchema = z.enum([
  'email',
  'phone',
  'first_name',
  'last_name',
  'status',
  'source',
  'ignore',
]) satisfies z.ZodType<ContactField>;

const mappingBodySchema = z.object({
  mapping: z.record(z.string(), contactFieldSchema),
  defaultListId: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function contactImportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  /**
   * Step 1: upload file → detect format → parse headers + sample rows →
   * persist import_jobs row in status=uploaded with a suggested column mapping.
   */
  app.post(
    '/api/v1/contacts/import/upload',
    {
      schema: { tags: ['Import'], summary: 'Upload a CSV/XLSX file for import' },
    },
    async (request) => {
      const orgId = request.user!.orgId;
      const mpFile = await request.file({ limits: { fileSize: MAX_FILE_BYTES } });
      if (!mpFile) throw AppError.badRequest('Missing file');

      const format = detectFormat(mpFile.filename);
      if (!format) throw AppError.badRequest('Unsupported file format (expected .csv or .xlsx)');

      await mkdir(UPLOAD_DIR, { recursive: true });
      const storagePath = path.join(
        UPLOAD_DIR,
        `${crypto.randomUUID()}-${path.basename(mpFile.filename)}`,
      );
      let fileSize = 0;

      await pipeline(
        mpFile.file,
        async function* (source) {
          for await (const chunk of source) {
            fileSize += (chunk as Buffer).length;
            yield chunk;
          }
        },
        createWriteStream(storagePath),
      );

      if (mpFile.file.truncated) {
        throw AppError.badRequest(`File exceeds max size of ${MAX_FILE_BYTES} bytes`);
      }

      const parsed = await parseFile(storagePath, format);
      const detectedMapping = detectColumnMapping(parsed.columns);
      const sample = parsed.rows.slice(0, SAMPLE_SIZE);

      const [row] = await db
        .insert(importJobs)
        .values({
          orgId,
          createdBy: request.user!.userId,
          filename: mpFile.filename,
          format,
          fileSize,
          storagePath,
          status: 'uploaded',
          detectedColumns: parsed.columns,
          sampleRows: sample,
          columnMapping: detectedMapping,
          totalRows: parsed.rows.length,
        })
        .returning();

      return { data: row };
    },
  );

  /**
   * Step 2: return detected columns + sample rows so the UI can render a
   * mapping screen.
   */
  app.get(
    '/api/v1/contacts/import/:id/columns',
    { schema: { tags: ['Import'], summary: 'Get detected columns for an import job' } },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const job = await requireJob(request.user!.orgId, id);
      return {
        data: {
          columns: job.detectedColumns,
          suggestedMapping: job.columnMapping,
          sampleRows: job.sampleRows,
          totalRows: job.totalRows,
        },
      };
    },
  );

  /**
   * Step 3: persist the user-confirmed column mapping and optional list id.
   */
  app.post(
    '/api/v1/contacts/import/:id/mapping',
    { schema: { tags: ['Import'], summary: 'Set column mapping for an import job' } },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const body = mappingBodySchema.parse(request.body);
      const job = await requireJob(request.user!.orgId, id);
      if (!['uploaded', 'mapped'].includes(job.status)) {
        throw AppError.badRequest(`Cannot change mapping for job in status ${job.status}`);
      }

      // Validate that the mapping only references detected columns.
      for (const col of Object.keys(body.mapping)) {
        if (!job.detectedColumns.includes(col)) {
          throw AppError.badRequest(`Unknown column in mapping: ${col}`);
        }
      }

      // Validate that at least one of email/phone is mapped.
      const targets = new Set(Object.values(body.mapping));
      if (!targets.has('email') && !targets.has('phone')) {
        throw AppError.badRequest('Mapping must include at least email or phone');
      }

      const [updated] = await db
        .update(importJobs)
        .set({
          columnMapping: body.mapping,
          defaultListId: body.defaultListId ?? null,
          status: 'mapped',
          updatedAt: new Date(),
        })
        .where(eq(importJobs.id, id))
        .returning();
      return { data: updated };
    },
  );

  /**
   * Step 4: kick off processing. Runs in the background; caller should poll GET /:id.
   */
  app.post(
    '/api/v1/contacts/import/:id/execute',
    { schema: { tags: ['Import'], summary: 'Execute the import job' } },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const job = await requireJob(request.user!.orgId, id);
      if (job.status !== 'mapped') {
        throw AppError.badRequest(
          `Import must be in status 'mapped' to execute (was ${job.status})`,
        );
      }

      // The plan limit applies to bulk import too.
      //
      // POST /api/v1/contacts has always called this, one contact at a time
      // (`checkContactCapacity(orgId, 1)`). This route called nothing, so the
      // whole limit came off if you uploaded a file instead of posting — the
      // enforcement was there, it just sat on the slower of the two doors.
      //
      // Checked HERE rather than inside runImport, and the whole import is
      // refused rather than filled to the limit:
      //
      //   - The caller finds out synchronously, from the request that asked
      //     for the work. runImport is fire-and-forget into setImmediate, so a
      //     refusal in there could only be discovered by polling the job row.
      //   - A truncated import is the worse failure. The customer gets a list
      //     that is quietly missing an unknown subset, with the cut made in
      //     whatever order the file happened to be in; re-uploading after an
      //     upgrade then re-walks rows that already landed. Refusing is a state
      //     they can act on and undo.
      //   - It keeps the two doors consistent. Single-contact creation refuses
      //     at the limit; bulk importing part of a file would make the same
      //     limit mean two different things.
      //
      // KNOWN OVER-ESTIMATE, and deliberately on the safe side: totalRows is
      // rows in the file, and a row matching an existing contact updates it
      // rather than adding one. So a file that is mostly a re-import of people
      // already on the list is judged as if all of them were new, and can be
      // refused when it would in fact have fitted. Counting only genuinely new
      // rows means parsing and de-duplicating before deciding, which is a
      // different mechanism than the one this route is asked to share.
      await checkContactCapacity(request.user!.orgId, job.totalRows ?? 0);

      // Fire and forget — progress is persisted to the import_jobs row.
      // In Fáze 1.2b this will move to a BullMQ worker process; the service
      // function is already reusable from anywhere.
      setImmediate(() => {
        runImport({ importJobId: id, orgId: request.user!.orgId }).catch((err) => {
          request.log.error({ err, importJobId: id }, 'Import job failed');
        });
      });

      return { data: { id, status: 'processing' } };
    },
  );

  app.get(
    '/api/v1/contacts/import/:id',
    { schema: { tags: ['Import'], summary: 'Get import job status and progress' } },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const job = await requireJob(request.user!.orgId, id);
      return { data: job };
    },
  );
}

async function requireJob(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, id), eq(importJobs.orgId, orgId)))
    .limit(1);
  if (!row) throw AppError.notFound('Import job');
  return row;
}
