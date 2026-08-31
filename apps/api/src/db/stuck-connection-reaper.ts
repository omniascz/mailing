/**
 * Watchdog for pool connections that wedge mid-protocol.
 *
 * ─── The failure ────────────────────────────────────────────────────────────
 *
 * Under a burst that saturates the pool, postgres.js can leave one connection
 * stuck after it has written Parse/Describe and before it writes Bind/Execute/
 * Sync. The backend has answered and is waiting for the client's next message,
 * which never comes. In `pg_stat_activity` that is:
 *
 *     state = 'active'   wait_event_type = 'Client'   wait_event = 'ClientRead'
 *
 * Nothing recovers from it. The request that owns the query never gets a
 * response — measured in CI as a route that logs `incoming request` and never
 * `request completed` — and the connection is never returned to the pool, so
 * the pool is permanently one connection smaller. Upstream has this open as
 * porsager/postgres#1033; 3.4.9 is the newest published release and does not
 * fix it.
 *
 * ─── Why no timeout catches it ──────────────────────────────────────────────
 *
 * Measured, one by one:
 *
 *   postgres.js idle_timeout   never armed (null by default) and would not
 *                              apply: the connection has a query assigned.
 *   postgres.js max_lifetime   calls end(), which waits for the in-flight
 *                              query — that is the one that never finishes.
 *   postgres.js connect_timeout covers the connect phase only; it is cancelled
 *                              once the connection is up.
 *   Fastify requestTimeout     is Node's server.requestTimeout: it bounds
 *                              receiving the request, not running the handler.
 *   Postgres statement_timeout does not fire — the backend is not executing
 *                              anything, it is waiting on the client. This one
 *                              is a mechanism, not a measurement: the timeout
 *                              bounds execution, and nothing is executing. (An
 *                              accompanying figure, "statement_timeout=2s left
 *                              4 of 6 runs hung", is withdrawn — see "How often"
 *                              below. The conclusion does not rest on it.)
 *
 * ─── What this does instead ─────────────────────────────────────────────────
 *
 * Ask the server. A backend that is `active` while waiting on `ClientRead` has
 * been handed a statement and is waiting for the rest of the conversation. A
 * healthy client finishes that conversation in microseconds, so anything still
 * in that state after `stuckAfterMs` is wedged by definition — and this is why
 * the check is safe in a way a blanket query timeout is not: a slow-but-healthy
 * query is `active` waiting on IO, on a lock, or on the CPU. It is never
 * waiting on the client. The threshold therefore does not have to be traded
 * off against the slowest legitimate query; it can afford to be short.
 *
 * The only legitimate way to sit in this state is an open cursor or a COPY
 * stream that the client is deliberately holding. `apps/api` uses neither, and
 * db/no-held-portals.test.ts is what keeps that true: it fails if either
 * appears anywhere this pool would carry it.
 *
 * Terminating the backend closes the socket, which is a state postgres.js does
 * handle: `closed()` rejects the in-flight query with CONNECTION_CLOSED, and
 * `onclose()` returns the connection to the pool and dispatches whatever was
 * queued behind it. The request fails loudly instead of hanging, and the pool
 * gets its connection back.
 *
 * The reaper holds its own one-connection client. It has to: the pool it is
 * rescuing is by definition saturated at the moment it is needed.
 *
 * ─── How often does this actually happen? UNKNOWN ───────────────────────────
 *
 * Read this before deleting any of it.
 *
 * Three separate things, and they are worth keeping apart:
 *
 *   The cause is real and still open. porsager/postgres#1033, filed
 *   2025-02-11, open as of 2026-08-31. 3.4.9 (2026-04-05) is the newest
 *   published release and does not fix it.
 *
 *   The failure was really observed. A route that logged `incoming request`
 *   and never `request completed`, with a backend of this pool sitting in
 *   active/Client/ClientRead. That is what this file was written for.
 *
 *   The FREQUENCY is not known. Not "low" — not known. An earlier version of
 *   the integration test claimed the race reproduces "in roughly two runs out
 *   of three"; that has been withdrawn, because on 2026-08-31 it did not
 *   reproduce once in more than 25 attempts across four shapes of load,
 *   including six runs of route-smoke with this watchdog switched off. The
 *   measurements are in mailforge-probes/README.md.
 *
 * So the honest summary is: a real defect with an open upstream ticket, whose
 * rate of occurrence nobody here can currently state. Whether that rate is
 * zero on the deployment you are looking at, or merely small enough that you
 * have not hit it yet, this evidence cannot tell you apart.
 *
 * That asymmetry is the argument for keeping it. The cost is one connection,
 * one query per interval against pg_stat_activity, and this file. The cost of
 * being wrong the other way is a request that never answers and a pool that is
 * permanently one connection smaller, which is exactly the failure that is
 * hardest to diagnose from the outside — nothing errors, nothing logs, a
 * counter simply goes down and stays down.
 *
 * The event that justifies removing this is upstream fixing #1033 and the
 * dependency being raised past it — not a quiet period, and not a failed
 * attempt to reproduce the race. If you do remove it, note that
 * db/no-held-portals.test.ts exists only to protect the assumption this file
 * relies on (that nothing here holds a portal open), and goes with it; and
 * that `DB_STUCK_CONNECTION_REAPER=off` already switches this off without a
 * deploy, which is the cheaper experiment.
 */
import postgres from 'postgres';

