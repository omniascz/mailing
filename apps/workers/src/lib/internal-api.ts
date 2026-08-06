/**
 * Shared secret for calls into the API's /api/v1/internal/* routes.
 *
 * INTERNAL_API_SECRET, and nothing else. Two names used to be in circulation
 * and the fallback that bridged them is gone: a second name is only ever a way
 * for the two sides to end up comparing different values, which is precisely
 * what happened — the API's hand-written checks read the other one and
 * answered 401 to every worker.
 *
 * An empty value here still reaches the API, which rejects it. That is the
 * intended failure: loud at the boundary rather than a client that quietly
 * decides not to authenticate.
 */
export const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? '';

/** Headers for a JSON POST/PATCH to an internal route. */
export function internalHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET };
}

/** Headers for a GET to an internal route (no body, so no content type). */
export function internalGetHeaders(): Record<string, string> {
  return { 'x-internal-secret': INTERNAL_SECRET };
}

import { UnrecoverableError } from 'bullmq';

/**
 * A call into the internal API did not return an answer we can act on.
 *
 * The filters in the send path used to fail OPEN on this: no answer meant an
 * empty list, an empty list meant nobody was filtered, and the batch went out
 * with suppression, frequency capping, holdout and GDPR consent silently
 * disabled. That is the wrong default for a rule whose whole job is to stop a
 * send, so the protective filters now stop the batch instead.
 *
 * Carries the org and the route because a stopped batch that says only
 * "request failed" is a support ticket nobody can answer.
 */
export class InternalFilterError extends Error {
  /** True when retrying cannot change the answer. */
  readonly permanent: boolean;

  readonly status: number | undefined;
  readonly path: string;
  readonly orgId: string | undefined;

  constructor(path: string, status: number | undefined, orgId: string | undefined, detail: string) {
    super(
      `Internal API call failed on ${path}` +
        (orgId ? ` for org ${orgId}` : '') +
        (status === undefined ? '' : ` (HTTP ${status})`) +
        `. ${detail} Stopping the batch — continuing would send with this filter ` +
        `silently disabled.`,
    );
    this.name = 'InternalFilterError';
    this.status = status;
    this.path = path;
    this.orgId = orgId;
    this.permanent = status !== undefined && isPermanentStatus(status);
  }
}

/**
 * A permanent failure, in the shape BullMQ stops retrying on.
 *
 * The retry window is 7¾ minutes because a transient outage deserves it. A
 * 403 does not: the secret will not start matching, and spending six attempts
 * and eight minutes to find that out delays the campaign and hides the real
 * problem behind a queue that looks merely slow. UnrecoverableError makes
 * BullMQ mark the job failed on the first attempt.
 *
 * It cannot extend InternalFilterError as well — JavaScript has no multiple
 * inheritance — so it carries the same fields and `isFilterFailure` below
 * recognises both.
 */
export class PermanentFilterError extends UnrecoverableError {
  readonly status: number | undefined;
  readonly path: string;
  readonly orgId: string | undefined;
  readonly permanent = true;

  constructor(source: InternalFilterError) {
    super(source.message);
    this.name = 'PermanentFilterError';
    this.status = source.status;
    this.path = source.path;
    this.orgId = source.orgId;
  }
}

/** Either shape of filter failure — the retryable one or the terminal one. */
export function isFilterFailure(err: unknown): err is InternalFilterError | PermanentFilterError {
  return err instanceof InternalFilterError || err instanceof PermanentFilterError;
}

/** Turn a permanent filter failure into the error BullMQ will not retry. */
export function toBullError(err: InternalFilterError): Error {
  return err.permanent ? new PermanentFilterError(err) : err;
}

/**
 * The API rejected our shared secret.
 *
 * A subtype so the 401/403 story keeps its own wording and anything catching
 * InternalAuthError specifically still works, while everything that now
 * catches InternalFilterError catches this too.
 */
export class InternalAuthError extends InternalFilterError {
  constructor(path: string, status: number, orgId?: string) {
    super(path, status, orgId, '');
    // Keep the original wording verbatim. The 401/403 behaviour predates this
    // change and must not shift — including what an operator greps for, and
    // what the existing auth-failure test asserts on.
    this.message =
      `Internal API rejected our credentials (${status}) on ${path}` +
      (orgId ? ` for org ${orgId}` : '') +
      `. INTERNAL_API_SECRET does not match the API's. Refusing to continue — ` +
      `failing open here would disable every send-path filter.`;
    this.name = 'InternalAuthError';
  }
}

/** 4xx that means "later", not "no". Everything else in 4xx is our fault. */
const RETRYABLE_CLIENT_STATUSES = new Set([408, 429]);

/**
 * Is this status one that will still be wrong on the next attempt?
 *
 * Same split the webhook delivery worker uses: a 4xx means the far end
 * understood us and refused, and repeating it changes nothing. 408 and 429 are
 * the two that explicitly mean "later".
 */
export function isPermanentStatus(status: number): boolean {
  return status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status);
}

/**
 * Call immediately after an internal fetch, before any fail-open branch.
 *
 * Throws on ANY non-2xx. That is deliberate for the protective filters: the
 * distinction between a permanent and a transient fault decides how loud the
 * message is, not whether the batch stops. A transient fault stops it too,
 * because BullMQ will retry the whole job — and if the API is still down when
 * the retries run out, the batch must not have gone out in the meantime.
 *
 * `throwIfAuthFailure` remains as a narrower alias for the callers that only
 * ever wanted the 401/403 behaviour.
 */
export function throwIfPermanentFailure(
  res: { status: number; ok?: boolean },
  path: string,
  orgId?: string,
): void {
  if (res.status === 401 || res.status === 403) {
    throw toBullError(new InternalAuthError(path, res.status, orgId));
  }
  if (res.status >= 200 && res.status < 300) return;

  throw toBullError(
    new InternalFilterError(
      path,
      res.status,
      orgId,
      isPermanentStatus(res.status)
        ? 'The API refused the request, and it will refuse it again.'
        : 'The API is unavailable; this may clear on retry.',
    ),
  );
}

/**
 * Unchanged behaviour for 401/403 only. Kept so callers that deliberately want
 * the narrow check — rather than the whole non-2xx policy — keep working.
 */
export function throwIfAuthFailure(res: { status: number }, path: string, orgId?: string): void {
  if (res.status === 401 || res.status === 403) {
    // Wrapped too: a rejected secret is permanent wherever it happens, and
    // burning the whole retry window on it would delay the campaign without
    // changing the outcome.
    throw toBullError(new InternalAuthError(path, res.status, orgId));
  }
}

/**
 * Call first inside a `catch` that would otherwise swallow into a fail-open
 * default, so a filter failure is not re-swallowed by the very handler the
 * fail-open policy needs. Covers InternalAuthError through the subtype.
 */
export function rethrowIfAuthError(err: unknown): void {
  if (isFilterFailure(err)) throw err;
}

/**
 * Wrap a transport-level failure — DNS, connection refused, TLS, timeout — so
 * a protective filter stops the batch for those too. There is no status to
 * classify, and "the API is unreachable" is exactly as bad for a filter as a
 * 500 from it.
 */
export function asFilterError(err: unknown, path: string, orgId?: string): Error {
  if (isFilterFailure(err)) return err as Error;
  const message = err instanceof Error ? err.message : String(err);
  return new InternalFilterError(path, undefined, orgId, `Transport failure: ${message}.`);
}
