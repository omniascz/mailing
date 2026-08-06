/**
 * How many times BullMQ actually re-runs a stopped batch.
 *
 * The retry window exists so an ordinary API restart does not cost a
 * campaign: the protective filters stop the batch, and the window has to be
 * long enough for the API to come back before the attempts run out. That
 * makes the window a real trade-off rather than a number in a config file —
 * long enough to survive a deploy, short enough that a permanent fault is not
 * discovered eight minutes late.
 *
 * So both directions are asserted by counting real attempts through a real
 * queue and a real worker: a transient fault uses the whole allowance, and a
 * permanent one uses exactly one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Queue, Worker, UnrecoverableError } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { connection } from '../queues/index.js';
import {
  throwIfPermanentFailure,
  asFilterError,
  InternalFilterError,
  PermanentFilterError,
} from '../lib/internal-api.js';

const QUEUE = `retry-window-probe-${randomUUID().slice(0, 8)}`;

let server: http.Server;
let status = 500;
let hits = 0;

/** A stand-in for one protective filter: calls the API, throws on non-2xx. */
async function protectiveFilter(apiUrl: string): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/api/v1/internal/suppressions/check-batch`);
    throwIfPermanentFailure(res, '/internal/suppressions/check-batch', 'org-probe');
  } catch (err) {
    throw asFilterError(err, '/internal/suppressions/check-batch', 'org-probe');
  }
}

describe('batch-sender retry window (real queue + worker)', () => {
  let apiUrl: string;
  let queue: Queue;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      hits++;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    queue = new Queue(QUEUE, { connection });
    await queue.obliterate({ force: true }).catch(() => {});
  }, 60_000);

  afterAll(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  /** Run one job to completion or exhaustion and report how many attempts ran. */
  async function runToEnd(attempts: number, delayMs: number): Promise<number> {
    hits = 0;
    const worker = new Worker(QUEUE, async () => protectiveFilter(apiUrl), {
      connection,
      concurrency: 1,
    });
    await worker.waitUntilReady();

    const job = await queue.add(
      'probe',
      {},
      { attempts, backoff: { type: 'fixed', delay: delayMs }, removeOnFail: false },
    );

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const state = await job.getState();
      if (state === 'failed' || state === 'completed') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const made = (await queue.getJob(job.id!))?.attemptsMade ?? 0;
    await worker.close();
    return made;
  }

  it('classifies a 500 as retryable and a 403 as not', () => {
    // The classification the counts below depend on. Asserted directly so a
    // wrong count downstream is not mistaken for a queue problem.
    const transient = new InternalFilterError('/x', 503, 'org', 'transient');
    const permanent = new InternalFilterError('/x', 403, 'org', 'permanent');
    expect(transient.permanent).toBe(false);
    expect(permanent.permanent).toBe(true);
    expect(new PermanentFilterError(permanent)).toBeInstanceOf(UnrecoverableError);
  });

  it('uses every attempt on a transient failure', async () => {
    status = 503;
    // Short fixed backoff so the test does not wait out the production
    // 15/30/60/120/240 s schedule; that schedule is arithmetic on BullMQ's
    // own formula, while what needs proving here is that all six run.
    const made = await runToEnd(6, 50);
    expect(made).toBe(6);
    expect(hits, 'the API is called once per attempt').toBe(6);
  }, 60_000);

  it('gives up after ONE attempt on a permanent failure', async () => {
    status = 403;
    const made = await runToEnd(6, 50);
    expect(made, 'a rejected secret must not burn the whole window').toBe(1);
    expect(hits).toBe(1);
  }, 60_000);

  it('also gives up immediately on a 400', async () => {
    status = 400;
    const made = await runToEnd(6, 50);
    expect(made).toBe(1);
  }, 60_000);

  it('succeeds without retrying once the API answers', async () => {
    status = 200;
    const made = await runToEnd(6, 50);
    expect(made).toBe(1);
  }, 60_000);

  it('the configured windows match what each queue is for', async () => {
    // Cheap regression on the numbers themselves: they encode decisions
    // (deploy length, greylist delay, how long a person waits for a reset)
    // that are easy to change by accident and hard to notice when wrong.
    const { batchSenderQueues, mtaQueues, campaignSplitterQueue } =
      await import('../queues/index.js');
    const opts = (q: Queue) => (q.defaultJobOptions ?? {}) as Record<string, unknown>;

    expect(opts(batchSenderQueues.broadcast)).toMatchObject({
      attempts: 6,
      backoff: { type: 'exponential', delay: 15_000 },
    });
    expect(opts(batchSenderQueues.triggered)).toMatchObject({ attempts: 6 });
    // Transactional stays short on purpose — a late password reset is a
    // failed password reset.
    expect(opts(batchSenderQueues.transactional)).toMatchObject({
      attempts: 6,
      backoff: { type: 'exponential', delay: 2000 },
    });
    // Long enough to outlast greylisting.
    expect(opts(mtaQueues.gmail)).toMatchObject({
      attempts: 6,
      backoff: { type: 'exponential', delay: 60_000 },
    });
    // Deliberately NOT widened: the splitter is not idempotent, so every
    // extra attempt is another chance to enqueue a duplicate campaign.
    expect(opts(campaignSplitterQueue)).toMatchObject({ attempts: 3 });
  });
});
