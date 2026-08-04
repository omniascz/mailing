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
