/**
 * Job options for re-enqueuing a message that was deferred rather than failed.
 *
 * The adaptive ISP throttle defers a message by putting it back on its own
 * queue with a delay. That used to go through an ad-hoc
 * `new Queue(name, { connection })` with no `defaultJobOptions`, and BullMQ's
 * own default is `attempts: 0`:
 *
 *   bullmq/dist/cjs/classes/job.js:85    attempts: 0,
 *   bullmq/dist/cjs/classes/job.js:484   if (this.attemptsMade + 1 < this.opts.attempts && …)
 *
 * `0 + 1 < 0` is false, so the re-enqueued message had no retries at all. A
 * message the throttle had touched even once lost the 31-minute window the MTA
 * queues are configured with, and the next 4xx — a greylist, typically — ended
 * it.
 *
 * Deferring is not failing. A message that is put back must come back with the
 * policy it arrived with, so this copies the ORIGINAL JOB's options rather than
 * re-deriving them from the queue: if a producer set something for this
 * specific message, the deferral keeps it.
 *
 * This lives on its own, away from the queue graph, so it can be tested without
 * a Redis connection.
 */

/** The parts of a BullMQ job this needs. Narrow on purpose — it is a pure function. */
export interface RequeueSource {
  opts: {
    attempts?: number;
    backoff?: number | { type: string; delay?: number };
    priority?: number;
  };
}

export interface RequeueOptions {
  delay: number;
  priority?: number;
  attempts?: number;
  backoff?: number | { type: string; delay?: number };
}

/**
 * Options for putting `job` back on its queue after `delayMs`.
 *
 * `attempts` and `backoff` are carried over verbatim. They are only omitted
 * when the source job genuinely had none, which is the one case where there is
 * nothing to preserve.
 */
export function throttleRequeueOptions(
  job: RequeueSource,
  delayMs: number,
  priority?: number,
): RequeueOptions {
  const out: RequeueOptions = { delay: delayMs };
  if (priority !== undefined) out.priority = priority;
  if (job.opts.attempts !== undefined) out.attempts = job.opts.attempts;
  if (job.opts.backoff !== undefined) out.backoff = job.opts.backoff;
  return out;
}
