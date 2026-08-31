/**
 * Workflow scheduler — the two repeatable cron jobs that drive time-based
 * automation. Without these, multi-step workflows with wait/delay nodes stall
 * forever and all daily triggers (date / name-day / holiday / RFM / predictions
 * / channel scores / engagement / DNS health) never run.
 *
 *   workflow-run-resume : every minute → POST /internal/workflow/process-runs
 *   daily-triggers      : 06:00 UTC daily → POST /internal/triggers/daily-run
 */
import { env } from '../config/env.js';
import { Worker } from 'bullmq';
import { connection, cronQueue, QUEUE_NAMES } from '../queues/index.js';
import { captureJobException } from '../lib/telemetry.js';

const API_URL = process.env.API_URL ?? process.env.INTERNAL_API_URL ?? 'http://localhost:3001';
const SECRET = process.env.INTERNAL_API_SECRET ?? '';

const resumeQueue = cronQueue(QUEUE_NAMES.WORKFLOW_RUN_RESUME);
const dailyQueue = cronQueue(QUEUE_NAMES.DAILY_TRIGGERS);
const warehouseQueue = cronQueue(QUEUE_NAMES.WAREHOUSE_SYNC);
const clickhouseQueue = cronQueue(QUEUE_NAMES.CLICKHOUSE_REPLICATE);
const ticketingDayOfQueue = cronQueue(QUEUE_NAMES.TICKETING_DAY_OF);
const ticketingFillHouseQueue = cronQueue(QUEUE_NAMES.TICKETING_FILL_HOUSE);
const ticketingDiscoverQueue = cronQueue(QUEUE_NAMES.TICKETING_DISCOVER);
const campaignDispatchQueue = cronQueue(QUEUE_NAMES.CAMPAIGN_DISPATCH);
const browseAbandonmentQueue = cronQueue(QUEUE_NAMES.BROWSE_ABANDONMENT);
const scheduledReportsQueue = cronQueue(QUEUE_NAMES.SCHEDULED_REPORTS);
const segmentMembershipQueue = cronQueue(QUEUE_NAMES.SEGMENT_MEMBERSHIP);

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
      job.log(
        `Warehouse syncs: ran ${r.data?.ran ?? 0}, ok ${r.data?.ok ?? 0}, failed ${r.data?.failed ?? 0}`,
      );
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

  const mkTicketingWorker = (queue: string, path: string, label: string) => {
    const w = new Worker(
      queue,
      async (job) => {
        const r = (await post(path)) as { data?: Record<string, number> };
        job.log(`${label}: ${JSON.stringify(r.data ?? {})}`);
      },
      { connection, concurrency: 1 },
    );
    w.on('failed', (job, err) => {
      console.error(`[${label}] failed`, job?.id, err.message);
      captureJobException(err, { jobId: job?.id, queue });
    });
    return w;
  };

  const ticketingDayOfWorker = mkTicketingWorker(
    QUEUE_NAMES.TICKETING_DAY_OF,
    '/api/v1/internal/ticketing/day-of/tick',
    'ticketing-day-of',
  );
  const ticketingFillHouseWorker = mkTicketingWorker(
    QUEUE_NAMES.TICKETING_FILL_HOUSE,
    '/api/v1/internal/ticketing/fill-the-house/tick',
    'ticketing-fill-house',
  );
  const ticketingDiscoverWorker = mkTicketingWorker(
    QUEUE_NAMES.TICKETING_DISCOVER,
    '/api/v1/internal/ticketing/discover/tick',
    'ticketing-discover',
  );

  const campaignDispatchWorker = new Worker(
    QUEUE_NAMES.CAMPAIGN_DISPATCH,
    async (job) => {
      // One queue, two schedules. The jobId says which tick this is.
      if (job.opts.jobId === 'campaign-reap-stalled' || job.name === 'reap') {
        const r = (await post('/api/v1/internal/campaigns/reap-stalled')) as {
          data?: { examined: number; closedSent: number; closedFailed: number };
        };
        if (r.data?.examined) {
          job.log(
            `Reaped ${r.data.examined} stalled campaign(s): ` +
              `${r.data.closedSent} sent, ${r.data.closedFailed} failed`,
          );
        }
        return;
      }

      const r = (await post('/api/v1/internal/campaigns/dispatch-scheduled')) as {
        data?: { dispatched: number; errors: number };
      };
      if (r.data?.dispatched) {
        job.log(
          `Dispatched ${r.data.dispatched} scheduled campaigns (${r.data.errors ?? 0} errors)`,
        );
      }
    },
    { connection, concurrency: 1 },
  );
  campaignDispatchWorker.on('failed', (job, err) => {
    console.error('[campaign-dispatch] failed', job?.id, err.message);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.CAMPAIGN_DISPATCH });
  });

  const browseAbandonmentWorker = new Worker(
    QUEUE_NAMES.BROWSE_ABANDONMENT,
    async (job) => {
      const r = (await post('/api/v1/internal/browse-abandonment/tick')) as {
        data?: { orgs: number; fired: number };
      };
      if (r.data?.fired) job.log(`Browse-abandonment fired ${r.data.fired} (${r.data.orgs} orgs)`);
    },
    { connection, concurrency: 1 },
  );
  browseAbandonmentWorker.on('failed', (job, err) => {
    console.error('[browse-abandonment] failed', job?.id, err.message);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.BROWSE_ABANDONMENT });
  });

  const scheduledReportsWorker = new Worker(
    QUEUE_NAMES.SCHEDULED_REPORTS,
    async (job) => {
      const r = (await post('/api/v1/internal/scheduled-reports/run-due')) as {
        data?: { dispatched: number };
      };
      if (r.data?.dispatched) job.log(`Dispatched ${r.data.dispatched} scheduled reports`);
    },
    { connection, concurrency: 1 },
  );
  scheduledReportsWorker.on('failed', (job, err) => {
    console.error('[scheduled-reports] failed', job?.id, err.message);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.SCHEDULED_REPORTS });
  });

  const segmentMembershipWorker = new Worker(
    QUEUE_NAMES.SEGMENT_MEMBERSHIP,
    async (job) => {
      const r = (await post('/api/v1/internal/segments/refresh-membership')) as {
        data?: { segments: number; entered: number; exited: number };
      };
      if (r.data && (r.data.entered || r.data.exited)) {
        job.log(
          `Segments: ${r.data.entered} entered, ${r.data.exited} exited (${r.data.segments})`,
        );
      }
    },
    { connection, concurrency: 1 },
  );
  segmentMembershipWorker.on('failed', (job, err) => {
    console.error('[segment-membership] failed', job?.id, err.message);
    captureJobException(err, { jobId: job?.id, queue: QUEUE_NAMES.SEGMENT_MEMBERSHIP });
  });

  return {
    resumeWorker,
    dailyWorker,
    warehouseWorker,
    clickhouseWorker,
    ticketingDayOfWorker,
    ticketingFillHouseWorker,
    ticketingDiscoverWorker,
    campaignDispatchWorker,
    browseAbandonmentWorker,
    scheduledReportsWorker,
    segmentMembershipWorker,
  };
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
  if (!(await ticketingDayOfQueue.getJob('ticketing-day-of'))) {
    await ticketingDayOfQueue.add(
      'tick',
      {},
      {
        jobId: 'ticketing-day-of',
        repeat: { pattern: '* * * * *' },
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      },
    );
    console.log('[workflow-scheduler] ticketing-day-of scheduled (every minute)');
  }
  if (!(await ticketingFillHouseQueue.getJob('ticketing-fill-house'))) {
    await ticketingFillHouseQueue.add(
      'tick',
      {},
      {
        jobId: 'ticketing-fill-house',
        repeat: { pattern: '0 10 * * *' },
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
    console.log('[workflow-scheduler] ticketing-fill-house scheduled (10:00 daily)');
  }
  if (!(await ticketingDiscoverQueue.getJob('ticketing-discover'))) {
    await ticketingDiscoverQueue.add(
      'tick',
      {},
      {
        jobId: 'ticketing-discover',
        repeat: { pattern: '0 9 * * 1' },
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
    console.log('[workflow-scheduler] ticketing-discover scheduled (Mon 09:00)');
  }
  if (!(await campaignDispatchQueue.getJob('campaign-dispatch'))) {
    await campaignDispatchQueue.add(
      'tick',
      {},
      {
        jobId: 'campaign-dispatch',
        repeat: { pattern: '* * * * *' },
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      },
    );
    console.log('[workflow-scheduler] campaign-dispatch scheduled (every minute)');
  }
  if (!(await campaignDispatchQueue.getJob('campaign-reap-stalled'))) {
    // Hourly, not every minute: it only ever acts on campaigns that have been
    // silent for a day, so checking sixty times more often would find the same
    // nothing sixty times more often.
    await campaignDispatchQueue.add(
      'reap',
      {},
      {
        jobId: 'campaign-reap-stalled',
        repeat: { pattern: '17 * * * *' },
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      },
    );
    console.log('[workflow-scheduler] campaign-reap-stalled scheduled (hourly)');
  }
  // browse-abandonment posts to a beyond-core internal route; scheduling it
  // with that route unregistered would 404 every 15 minutes. See
  // config/env.ts FEATURE_BEYOND_CORE.
  if (env.FEATURE_BEYOND_CORE && !(await browseAbandonmentQueue.getJob('browse-abandonment'))) {
    await browseAbandonmentQueue.add(
      'tick',
      {},
      {
        jobId: 'browse-abandonment',
        repeat: { pattern: '*/15 * * * *' },
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      },
    );
    console.log('[workflow-scheduler] browse-abandonment scheduled (every 15 min)');
  }
  if (!(await scheduledReportsQueue.getJob('scheduled-reports'))) {
    await scheduledReportsQueue.add(
      'run',
      {},
      {
        jobId: 'scheduled-reports',
        repeat: { pattern: '5 * * * *' },
        removeOnComplete: true,
        removeOnFail: { count: 5 },
      },
    );
    console.log('[workflow-scheduler] scheduled-reports scheduled (hourly at :05)');
  }
  if (!(await segmentMembershipQueue.getJob('segment-membership'))) {
    await segmentMembershipQueue.add(
      'refresh',
      {},
      {
        jobId: 'segment-membership',
        repeat: { pattern: '*/5 * * * *' },
        removeOnComplete: true,
        removeOnFail: { count: 10 },
      },
    );
    console.log('[workflow-scheduler] segment-membership scheduled (every 5 min)');
  }
}
