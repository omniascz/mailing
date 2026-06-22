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
const warehouseQueue = new Queue(QUEUE_NAMES.WAREHOUSE_SYNC, { connection });
const clickhouseQueue = new Queue(QUEUE_NAMES.CLICKHOUSE_REPLICATE, { connection });

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

  const warehouseWorker = new Worker(
    QUEUE_NAMES.WAREHOUSE_SYNC,
    async (job) => {
      const r = (await post('/api/v1/internal/warehouse-sync/run-due')) as {
        data?: { ran: number; ok: number; failed: number };
      };
      job.log(`Warehouse syncs: ran ${r.data?.ran ?? 0}, ok ${r.data?.ok ?? 0}, failed ${r.data?.failed ?? 0}`);
    },
    { connection, concurrency: 1 },
  );
  warehouseWorker.on('failed', (job, err) => {
    console.error('[warehouse-sync] failed', job?.id, err.message);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.WAREHOUSE_SYNC });
  });

  const clickhouseWorker = new Worker(
    QUEUE_NAMES.CLICKHOUSE_REPLICATE,
    async (job) => {
      const r = (await post('/api/v1/internal/clickhouse/replicate')) as {
        data?: { replicated: number; enabled: boolean };
      };
      if (r.data?.enabled) job.log(`ClickHouse replicated ${r.data.replicated} rows`);
    },
    { connection, concurrency: 1 },
  );
  clickhouseWorker.on('failed', (job, err) => {
    console.error('[clickhouse-replicate] failed', job?.id, err.message);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.CLICKHOUSE_REPLICATE });
  });

  return { resumeWorker, dailyWorker, warehouseWorker, clickhouseWorker };
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
  if (!(await warehouseQueue.getJob('warehouse-sync-run'))) {
    await warehouseQueue.add(
      'run-due',
      {},
      {
        jobId: 'warehouse-sync-run',
        repeat: { pattern: '15 * * * *' }, // hourly at :15
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
    console.log('[workflow-scheduler] warehouse-sync scheduled (hourly)');
  }
  if (!(await clickhouseQueue.getJob('clickhouse-replicate'))) {
    await clickhouseQueue.add(
      'replicate',
      {},
      {
        jobId: 'clickhouse-replicate',
        repeat: { pattern: '* * * * *' }, // every minute (no-op when CH disabled)
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      },
    );
    console.log('[workflow-scheduler] clickhouse-replicate scheduled (every minute)');
  }
}
