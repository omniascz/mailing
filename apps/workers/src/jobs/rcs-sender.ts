/**
 * RCS sender worker — consumes the 'rcs-send' queue, dispatches each message to
 * the configured RCS provider (Sinch), and writes the delivery status back.
 * Before this, services/rcs/index.ts only inserted a DB row and nothing ever
 * sent it.
 */
import { Worker, type Job } from 'bullmq';
import { connection } from '../queues/index.js';
import { captureJobException } from '../lib/telemetry.js';

interface RcsSendJob {
  messageId: string;
  orgId: string;
  phone: string;
  messageType: string;
  payload: Record<string, unknown>;
  provider?: string | null;
}

async function processRcsSend(job: Job<RcsSendJob>) {
  const d = job.data;
  const [{ resolveRcsProvider, sendRcs }, { updateStatus }] = await Promise.all([
    import('../../../api/src/services/rcs/providers/index.js'),
    import('../../../api/src/services/rcs/index.js'),
  ]);

  const provider = resolveRcsProvider(d.provider);
  const result = await sendRcs(provider, d.phone, d.messageType, d.payload as never);

  if (result.status === 'sent') {
    await updateStatus(d.messageId, 'sent', { providerId: result.providerId });
    return { messageId: d.messageId, providerId: result.providerId };
  }
  await updateStatus(d.messageId, 'failed', { error: result.error });
  throw new Error(result.error ?? 'RCS send failed');
}

export function startRcsSenderWorker() {
  const worker = new Worker<RcsSendJob>('rcs-send', processRcsSend, {
    connection,
    concurrency: 10,
    limiter: { max: 50, duration: 1000 },
  });
  worker.on('failed', (job, err) => {
    console.error(`[rcs-sender] ${job?.id} failed: ${err.message}`);
    captureJobException(err, { jobId: job?.id, queue: 'rcs-send' });
  });
  return worker;
}
