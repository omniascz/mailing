/**
 * Workflow scheduler — the two repeatable cron jobs that drive time-based
 * automation. Without these, multi-step workflows with wait/delay nodes stall
 * forever and all daily triggers (date / name-day / holiday / RFM / predictions
 * / channel scores / engagement / DNS health) never run.
 *
 *   workflow-run-resume : every minute → POST /internal/workflow/process-runs
 *   daily-triggers      : 06:00 UTC daily → POST /internal/triggers/daily-run
 */
import { Worker, Queue } from 'bullmq';
import { connection, QUEUE_NAMES } from '../queues/index.js';
import { captureJobException } from '../lib/telemetry.js';

const API_URL = process.env.API_URL ?? process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const SECRET = process.env.INTERNAL_SECRET ?? '';

const resumeQueue = new Queue(QUEUE_NAMES.WORKFLOW_RUN_RESUME, { connection });
const dailyQueue = new Queue(QUEUE_NAMES.DAILY_TRIGGERS, { connection });

async function post(path: string): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': SECRET },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

export function startWorkflowSchedulerWorkers() {
  const resumeWorker = new Worker(
    QUEUE_NAMES.WORKFLOW_RUN_RESUME,
    async (job) => {
      const r = (await post('/api/v1/internal/workflow/process-runs')) as {
        data?: { processed: number; errors: number };
      };
      job.log(`Resumed ${r.data?.processed ?? 0} runs (${r.data?.errors ?? 0} errors)`);
    },
    { connection, concurrency: 1 },
  );
  resumeWorker.on('failed', (job, err) => {
    console.error('[workflow-run-resume] failed', job?.id, err.message);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.WORKFLOW_RUN_RESUME });
  });

  const dailyWorker = new Worker(
    QUEUE_NAMES.DAILY_TRIGGERS,
    async (job) => {
      await post('/api/v1/internal/triggers/daily-run');
      job.log('Daily triggers + refresh executed');
    },
    { connection, concurrency: 1 },
  );
  dailyWorker.on('failed', (job, err) => {
    console.error('[daily-triggers] failed', job?.id, err.message);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.DAILY_TRIGGERS });
  });

  return { resumeWorker, dailyWorker };
}

export async function scheduleWorkflowJobs() {
  if (!(await resumeQueue.getJob('workflow-run-resume'))) {
    await resumeQueue.add(
      'resume',
      {},
      {
        jobId: 'workflow-run-resume',
        repeat: { pattern: '* * * * *' }, // every minute
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      },
    );
    console.log('[workflow-scheduler] run-resume scheduled (every minute)');
  }
  if (!(await dailyQueue.getJob('daily-triggers'))) {
    await dailyQueue.add(
      'daily',
      {},
      {
        jobId: 'daily-triggers',
        repeat: { pattern: '0 6 * * *' }, // 06:00 UTC daily
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
    console.log('[workflow-scheduler] daily-triggers scheduled (06:00 UTC)');
  }
}
