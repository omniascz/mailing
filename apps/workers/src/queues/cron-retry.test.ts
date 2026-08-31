/**
 * Every scheduled queue carries a retry decision, and it is the right one.
 *
 * These queues are BUILT here, not described. `new Queue()` needs no reachable
 * Redis to construct — measured: with nothing listening on the port, the
 * constructor returns, `defaultJobOptions` reads back exactly what was passed,
 * and `close()` resolves. So this is a unit test and the unit suite stays
 * infrastructure-free.
 *
 * The bug being guarded: `new Queue(name, { connection })` carries no
 * `defaultJobOptions`, bullmq 5.73.4 defaults `attempts` to 0, and its retry
 * check is `attemptsMade + 1 < opts.attempts` — `0 + 1 < 0`, false. A failed
 * cron never runs again and the schedule carries on as if it had.
 *
 * WHAT THIS TEST CANNOT SEE
 *  - It never runs a job. It proves the policy a queue was built with, not
 *    that bullmq honours it, and not that the job itself works.
 *  - `attempts: 1` and `attempts: 0` behave identically at runtime (one run,
 *    no retry). This test can tell them apart only because 1 is written down;
 *    it is checking that somebody decided, not that retries happen. The
 *    'once' profile is deliberately in that position — see CRON_PROFILE.
 *  - Job options passed per `add()` override these. workflow-scheduler passes
 *    its own `removeOnComplete`/`removeOnFail`; if it ever passed `attempts`,
 *    that would win and this file would not notice.
 *  - It says nothing about whether a job is safe to retry. That verdict is
 *    prose in CRON_PROFILE, backed by reading the endpoint each job calls.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { Queue } from 'bullmq';
import {
  CRON_QUEUE_NAMES,
  CRON_RETRY,
  QUEUE_NAMES,
  cronProfileOf,
  cronQueue,
  type CronRetryProfile,
} from './index.js';

const built: Queue[] = [];
function build(name: (typeof CRON_QUEUE_NAMES)[number]): Queue {
  const q = cronQueue(name) as Queue;
  built.push(q);
  return q;
}

afterAll(async () => {
  await Promise.all(built.map((q) => q.close().catch(() => {})));
});

describe('the retry profiles themselves', () => {
  it('every profile sets attempts explicitly, and never to zero', () => {
    for (const [name, profile] of Object.entries(CRON_RETRY)) {
      expect(profile.attempts, `${name} has no attempts`).toBeTypeOf('number');
      expect(profile.attempts, `${name} would never run`).toBeGreaterThanOrEqual(1);
    }
  });

  it('frequent retries once, soon enough not to overlap a 30 s schedule', () => {
    // video-transcode runs every 30 s and is the shortest schedule on these
    // queues; a retry that outlived the tick would run two sweeps at once.
    expect(CRON_RETRY.frequent.attempts).toBe(2);
    expect(CRON_RETRY.frequent.backoff?.delay).toBeLessThan(30_000);
  });

  it('sparse spans at least the 7¾ minutes a rolling API restart needs', () => {
    // BROADCAST_RETRY in this module records 465 s for that. The sparse ladder
    // is computed here rather than asserted as a literal, so changing the
    // delay or the attempt count re-checks the property instead of the number.
    const { attempts, backoff } = CRON_RETRY.sparse;
    const delay = backoff!.delay;
    let total = 0;
    for (let i = 0; i < attempts - 1; i++) total += delay * 2 ** i;
    expect(total).toBeGreaterThanOrEqual(465_000);
    // ...and stays inside the shortest schedule in the sparse group (hourly).
    expect(total).toBeLessThan(3_600_000);
  });

  it('once means one run, written down rather than defaulted', () => {
    expect(CRON_RETRY.once.attempts).toBe(1);
    expect(CRON_RETRY.once.backoff).toBeUndefined();
  });
});

describe('every scheduled queue', () => {
  it('there are as many as the job files build', () => {
    // A floor, not an equality: adding a cron should not have to edit this
    // number, but silently losing twenty of them should be loud.
    expect(CRON_QUEUE_NAMES.length).toBeGreaterThanOrEqual(25);
  });

  it.each(CRON_QUEUE_NAMES.map((n) => [n] as const))(
    '%s is built with a non-zero attempts',
    (name) => {
      const q = build(name);
      const opts = q.opts.defaultJobOptions;
      expect(opts, `${name} has no defaultJobOptions — bullmq will use attempts: 0`).toBeDefined();
      expect(opts?.attempts, `${name} has attempts: ${opts?.attempts}`).toBeGreaterThanOrEqual(1);
    },
  );

  it.each(CRON_QUEUE_NAMES.map((n) => [n] as const))(
    '%s is built with exactly the profile it was assigned',
    (name) => {
      const profile = cronProfileOf(name) as CronRetryProfile;
      const q = build(name);
      expect(q.opts.defaultJobOptions?.attempts).toBe(CRON_RETRY[profile].attempts);
      expect(q.opts.defaultJobOptions?.backoff).toEqual(CRON_RETRY[profile].backoff);
    },
  );

  it('keeps the shared retention, so a cron queue is not half configured', () => {
    const q = build(QUEUE_NAMES.WARMUP_ADVANCE);
    expect(q.opts.defaultJobOptions?.removeOnComplete).toBeDefined();
    expect(q.opts.defaultJobOptions?.removeOnFail).toBeDefined();
  });
});

describe('the queues whose verdict is load-bearing', () => {
  it('invoice-reminder does not retry — sendDueReminders re-sends', () => {
    // The one 'once' in the table. If this flips to a retrying profile, a
    // customer gets a second copy of a payment reminder.
    expect(cronProfileOf(QUEUE_NAMES.INVOICE_REMINDER)).toBe('once');
    expect(build(QUEUE_NAMES.INVOICE_REMINDER).opts.defaultJobOptions?.attempts).toBe(1);
  });

  it('ad-perf-sync DOES retry, though it shares a file with invoice-reminder', () => {
    // Same job module, opposite verdict: syncAdPerformance inserts with
    // onConflictDoNothing. Pinned so nobody "tidies" the two into one profile.
    expect(cronProfileOf(QUEUE_NAMES.AD_PERF_SYNC)).toBe('sparse');
  });

  it('warmup-advance retries, because a night it misses is a day the IP loses', () => {
    expect(cronProfileOf(QUEUE_NAMES.WARMUP_ADVANCE)).toBe('sparse');
    expect(build(QUEUE_NAMES.WARMUP_ADVANCE).opts.defaultJobOptions?.attempts).toBe(
      CRON_RETRY.sparse.attempts,
    );
  });

  it('the every-minute sweeps take the short window, not the long one', () => {
    for (const name of [
      QUEUE_NAMES.WORKFLOW_RUN_RESUME,
      QUEUE_NAMES.CAMPAIGN_DISPATCH,
      QUEUE_NAMES.SOCIAL_PUBLISH,
      QUEUE_NAMES.CLICKHOUSE_REPLICATE,
    ] as const) {
      expect(cronProfileOf(name), `${name}`).toBe('frequent');
    }
  });
});

describe('a queue with no verdict cannot be built', () => {
  it('throws, naming the queue and what to do about it', () => {
    // MTA queues have their own policy and are not in CRON_PROFILE, which
    // makes one a convenient stand-in for "a name nobody classified".
    expect(() => cronQueue(QUEUE_NAMES.MTA_GMAIL)).toThrow(/no retry profile/i);
    expect(() => cronQueue(QUEUE_NAMES.MTA_GMAIL)).toThrow(/CRON_PROFILE/);
  });

  it('does not throw for a queue that has one', () => {
    // The other half of the pair: a guard that always throws proves nothing.
    expect(() => build(QUEUE_NAMES.WARMUP_ADVANCE)).not.toThrow();
  });
});
