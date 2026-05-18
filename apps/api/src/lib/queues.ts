/**
 * BullMQ queue clients used by the API to enqueue workflow jobs.
 * Workers in apps/workers consume these queues.
 */

import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parsed.pathname ? parseInt(parsed.pathname.slice(1) || '0', 10) : 0,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const connection = parseRedisUrl(REDIS_URL);

const queueOpts = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
};

export const emailQueue = new Queue('email', queueOpts);
export const smsQueue = new Queue('sms', queueOpts);
export const webhookQueue = new Queue('webhook', queueOpts);

/** Convenience map used by workflow actions */
export const queues = {
  email: emailQueue,
  sms: smsQueue,
  webhook: webhookQueue,
};
