/**
 * Archive email events worker job (#279).
 *
 * Runs nightly (scheduled via BullMQ cron).
 * Delegates to the API's internal archive endpoint to avoid cross-package DB imports.
 *
 * The header above said "scheduled via BullMQ cron" from the day it was
 * written, and nothing ever put a job on the queue: index.ts called
 * startArchiveWorker() and there was no scheduleArchive() to call. So the
 * consumer sat idle, ARCHIVE_CUTOFF_DAYS had no effect, and email_events grew
 * without a ceiling — the one finding in the UNWIRED audit marked hidden
 * rather than visible, because an unbounded table shows up as slow queries
 * months later rather than as a broken screen today.
 */

import { Worker } from 'bullmq';
import { connection, cronQueue } from '../queues/index.js';
import { QUEUE_NAMES } from '../queues/index.js';
import { internalHeaders } from '../lib/internal-api.js';

export interface ArchiveJobData {
  cutoffDays?: number;
}

const archiveQueue = cronQueue(QUEUE_NAMES.ARCHIVE_EMAIL_EVENTS);

export function startArchiveWorker(): Worker {
  const worker = new Worker<ArchiveJobData>(
    QUEUE_NAMES.ARCHIVE_EMAIL_EVENTS,
    async (job) => {
      const cutoffDays = job.data.cutoffDays ?? Number(process.env.ARCHIVE_CUTOFF_DAYS ?? '30');
      const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

      job.log(`Triggering archive for events older than ${cutoffDays} days`);

      const res = await fetch(`${apiUrl}/api/v1/internal/archive/email-events`, {
        method: 'POST',
        headers: internalHeaders(),
        body: JSON.stringify({ cutoffDays }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Archive API returned ${res.status}: ${text}`);
      }

      const result = (await res.json()) as {
        data: { totalArchived: number; totalDeleted: number; orgsProcessed: number };
      };
      job.log(`Done: ${JSON.stringify(result.data)}`);
      return result.data;
    },
    {
      connection,
      concurrency: 1,
    },
  );

  return worker;
}

/**
 * Nightly at 03:20 UTC.
 *
 * Late enough that the day's sending and its delivery/open/click tail have
 * settled, early enough to be well clear of European business hours. 03:20
 * rather than the top of the hour because this deletes rows in bulk and the
 * hour marks are already crowded — 00:05 warmup-advance, 01:20 dkim-retire,
 * and the 0 6/7/8/9/10 block of daily reports. An off-peak slot of its own
 * keeps a long archive run from competing with them for the same connections.
 */
export async function scheduleArchive(): Promise<void> {
  const jobId = 'nightly-archive-email-events';
  const existing = await archiveQueue.getJob(jobId);
  if (!existing) {
    await archiveQueue.add(
      'archive-email-events',
      {},
      {
        jobId,
        repeat: { pattern: '20 3 * * *' }, // 03:20 UTC daily
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
    console.log('[archive-email-events] Nightly job scheduled (03:20 UTC)');
  }
}
