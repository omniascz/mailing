/**
 * Archive email events worker job (#279).
 *
 * Runs nightly (scheduled via BullMQ cron).
 * Delegates to the API's internal archive endpoint to avoid cross-package DB imports.
 */

import { Worker } from 'bullmq';
import { connection } from '../queues/index.js';
import { QUEUE_NAMES } from '../queues/index.js';
import { internalHeaders } from '../lib/internal-api.js';

export interface ArchiveJobData {
  cutoffDays?: number;
}

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
