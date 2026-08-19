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
  // `UNDEFINED_VALUE: Undefined values are not allowed`. One root cause, three
  // routes; the query dies before it reaches Postgres.
  '/api/v1/ai-agents': 'UNDEFINED_VALUE: undefined bound into the ai_agents query',
  '/api/v1/ai-agents/{id}': 'UNDEFINED_VALUE: same root cause as /api/v1/ai-agents',
  '/api/v1/ai-agents/{id}/runs': 'UNDEFINED_VALUE: same root cause, over ai_agent_runs',

  // ── Broken SQL that the EXPLAIN layers cannot reach ──────────────────────
  // `FILTER specified, but abs is not an aggregate function` — the FILTER is
  // attached to abs() instead of the sum() inside it. Invisible to layer 1
  // because it lives in a fragment, not a whole statement, and not a schema
  // fault so layer 2's guard correctly lets it through to Postgres.
  '/api/v1/loyalty/programs/{programId}/analytics/overview':
    'abs(sum(points)) FILTER (...) — FILTER attached to abs(), not to sum()',
  '/api/v1/loyalty/programs/{programId}/members/{memberId}/ledger/summary':
    'abs(sum(points)) FILTER (...) — same shape as the overview route',

  // `syntax error at or near "$5"` — EXTRACT(EPOCH FROM INTERVAL $5); INTERVAL
  // does not take a bind parameter. `AS offset` in GROUP BY is a second fault
  // behind it, offset being reserved.
  '/api/v1/analytics/cohorts':
    'INTERVAL cannot take a bind parameter; also `AS offset` is reserved',

  // `syntax error at or near "null"` in the external_feeds select.
  '/api/v1/external-feeds': 'malformed generated SQL — syntax error at or near "null"',

  // ── Thrown object literals, so 404 becomes 500 ───────────────────────────
  // `throw { statusCode: 404, ... }` throws a plain object, not an Error.
  // Fastify does not recognise it, so every not-found on these routes is
  // answered 500. Six sites in routes/v1/blog.ts; these two are the GETs.
  '/api/v1/blog/posts/{id}/revisions': 'throws an object literal, so 404 is served as 500',
  '/api/v1/blog/posts/{id}/revisions/{vA}/diff/{vB}':
    'throws an object literal, so 404 is served as 500',

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
 * Ceiling on the accepted holes. Fourteen today. Lowering it never needs
 * permission; raising it should be a conscious decision with a reason above.
 */
export const MAX_KNOWN_5XX = 14;
