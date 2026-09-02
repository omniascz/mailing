/**
 * GET routes that answer 5xx today and are NOT fixed in this PR.
 *
 * The list exists so the sweep can land green and start protecting the other
 * 618 routes immediately, rather than being merged disabled and forgotten.
 * Every entry says what actually throws, so triaging one is reading a line
 * rather than starting an investigation.
 *
 * Guarded in both directions:
 *
 *   - it cannot grow past MAX_KNOWN_5XX without someone editing that number
 *   - an entry that starts PASSING fails the test until it is deleted, so the
 *     list cannot quietly become a place where new regressions hide behind old
 *     ones
 *
 * Fixing any of these is a separate change. Nothing here is fixed in this PR by
 * instruction, and none of it is new work discovered late — six were already
 * known from the original probe.
 */

export const KNOWN_5XX: Record<string, string> = {
  // ── Drizzle passes an undefined value to the driver ──────────────────────
  //
  // Three entries lived here — /api/v1/ai-agents, /{id} and /{id}/runs, all
  // `UNDEFINED_VALUE: Undefined values are not allowed`. The undefined was
  // `orgId`, read off `request.orgId`, a property no plugin sets; those routes
  // also had no auth guard, which is the half the 500 was hiding. Both are
  // fixed in routes/v1/ai-agents.ts — the sweep now gets 401 for a request
  // without a session, and 200 with one. Removed rather than re-worded,
  // because the list fails the run when an entry starts passing.

  // ── Broken SQL that the EXPLAIN layers cannot reach ──────────────────────
  //
  // Three entries lived here and are fixed. Two loyalty routes wrote
  // `abs(sum(points)) FILTER (...)`, attaching FILTER to abs() rather than to
  // the sum() inside it — `FILTER specified, but abs is not an aggregate
  // function`, reproduced in psql. `/api/v1/analytics/cohorts` carried
  // `EXTRACT(EPOCH FROM INTERVAL ${interval})`, and INTERVAL does not take a
  // bind parameter, plus `GROUP BY offset` on a reserved word. Both classes are
  // invisible to the EXPLAIN layers: layer 1 sees fragments rather than whole
  // statements, and layer 2 correctly passes non-schema faults through.

  // `syntax error at or near "null"` in the external_feeds select.
  '/api/v1/external-feeds': 'malformed generated SQL — syntax error at or near "null"',

  // ── Thrown object literals, so 404 becomes 500 ───────────────────────────
  //
  // Both blog entries are fixed. `throw { statusCode: 404, ... }` is not an
  // Error, so error-handler.ts fell through to its 500 branch and every
  // not-found was served as INTERNAL_ERROR. All six sites in routes/v1/blog.ts
  // throw AppError now — the other four are on POST/PUT/DELETE, which this
  // sweep never called, so they were failing the same way unobserved.

  // ── Application errors, nothing to do with SQL ───────────────────────────
  '/api/v1/analytics/cohort': 'TypeError: rawCohorts.rows is not iterable',
  '/api/v1/helpdesk/analytics':
    'TypeError: helpdeskTickets.as is not a function — a cast around the Drizzle API',
  '/api/v1/analytics/compare':
    'no authenticate preHandler, so req.user! is undefined; a missing querystring also 500s instead of 400',

  // ── Environment-dependent, arguably not defects ──────────────────────────
  // Needs credentials no test environment has. A GET that answers 500 for
  // missing configuration is still questionable — 501 or 503 would say more —
  // but it is not a code fault the sweep can act on.
  '/api/v1/integrations/allegro/connect': 'ALLEGRO_CLIENT_ID not configured in this environment',

  // A websocket endpoint. Reaching it over plain HTTP is meaningless; it fails
  // on `socket.close is not a function` because there is no upgraded socket.
  // Listed rather than filtered out of the sweep so the exception stays visible.
  '/api/v1/phone/softphone/ws': 'websocket route; a plain HTTP GET has no socket to close',
};

/**
 * Ceiling on the accepted holes. Six today: fourteen before the ai-agents
 * three, eleven before the two loyalty aggregates, cohorts, and the two blog
 * revision routes. Lowering it never needs permission; raising it should be a
 * conscious decision with a reason above.
 */
export const MAX_KNOWN_5XX = 6;