/**
 * `application_name` of the pool this watchdog is responsible for. The reaper
 * terminates backends by pid, so the scope has to be narrow enough that it can
 * never touch a session belonging to anything else on the same database —
 * another service, a migration, a human with psql open.
 */
export const POOL_APPLICATION_NAME = 'forgemsg-api';

/** `application_name` the watchdog's own connection uses, so it cannot reap itself. */
export const REAPER_APPLICATION_NAME = 'forgemsg-api-stuck-reaper';

export interface ReaperConfig {
  enabled: boolean;
  /** How long a backend may sit in active/ClientRead before it counts as wedged. */
  stuckAfterMs: number;
  /** How often to look. */
  intervalMs: number;
}

export const REAPER_DEFAULTS = {
  stuckAfterMs: 15_000,
  intervalMs: 5_000,
} as const;

export interface StuckBackend {
  pid: number;
  query: string;
  stuckMs: number;
}

export interface ReaperLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * Read the two knobs straight from the environment rather than through
 * config/env.ts. This is an operational safety net, not product configuration:
 * it has to be switchable in a deployment that is already on fire, without a
 * schema change, and it must have a working default when nothing is set.
 */
export function readReaperConfig(env: NodeJS.ProcessEnv = process.env): ReaperConfig {
  const enabled = env.DB_STUCK_CONNECTION_REAPER !== 'off';
  const stuckAfterMs = positiveInt(env.DB_STUCK_CONNECTION_MS, REAPER_DEFAULTS.stuckAfterMs);
  // Look often enough that the wait is bounded by the threshold rather than by
  // the polling gap, and never more often than once a second.
  const intervalMs = Math.max(
    1_000,
    Math.min(REAPER_DEFAULTS.intervalMs, Math.floor(stuckAfterMs / 3)),
  );
  return { enabled, stuckAfterMs, intervalMs };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Backends of our pool that are wedged: handed a statement, answered, and now
 * waiting on a client message that is not coming.
 *
 * `state_change` is when the backend entered `active`, so the age of that
 * transition is how long the statement has been in flight. Anything younger
 * than the threshold is a query that is simply still being served.
 */
export async function findStuckBackends(
  sql: postgres.Sql,
  cfg: Pick<ReaperConfig, 'stuckAfterMs'>,
): Promise<StuckBackend[]> {
  const rows = await sql<Array<{ pid: number; query: string; stuck_ms: number }>>`
    SELECT
      pid,
      left(query, 300) AS query,
      (EXTRACT(EPOCH FROM (now() - state_change)) * 1000)::bigint AS stuck_ms
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND application_name = ${POOL_APPLICATION_NAME}
      AND pid <> pg_backend_pid()
      AND state = 'active'
      AND wait_event_type = 'Client'
      AND wait_event = 'ClientRead'
      AND state_change < now() - make_interval(secs => ${cfg.stuckAfterMs / 1000})
  `;
  return rows.map((r) => ({ pid: Number(r.pid), query: r.query, stuckMs: Number(r.stuck_ms) }));
}

/** One pass. Returns the backends it terminated, so callers can assert on it. */
export async function reapOnce(
  sql: postgres.Sql,
  cfg: Pick<ReaperConfig, 'stuckAfterMs'>,
  log: ReaperLogger,
): Promise<StuckBackend[]> {
  const stuck = await findStuckBackends(sql, cfg);
  const killed: StuckBackend[] = [];

  for (const backend of stuck) {
    // Terminate rather than cancel. pg_cancel_backend interrupts a running
    // statement; this backend is not running one, it is waiting on the socket,
    // so a cancel is ignored. Closing the connection is the only thing that
    // both frees the slot and makes the client's promise settle.
    const [row] = await sql<Array<{ terminated: boolean }>>`
      SELECT pg_terminate_backend(${backend.pid}) AS terminated
    `;
    if (row?.terminated) killed.push(backend);
    log.warn(
      {
        pid: backend.pid,
        stuckMs: backend.stuckMs,
        terminated: !!row?.terminated,
        query: backend.query,
      },
      'terminated a database connection wedged in active/ClientRead',
    );
  }

  return killed;
}

export interface StuckConnectionReaper {
  /** Runs one pass immediately, outside the schedule. For tests. */
  tick: () => Promise<StuckBackend[]>;
  stop: () => Promise<void>;
}

/**
 * Start the watchdog. Returns a handle even when disabled, so callers do not
 * have to branch; the disabled handle is inert.
 */
export function startStuckConnectionReaper(
  connectionString: string,
  cfg: ReaperConfig,
  log: ReaperLogger,
): StuckConnectionReaper {
  if (!cfg.enabled) {
    return { tick: async () => [], stop: async () => {} };
  }

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    connection: { application_name: REAPER_APPLICATION_NAME },
  });

  let stopped = false;
  let inFlight: Promise<StuckBackend[]> = Promise.resolve([]);

  const tick = async (): Promise<StuckBackend[]> => {
    if (stopped) return [];
    inFlight = reapOnce(sql, cfg, log).catch((err: unknown) => {
      // A watchdog that throws takes the process with it, which is strictly
      // worse than the problem it exists for. Log and try again next tick.
      log.error({ err: (err as Error).message }, 'stuck-connection reaper pass failed');
      return [];
    });
    return inFlight;
  };

  const timer = setInterval(() => void tick(), cfg.intervalMs);
  // Never hold the process open for this.
  timer.unref?.();

  return {
    tick,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await inFlight.catch(() => []);
      await sql.end({ timeout: 5 });
    },
  };
}
