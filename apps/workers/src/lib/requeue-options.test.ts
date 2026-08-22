import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { throttleRequeueOptions } from './requeue-options.js';

/**
 * A message deferred by the adaptive throttle must come back with the retry
 * policy it arrived with.
 *
 * It did not. The deferral went through `new Queue(name, { connection })` and
 * passed only `{ delay, priority }`, so the re-enqueued job had no `attempts`
 * and BullMQ's default applies:
 *
 *   job.js:85    attempts: 0,
 *   job.js:484   if (this.attemptsMade + 1 < this.opts.attempts && …)
 *
 * `0 + 1 < 0` is false — no retry. The MTA queues are configured with 6
 * attempts over 31 minutes precisely to outlast greylisting, and one touch from
 * the throttle removed all of it.
 */

/** A job as it arrives on an MTA queue: mtaOpts applied at add time. */
const mtaJob = {
  opts: { attempts: 6, backoff: { type: 'exponential', delay: 60_000 }, priority: 3 },
};

describe('throttleRequeueOptions', () => {
  it('keeps a retry allowance greater than one', () => {
    const opts = throttleRequeueOptions(mtaJob, 60_000, 3);
    expect(
      opts.attempts,
      'a deferred message with attempts <= 1 is dropped by the next 4xx',
    ).toBeGreaterThan(1);
  });

  it('carries the original attempts and backoff verbatim', () => {
    expect(throttleRequeueOptions(mtaJob, 60_000, 3)).toEqual({
      delay: 60_000,
      priority: 3,
      attempts: 6,
      backoff: { type: 'exponential', delay: 60_000 },
    });
  });

  it('applies the deferral delay, not the backoff delay', () => {
    // The throttle defers for a fixed minute; the backoff belongs to the next
    // genuine failure, not to this hand-off.
    expect(throttleRequeueOptions(mtaJob, 60_000, 3).delay).toBe(60_000);
    expect(throttleRequeueOptions(mtaJob, 5_000, 3).delay).toBe(5_000);
  });

  it('preserves a per-message override rather than re-deriving from the queue', () => {
    const overridden = { opts: { attempts: 2, backoff: { type: 'fixed', delay: 1000 } } };
    const opts = throttleRequeueOptions(overridden, 60_000);
    expect(opts.attempts).toBe(2);
    expect(opts.backoff).toEqual({ type: 'fixed', delay: 1000 });
  });

  it('omits what the source job genuinely did not have', () => {
    expect(throttleRequeueOptions({ opts: {} }, 60_000)).toEqual({ delay: 60_000 });
  });
});

describe('the send path constructs no options-less queue', () => {
  // Source-level, because the wiring cannot be exercised without Redis. It
  // pins the one thing that made the bug possible: an ad-hoc Queue on the
  // path a deferred message travels.
  const senderSrc = readFileSync(
    join(fileURLToPath(new URL('.', import.meta.url)), '..', 'jobs', 'mta-sender.ts'),
    'utf8',
  );

  it('mta-sender builds no Queue of its own', () => {
    expect(
      senderSrc.includes('new Queue('),
      'a Queue built here carries no defaultJobOptions — use getMtaQueueByName',
    ).toBe(false);
  });

  it('mta-sender requeues through the canonical queue with carried options', () => {
    expect(senderSrc).toContain('getMtaQueueByName(job.queueName).add(');
    expect(senderSrc).toContain('throttleRequeueOptions(job, THROTTLE_REQUEUE_DELAY_MS');
  });
});
