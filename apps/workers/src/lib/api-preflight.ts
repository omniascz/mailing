/**
 * Boot preflight: the API must be reachable AND must accept our secret.
 *
 * Every read in this package goes through /api/v1/internal/*, and those calls
 * fail open on transient faults by design. That makes a misconfigured worker
 * silent: it starts, processes batches, and quietly skips suppression,
 * frequency capping, holdout and GDPR consent on every one of them. Nothing in
 * the logs says "the filters are off" — the sends just go out.
 *
 * So the check happens once, at boot, before a single job is consumed.
 */

import { INTERNAL_SECRET } from './internal-api.js';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Startup ordering is not guaranteed. docker-compose only has
 * `depends_on: api: { condition: service_healthy }`, and Kubernetes has no
 * ordering between Deployments at all — the workers pod routinely wins the
 * race. A connection refused is therefore expected during startup and is
 * retried; a 401 never is.
 */
const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3_000;

export interface PreflightOptions {
  apiUrl?: string;
  secret?: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  /** Injected in tests; defaults to a real sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export class PreflightAuthError extends Error {}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Resolves when the API is up and our secret works. Throws otherwise — the
 * caller is expected to exit the process.
 */
export async function assertApiReachable(opts: PreflightOptions = {}): Promise<void> {
  const apiUrl = opts.apiUrl ?? API_URL;
  const secret = opts.secret ?? INTERNAL_SECRET;
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const retryDelayMs = opts.retryDelayMs ?? RETRY_DELAY_MS;
  const sleep = opts.sleep ?? defaultSleep;

  let lastTransient = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      // Cheapest internal route that exercises the guard: an empty contactIds
      // array short-circuits before any query.
      res = await fetch(`${apiUrl}/api/v1/internal/holdout/check-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
        body: JSON.stringify({
          orgId: '00000000-0000-0000-0000-000000000000',
          contactIds: [],
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      // Not up yet, or the network blinked. Both are transient by definition.
      lastTransient = (err as Error).message;
      console.warn(
        `[preflight] API not reachable at ${apiUrl} (attempt ${attempt}/${maxAttempts}): ${lastTransient}`,
      );
      if (attempt < maxAttempts) await sleep(retryDelayMs);
      continue;
    }

    // A rejected secret is a configuration error. Retrying cannot fix it and
    // waiting 30s to say so only delays the message.
    if (res.status === 401 || res.status === 403) {
      throw new PreflightAuthError(
        `[preflight] API at ${apiUrl} rejected INTERNAL_API_SECRET (${res.status}). ` +
          `The worker and the API must share the same value. Not retrying — this ` +
          `is configuration, not a transient fault.`,
      );
    }

    if (res.ok) {
      console.log(`[preflight] API OK at ${apiUrl}, internal secret accepted.`);
      return;
    }

    lastTransient = `HTTP ${res.status}`;
    console.warn(
      `[preflight] API at ${apiUrl} answered ${res.status} (attempt ${attempt}/${maxAttempts}).`,
    );
    if (attempt < maxAttempts) await sleep(retryDelayMs);
  }

  throw new Error(
    `[preflight] API at ${apiUrl} did not become available after ${maxAttempts} attempts ` +
      `(${(maxAttempts * retryDelayMs) / 1000}s). Last failure: ${lastTransient}. ` +
      `Refusing to start: every internal read fails open, so running without the API ` +
      `would silently disable suppression, frequency capping, holdout and consent.`,
  );
}
