/**
 * Worker-side client for the dispatch ledger.
 *
 * Workers have no database connection, so "what have I already enqueued?" is a
 * question only the API can answer. The two calls wrap the internal endpoints
 * that back `campaign_dispatch_batches`.
 *
 * Both throw on failure, and that is the intended behaviour: a splitter that
 * cannot reach the ledger must not fall through and enqueue anyway, because
 * enqueuing without a record is exactly the state that produced duplicate
 * campaigns in the first place.
 */
import { INTERNAL_SECRET, internalGetHeaders } from './internal-api.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface ClaimResult {
  toEnqueue: string[];
  alreadyEnqueued: string[];
}

/**
 * The identity of one send attempt.
 *
 * `job.id` alone is not enough: the splitter schedules the winner job with a
 * fixed `jobId` of `ab-winner-${campaignId}`, so two genuine winner dispatches
 * for the same campaign would share it. `job.timestamp` is stamped when the
 * job is created and does not change between attempts, so the pair is stable
 * across a retry and distinct for every fresh enqueue — which is the exact
 * line we need idempotency to fall on.
 */
export function dispatchIdOf(job: { id?: string | null; timestamp?: number }): string {
  return `${job.id ?? 'noid'}:${job.timestamp ?? 0}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { ...internalGetHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return ((await res.json()) as { data: T }).data;
}

/** Reserve batch keys. Enqueue only what comes back in `toEnqueue`. */
export async function claimDispatchBatches(
  campaignId: string,
  orgId: string,
  dispatchId: string,
  keys: string[],
): Promise<ClaimResult> {
  if (keys.length === 0) return { toEnqueue: [], alreadyEnqueued: [] };
  if (!INTERNAL_SECRET) {
    throw new Error(
      'INTERNAL_SECRET is not set — cannot reach the dispatch ledger, refusing to enqueue ' +
        'batches that would not be recorded as sent.',
    );
  }
  return post<ClaimResult>(`/api/v1/internal/campaigns/${campaignId}/dispatch-batches/claim`, {
    orgId,
    dispatchId,
    keys,
  });
}

/** Record that `addBulk` returned for these keys. */
export async function confirmDispatchBatches(
  campaignId: string,
  dispatchId: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  await post(`/api/v1/internal/campaigns/${campaignId}/dispatch-batches/confirm`, {
    dispatchId,
    keys,
  });
}
