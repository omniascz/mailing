/**
 * Shared secret for calls into the API's /api/v1/internal/* routes.
 *
 * Two env names were already in use — most jobs read INTERNAL_SECRET, the API's
 * own schema declares INTERNAL_API_SECRET, and subscription-billing read both.
 * INTERNAL_API_SECRET is the one the API validates against, so it wins here;
 * INTERNAL_SECRET stays as a fallback so an existing deployment does not break
 * on the way through.
 */
export const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? process.env.INTERNAL_SECRET ?? '';

/** Headers for a JSON POST/PATCH to an internal route. */
export function internalHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET };
}

/** Headers for a GET to an internal route (no body, so no content type). */
export function internalGetHeaders(): Record<string, string> {
  return { 'x-internal-secret': INTERNAL_SECRET };
}

/**
 * The API rejected our shared secret.
 *
 * Distinct from every other failure on purpose. The internal fetches in this
 * package fail OPEN — a flaky API must not halt a send — but that posture is
 * only safe for *transient* faults. A 401 is not transient: it means this
 * worker's INTERNAL_API_SECRET does not match the API's, and it will not match
 * on the next contact either. Failing open on it would silently disable
 * suppression, frequency capping, holdout and GDPR consent for every batch,
 * which is the exact regression introduced by adding the auth guard.
 */
export class InternalAuthError extends Error {
  readonly status: number;
  constructor(path: string, status: number) {
    super(
      `Internal API rejected our credentials (${status}) on ${path}. ` +
        `INTERNAL_API_SECRET does not match the API's. Refusing to continue — ` +
        `failing open here would disable every send-path filter.`,
    );
    this.name = 'InternalAuthError';
    this.status = status;
  }
}

/**
 * Call immediately after every internal fetch, before the fail-open branch.
 * Turns 401/403 into a throw; every other status is left to the caller.
 */
export function throwIfAuthFailure(res: { status: number }, path: string): void {
  if (res.status === 401 || res.status === 403) {
    throw new InternalAuthError(path, res.status);
  }
}

/**
 * Call first inside a `catch` that would otherwise swallow into a fail-open
 * default, so the auth failure is not re-swallowed by the very handler the
 * transient-fault policy needs.
 */
export function rethrowIfAuthError(err: unknown): void {
  if (err instanceof InternalAuthError) throw err;
}
