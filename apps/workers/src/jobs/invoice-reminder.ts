/**
 * Invoice reminder worker (#311).
 * Daily cron: marks overdue invoices and sends reminder workflow events.
 */

import { Worker, Queue } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';

const API_BASE = process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';

const reminderQueue = new Queue(QUEUE_NAMES.INVOICE_REMINDER, { connection });
const adPerfQueue = new Queue(QUEUE_NAMES.AD_PERF_SYNC, { connection });

async function callInternal(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
  });
  if (!res.ok) throw new Error(`Internal call failed: ${res.status} ${path}`);
  return res.json();
}

export function startInvoiceReminderWorker() {
  const worker = new Worker(
    QUEUE_NAMES.INVOICE_REMINDER,
    async (job) => {
      const result = await callInternal('/api/v1/internal/commerce/invoice-reminders');
      job.log(`Reminders sent: ${JSON.stringify(result)}`);
    },
    { connection, concurrency: 1 },
  );

  const adPerfWorker = new Worker(
    QUEUE_NAMES.AD_PERF_SYNC,
    async (job) => {
      const result = await callInternal('/api/v1/internal/ads/sync-performance');
      job.log(`Ad perf sync: ${JSON.stringify(result)}`);
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => console.error('[invoice-reminder] failed', job?.id, err.message));
  adPerfWorker.on('failed', (job, err) => console.error('[ad-perf-sync] failed', job?.id, err.message));

  return { worker, adPerfWorker };
}

export async function scheduleCommerceJobs() {
  const existing = await reminderQueue.getRepeatableJobs();
  if (!existing.find(j => j.name === 'daily-invoice-check')) {
    await reminderQueue.add('daily-invoice-check', {}, {
      repeat: { pattern: '0 8 * * *' }, // 08:00 UTC daily
      removeOnComplete: true,
    });
  }

  const adExisting = await adPerfQueue.getRepeatableJobs();
  if (!adExisting.find(j => j.name === 'daily-ad-perf')) {
    await adPerfQueue.add('daily-ad-perf', {}, {
      repeat: { pattern: '0 7 * * *' }, // 07:00 UTC daily
      removeOnComplete: true,
    });
  }

  console.log('[commerce] Invoice reminder + ad perf sync jobs scheduled');
}
