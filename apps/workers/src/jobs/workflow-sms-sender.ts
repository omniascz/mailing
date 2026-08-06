/**
 * Workflow SMS sender — drains the 'sms' queue that workflow "send SMS" actions
 * (and cascades) enqueue into. Calls the internal dispatch endpoint which routes
 * the message through the org's SMS routing rules + provider adapter and logs
 * delivery. Before this worker existed, the 'sms' queue had no consumer.
 */
import { Worker, type Job } from 'bullmq';
import { connection } from '../queues/index.js';
import { captureJobException } from '../lib/telemetry.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const SECRET = process.env.INTERNAL_API_SECRET;

interface WorkflowSmsJob {
  orgId: string;
  contactId: string;
  workflowRunId?: string;
  phone: string;
  message: string;
}

function internalHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SECRET) h['x-internal-secret'] = SECRET;
  return h;
}

async function processWorkflowSms(job: Job<WorkflowSmsJob>) {
  const d = job.data;
  const res = await fetch(`${API_URL}/api/v1/internal/workflow/send-sms`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(d),
  });
  if (!res.ok) throw new Error(`send-sms dispatch failed: ${res.status}`);
  return res.json();
}

export function startWorkflowSmsWorker() {
  const worker = new Worker<WorkflowSmsJob>('sms', processWorkflowSms, {
    connection,
    concurrency: 10,
    limiter: { max: 50, duration: 1000 },
  });
  worker.on('failed', (job, err) => {
    console.error(`[workflow-sms] ${job?.id} failed: ${err.message}`);
    captureJobException(err, { jobId: job?.id, queue: 'sms' });
  });
  return worker;
}
