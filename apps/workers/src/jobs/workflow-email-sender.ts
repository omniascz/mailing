/**
 * Workflow email sender — drains the 'email' queue that workflow "send email"
 * actions (and cascades, sequences, personal emails) enqueue into. Each job is
 * a single-contact send referencing a campaign or template; the worker calls
 * the internal dispatch endpoint which resolves content + From identity and
 * feeds the real triggered batch-sender pipeline (render → track → suppress →
 * MTA). Before this worker existed, the 'email' queue had no consumer and every
 * workflow-triggered email was silently dropped.
 */
import { Worker, type Job } from 'bullmq';
import { connection } from '../queues/index.js';
import { captureJobException } from '../lib/telemetry.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const SECRET = process.env.INTERNAL_SECRET;

interface WorkflowEmailJob {
  orgId: string;
  contactId: string;
  workflowRunId?: string;
  campaignId?: string;
  templateId?: string;
  subject?: string;
  /** Inline content for self-contained (seeded) workflows. */
  html?: string;
  text?: string;
}

function internalHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SECRET) h['x-internal-secret'] = SECRET;
  return h;
}

async function processWorkflowEmail(job: Job<WorkflowEmailJob>) {
  const d = job.data;
  const res = await fetch(`${API_URL}/api/v1/internal/workflow/send-email`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(d),
  });
  if (!res.ok) throw new Error(`send-email dispatch failed: ${res.status}`);
  return res.json();
}

export function startWorkflowEmailWorker() {
  const worker = new Worker<WorkflowEmailJob>('email', processWorkflowEmail, {
    connection,
    concurrency: 20,
  });
  worker.on('failed', (job, err) => {
    console.error(`[workflow-email] ${job?.id} failed: ${err.message}`);
    captureJobException(err, { jobId: job?.id, queue: 'email' });
  });
  return worker;
}
