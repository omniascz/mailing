/**
 * How long to wait before retrying a send, by what the message is for.
 *
 * One ladder for everything was wrong in both directions. 6 attempts from 60 s
 * — 60 + 120 + 240 + 480 + 960 = 31 minutes — was chosen to outlast
 * greylisting, which is minutes-scale and standard at Czech providers. That is
 * right for a password reset and much too short for a newsletter, where the
 * alternative to waiting two hours is not delivering at all.
 *
 * The stream is already on the payload, so the ladder can just read it.
 *
 *   transactional — someone is waiting for this. A password reset, an order
 *                   confirmation, a one-time code. Value decays fast: delivered
 *                   an hour late it is a support ticket, and the link may
 *                   already have expired. Keep the 31-minute window that
 *                   clears greylisting and stop.
 *
 *   triggered     — automation: a welcome mail, an abandoned-cart nudge. Timely
 *                   matters but nobody is staring at an inbox. Roughly two
 *                   hours, which covers an ISP throttling us for a while
 *                   without arriving so late the trigger has lost its meaning.
 *
 *   broadcast     — a campaign. Nothing is waiting on it and the failure modes
 *                   are greylisting and rate limiting, both of which clear with
 *                   time. Almost five hours. Deliberately NOT a day: the
 *                   per-contact timewarp scheduling in the same payload picks a
 *                   local hour to arrive at, and a 24-hour tail lands the
 *                   message at the wrong one, which defeats the point of having
 *                   scheduled it.
 *
 * All three keep 6 attempts, so `attempts` stays a single number in mtaOpts and
 * only the spacing differs.
 */
export type MessageStream = 'broadcast' | 'transactional' | 'triggered';

/** Delay in ms before attempt n+1, indexed by the retry number (1-based). */
const LADDERS: Record<MessageStream, readonly number[]> = {
  // 31 minutes total — unchanged from the single ladder it replaces.
  transactional: [60_000, 120_000, 240_000, 480_000, 960_000],
  // ~2 hours: 2m, 6m, 18m, 36m, 60m.
  triggered: [120_000, 360_000, 1_080_000, 2_160_000, 3_600_000],
  // ~4.75 hours: 5m, 15m, 45m, 90m, 120m.
  broadcast: [300_000, 900_000, 2_700_000, 5_400_000, 7_200_000],
};

/** Total wall-clock a stream's ladder spans, for tests and documentation. */
export function ladderTotalMs(stream: MessageStream): number {
  return LADDERS[stream].reduce((a, b) => a + b, 0);
}

/**
 * BullMQ custom backoff. It calls this with `attemptsMade + 1`, so the first
 * retry arrives as 1 (verified against bullmq 5.73.4, classes/job.js:488).
 *
 * An unknown stream falls back to `broadcast`: waiting too long is recoverable,
 * giving up early is not.
 */
export function streamBackoff(attemptsMade: number, stream: string | undefined): number {
  const ladder =
    LADDERS[(stream as MessageStream) in LADDERS ? (stream as MessageStream) : 'broadcast'];
  const idx = Math.max(0, attemptsMade - 1);
  return ladder[Math.min(idx, ladder.length - 1)]!;
}
